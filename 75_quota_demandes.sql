-- ============================================================
-- Demandes de contact — 5 par jour en formule Gratuite
-- ============================================================
-- POURQUOI UN QUOTA, ET POURQUOI PAS UN VERROU
--
-- Sans limite, un seul compte gratuit peut solliciter des centaines de
-- membres en une soirée. C'est le schéma classique de l'envoi en masse :
-- on invite tout le monde en espérant que 2 % répondent. Les
-- destinataires reçoivent des demandes manifestement automatiques, et
-- c'est la plateforme qui récolte les signalements.
--
-- Réserver les demandes aux formules payantes règlerait le problème,
-- mais priverait un nouvel inscrit du seul geste qui donne envie de
-- rester. Cinq par jour suffisent à une démarche sincère, et rendent
-- l'envoi en masse impraticable.
--
-- LE COMPTE EST FAIT EN BASE, JAMAIS DANS LE NAVIGATEUR. Une limite
-- vérifiée côté interface se contourne en rejouant l'appel : le quota
-- doit vivre dans la fonction qui écrit.
--
-- CE QUI EST COMPTÉ : les demandes ENVOYÉES dans les 24 heures
-- glissantes. Une demande annulée reste comptée — sinon on enverrait,
-- annulerait, renverrait indéfiniment, et le quota ne servirait à rien.
--
-- ⚠️ Requiert la migration 70.

INSERT INTO public.app_settings (key, value, label) VALUES
  ('demandes_max_gratuit', '5'::jsonb,
   'Demandes de contact par jour — formule Gratuite')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- Journal des envois — indépendant de `contact_requests`
-- ------------------------------------------------------------
-- Une demande annulée disparaît de `contact_requests` : compter dessus
-- laisserait le quota se réinitialiser à chaque annulation. Ce journal
-- ne s'efface pas.
CREATE TABLE IF NOT EXISTS public.demandes_envois (
  id        bigserial PRIMARY KEY,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  envoye_le timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS demandes_envois_idx
  ON public.demandes_envois (sender_id, envoye_le DESC);

ALTER TABLE public.demandes_envois ENABLE ROW LEVEL SECURITY;
-- Aucune politique : alimenté par la fonction ci-dessous uniquement.

-- ------------------------------------------------------------
-- Envoyer, avec quota
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.envoyer_demande(
  p_destinataire uuid,
  p_message      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_moi     uuid := auth.uid();
  v_statut  text;
  v_id      uuid;
  v_max     integer;
  v_utilise integer;
BEGIN
  IF v_moi IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'non_connecte');
  END IF;

  IF p_destinataire IS NULL OR p_destinataire = v_moi THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'destinataire_invalide');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_destinataire) THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'introuvable');
  END IF;

  IF public.blocage_entre(v_moi, p_destinataire) THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'bloque');
  END IF;

  SELECT status, id INTO v_statut, v_id
  FROM public.contact_requests
  WHERE sender_id = v_moi AND receiver_id = p_destinataire;

  IF v_statut IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'deja_envoyee', 'statut', v_statut);
  END IF;

  -- Demande croisée : l'autre m'a déjà sollicité. Accepter la sienne ne
  -- consomme PAS de quota — c'est une réponse, pas une sollicitation.
  UPDATE public.contact_requests
  SET status = 'accepted', responded_at = now()
  WHERE sender_id = p_destinataire AND receiver_id = v_moi AND status = 'pending'
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'statut', 'accepted', 'croisee', true);
  END IF;

  -- ── Le quota ──
  -- Formules payantes : sans limite. Le contrôle ne s'applique qu'au
  -- niveau 0, et `effective_level` tient compte de l'expiration.
  IF public.effective_level(v_moi) = 0 THEN
    SELECT COALESCE((value #>> '{}')::integer, 5) INTO v_max
    FROM public.app_settings WHERE key = 'demandes_max_gratuit';

    SELECT count(*)::integer INTO v_utilise
    FROM public.demandes_envois
    WHERE sender_id = v_moi AND envoye_le >= now() - interval '24 hours';

    IF v_utilise >= COALESCE(v_max, 5) THEN
      RETURN jsonb_build_object(
        'ok', false, 'raison', 'quota_atteint',
        'max', COALESCE(v_max, 5),
        'utilise', v_utilise,
        -- L'heure du prochain envoi possible : « demain » est faux quand
        -- la fenêtre est glissante, et un membre qui revient le matin
        -- pour se voir refuser à nouveau ne comprend pas pourquoi.
        'prochain', (SELECT min(envoye_le) + interval '24 hours'
                     FROM public.demandes_envois
                     WHERE sender_id = v_moi
                       AND envoye_le >= now() - interval '24 hours')
      );
    END IF;
  END IF;

  INSERT INTO public.contact_requests (sender_id, receiver_id, message)
  VALUES (v_moi, p_destinataire, NULLIF(trim(COALESCE(p_message, '')), ''))
  RETURNING id INTO v_id;

  INSERT INTO public.demandes_envois (sender_id) VALUES (v_moi);

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'statut', 'pending');
END;
$$;

-- ------------------------------------------------------------
-- Ce qu'il reste — pour l'afficher AVANT le refus
-- ------------------------------------------------------------
-- Annoncer « il te reste 2 demandes » vaut mieux qu'un refus sec au
-- sixième clic : on décide alors à qui les adresser.
CREATE OR REPLACE FUNCTION public.quota_demandes()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_moi     uuid := auth.uid();
  v_max     integer;
  v_utilise integer;
BEGIN
  IF v_moi IS NULL THEN
    RETURN jsonb_build_object('illimite', false, 'restant', 0);
  END IF;

  IF public.effective_level(v_moi) > 0 THEN
    RETURN jsonb_build_object('illimite', true);
  END IF;

  SELECT COALESCE((value #>> '{}')::integer, 5) INTO v_max
  FROM public.app_settings WHERE key = 'demandes_max_gratuit';

  SELECT count(*)::integer INTO v_utilise
  FROM public.demandes_envois
  WHERE sender_id = v_moi AND envoye_le >= now() - interval '24 hours';

  RETURN jsonb_build_object(
    'illimite', false,
    'max', COALESCE(v_max, 5),
    'utilise', v_utilise,
    'restant', GREATEST(0, COALESCE(v_max, 5) - v_utilise)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.quota_demandes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quota_demandes() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Contrôle
-- ------------------------------------------------------------
SELECT
  (SELECT value #>> '{}' FROM public.app_settings WHERE key = 'demandes_max_gratuit') AS max_gratuit,
  (SELECT count(*) FROM public.demandes_envois) AS envois_journalises;

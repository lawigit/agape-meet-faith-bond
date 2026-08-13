-- ============================================================
-- Demandes de contact — distinctes des likes
-- ============================================================
-- DEUX GESTES QUI N'ONT RIEN À VOIR
--
-- Un LIKE est un signal de séduction : il part d'un balayage, il est
-- silencieux, et il ne devient visible que s'il est réciproque. Il vit
-- dans `swipes`, et se consulte dans « M'ont aimé ».
--
-- Une DEMANDE DE CONTACT est explicite : on choisit quelqu'un, on le
-- sollicite nommément, et l'autre répond oui ou non. Elle a un émetteur,
-- un destinataire, un état, et une date de réponse.
--
-- Les confondre — ce que je faisais — revenait à présenter des likes
-- reçus comme des demandes envoyées. Rien ne s'y raccrochait : on ne
-- peut ni « annuler » un like, ni le voir « refusé ».
--
-- CE QUE LE DEMANDEUR VOIT DE SON REFUS
--
-- Contrairement aux likes écartés — dont la table reste privée à celui
-- qui écarte — une demande de contact appartient AUSSI à son émetteur :
-- c'est sa ligne, il la voit changer d'état. Le refus lui est donc
-- visible. C'est un choix de produit assumé : une demande explicite
-- appelle une réponse explicite, et laisser quelqu'un attendre
-- indéfiniment est une autre forme de brutalité.
--
-- ⚠️ AJOUT PUR : une table et ses fonctions. Rien n'est modifié.

-- ------------------------------------------------------------
-- 1. La table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message      text,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'accepted', 'refused')),
  created_at   timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  responded_at timestamp with time zone,

  -- Une seule demande par couple : sans cela, un refus se contournerait
  -- en renvoyant la même demande en boucle.
  UNIQUE (sender_id, receiver_id),
  CHECK (sender_id <> receiver_id)
);

CREATE INDEX IF NOT EXISTS contact_requests_receiver_idx
  ON public.contact_requests (receiver_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS contact_requests_sender_idx
  ON public.contact_requests (sender_id, status, created_at DESC);

ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;

-- Les deux parties voient la ligne : l'émetteur suit sa demande, le
-- destinataire la traite.
DROP POLICY IF EXISTS "Voir ses demandes de contact" ON public.contact_requests;
CREATE POLICY "Voir ses demandes de contact"
ON public.contact_requests FOR SELECT TO authenticated
USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- Aucune politique d'écriture : tout passe par les fonctions ci-dessous.
-- Une écriture directe permettrait de se déclarer accepté chez autrui.

-- ------------------------------------------------------------
-- 2. Envoyer
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

  -- Le blocage vaut dans LES DEUX SENS : ni celui qui bloque ni celui
  -- qui est bloqué ne doivent pouvoir se solliciter.
  IF public.blocage_entre(v_moi, p_destinataire) THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'bloque');
  END IF;

  -- Une demande existante fait foi. On ne la remplace pas : renvoyer une
  -- demande après un refus reviendrait à insister, et la contrainte
  -- d'unicité est là pour l'empêcher.
  SELECT status, id INTO v_statut, v_id
  FROM public.contact_requests
  WHERE sender_id = v_moi AND receiver_id = p_destinataire;

  IF v_statut IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'deja_envoyee', 'statut', v_statut);
  END IF;

  -- Demande croisée : l'autre m'a déjà sollicité. Plutôt que d'ouvrir un
  -- second fil, on accepte la sienne — c'est ce que les deux veulent.
  UPDATE public.contact_requests
  SET status = 'accepted', responded_at = now()
  WHERE sender_id = p_destinataire AND receiver_id = v_moi AND status = 'pending'
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'statut', 'accepted', 'croisee', true);
  END IF;

  INSERT INTO public.contact_requests (sender_id, receiver_id, message)
  VALUES (v_moi, p_destinataire, NULLIF(trim(COALESCE(p_message, '')), ''))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'statut', 'pending');
END;
$$;

-- ------------------------------------------------------------
-- 3. Répondre — réservé au destinataire
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.repondre_demande(
  p_demande uuid,
  p_accepte boolean
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_moi uuid := auth.uid();
  v_n   integer;
BEGIN
  IF v_moi IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'non_connecte');
  END IF;

  -- `status = 'pending'` dans la clause : une demande déjà tranchée ne
  -- se rejuge pas, et deux clics rapides ne produisent qu'un seul effet.
  UPDATE public.contact_requests
  SET status = CASE WHEN p_accepte THEN 'accepted' ELSE 'refused' END,
      responded_at = now()
  WHERE id = p_demande AND receiver_id = v_moi AND status = 'pending';

  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'introuvable_ou_deja_traitee');
  END IF;

  RETURN jsonb_build_object('ok', true, 'statut',
    CASE WHEN p_accepte THEN 'accepted' ELSE 'refused' END);
END;
$$;

-- ------------------------------------------------------------
-- 4. Annuler — réservé à l'émetteur, tant que rien n'est décidé
-- ------------------------------------------------------------
-- La ligne est SUPPRIMÉE, pas marquée. Tant qu'elle existe, la demande
-- reste affichée chez le destinataire : la retirer de sa liste est
-- exactement ce qu'« annuler » veut dire.
--
-- Effet de bord voulu : la contrainte d'unicité se libère, donc une
-- demande annulée peut être renvoyée plus tard. Un refus, lui, reste.
CREATE OR REPLACE FUNCTION public.annuler_demande(p_demande uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_moi uuid := auth.uid();
  v_n   integer;
BEGIN
  IF v_moi IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'non_connecte');
  END IF;

  DELETE FROM public.contact_requests
  WHERE id = p_demande AND sender_id = v_moi AND status = 'pending';

  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'introuvable_ou_deja_traitee');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ------------------------------------------------------------
-- 5. La page /demandes en un appel
-- ------------------------------------------------------------
-- Trois listes servies ensemble : sans cela, la page enchaînerait une
-- requête par onglet, plus une par lot de profils.
CREATE OR REPLACE FUNCTION public.mes_demandes()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_moi uuid := auth.uid();
BEGIN
  IF v_moi IS NULL THEN
    RETURN jsonb_build_object('error', 'non_connecte');
  END IF;

  RETURN jsonb_build_object(
    'recues', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'autre_id', p.id, 'statut', c.status,
        'message', c.message, 'created_at', c.created_at,
        'prenom', p.first_name, 'nom', p.last_name,
        'ville', p.city, 'naissance', p.birth_date,
        'photos', p.photos, 'bio', p.bio, 'verifie', p.is_verified
      ) ORDER BY c.created_at DESC)
      FROM public.contact_requests c
      JOIN public.profiles p ON p.id = c.sender_id
      WHERE c.receiver_id = v_moi
        AND NOT public.blocage_entre(v_moi, c.sender_id)
    ), '[]'::jsonb),

    'envoyees', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'autre_id', p.id, 'statut', c.status,
        'message', c.message, 'created_at', c.created_at,
        'prenom', p.first_name, 'nom', p.last_name,
        'ville', p.city, 'naissance', p.birth_date,
        'photos', p.photos, 'bio', p.bio, 'verifie', p.is_verified
      ) ORDER BY c.created_at DESC)
      FROM public.contact_requests c
      JOIN public.profiles p ON p.id = c.receiver_id
      WHERE c.sender_id = v_moi
        AND NOT public.blocage_entre(v_moi, c.receiver_id)
    ), '[]'::jsonb),

    -- Un contact est une demande acceptée, quel qu'en soit le sens :
    -- une fois le lien établi, savoir qui a sollicité l'autre n'a plus
    -- d'intérêt.
    'contacts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'autre_id', p.id, 'statut', 'accepted',
        'created_at', COALESCE(c.responded_at, c.created_at),
        'prenom', p.first_name, 'nom', p.last_name,
        'ville', p.city, 'naissance', p.birth_date,
        'photos', p.photos, 'bio', p.bio, 'verifie', p.is_verified
      ) ORDER BY COALESCE(c.responded_at, c.created_at) DESC)
      FROM public.contact_requests c
      JOIN public.profiles p
        ON p.id = CASE WHEN c.sender_id = v_moi THEN c.receiver_id ELSE c.sender_id END
      WHERE c.status = 'accepted'
        AND (c.sender_id = v_moi OR c.receiver_id = v_moi)
        AND NOT public.blocage_entre(v_moi, p.id)
    ), '[]'::jsonb)
  );
END;
$$;

-- ------------------------------------------------------------
-- 6. État vis-à-vis d'un profil — pour le bouton « Ajouter »
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.etat_demande(p_autre uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_moi uuid := auth.uid();
  v_r   record;
BEGIN
  IF v_moi IS NULL OR p_autre IS NULL THEN
    RETURN jsonb_build_object('etat', 'aucun');
  END IF;

  SELECT id, status, sender_id INTO v_r
  FROM public.contact_requests
  WHERE (sender_id = v_moi AND receiver_id = p_autre)
     OR (sender_id = p_autre AND receiver_id = v_moi)
  LIMIT 1;

  IF v_r.id IS NULL THEN
    RETURN jsonb_build_object('etat', 'aucun');
  END IF;

  RETURN jsonb_build_object(
    'etat', v_r.status,
    'id', v_r.id,
    -- Qui a sollicité l'autre décide du bouton : « Annuler » pour celui
    -- qui a envoyé, « Répondre » pour celui qui a reçu.
    'je_suis_emetteur', v_r.sender_id = v_moi
  );
END;
$$;

-- ------------------------------------------------------------
-- 7. Droits
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.envoyer_demande(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repondre_demande(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.annuler_demande(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mes_demandes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.etat_demande(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.envoyer_demande(uuid, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.repondre_demande(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.annuler_demande(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.mes_demandes()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.etat_demande(uuid)           TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Contrôle
-- ------------------------------------------------------------
SELECT
  (SELECT count(*) FROM public.contact_requests)                          AS demandes,
  (SELECT count(*) FROM public.contact_requests WHERE status = 'pending') AS en_attente,
  (SELECT count(*) FROM public.contact_requests WHERE status = 'accepted') AS acceptees;

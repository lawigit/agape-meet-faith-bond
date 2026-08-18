-- ============================================================
-- Deux quotas qui échappaient à /admin/parametres
-- ============================================================
-- LE DÉFAUT
--
-- La grille « Limites et quotas par offre » se construit à partir de
-- clés nommées `<quota>_l<palier>`. Deux réglages ne suivaient pas cette
-- forme, et n'apparaissaient donc nulle part :
--
--   • `demandes_max_gratuit` (migration 75) — clé unique, sans palier.
--     Modifiable en SQL seulement, ce qui revient à ne pas l'être.
--   • `quota_posts_l*` (migration 81) — au bon format, mais la page ne
--     connaît que les lignes qu'on lui a déclarées. Corrigé côté code.
--
-- CE QUE FAIT CETTE MIGRATION
--
-- Elle aligne les demandes de contact sur la convention commune, en
-- REPORTANT la valeur déjà en place avant de supprimer l'ancienne clé.
-- C'est le principe posé par la migration 33 : deux champs qui pilotent
-- la même chose finissent toujours par se contredire.
--
-- Effet de bord voulu : les formules payantes deviennent limitables.
-- Elles restent à `-1` (illimité), mais si la modération l'exige un
-- jour, le réglage existe — il n'y avait aucun moyen de le faire avant.
--
-- ⚠️ Requiert les migrations 70, 75 et 77.

-- ------------------------------------------------------------
-- 1. Les cinq clés, à partir de la valeur déjà en service
-- ------------------------------------------------------------
INSERT INTO public.app_settings (key, value, label) VALUES
  ('quota_demandes_l0', '5'::jsonb,  'Demandes de contact/24 h — Gratuit'),
  ('quota_demandes_l1', '-1'::jsonb, 'Demandes de contact/24 h — Premium 15 jours'),
  ('quota_demandes_l2', '-1'::jsonb, 'Demandes de contact/24 h — Premium 1 mois'),
  ('quota_demandes_l3', '-1'::jsonb, 'Demandes de contact/24 h — Premium 3 mois'),
  ('quota_demandes_l4', '-1'::jsonb, 'Demandes de contact/24 h — VIP')
ON CONFLICT (key) DO NOTHING;

-- Report : si la valeur avait été ajustée en base, elle aurait été perdue.
UPDATE public.app_settings s SET value = old.value
FROM public.app_settings old
WHERE s.key = 'quota_demandes_l0' AND old.key = 'demandes_max_gratuit';

DELETE FROM public.app_settings WHERE key = 'demandes_max_gratuit';

-- ------------------------------------------------------------
-- 2. `envoyer_demande` lit la clé du palier
-- ------------------------------------------------------------
-- Reprise intégrale de la version de la migration 77 : seul le bloc du
-- quota change. Une fonction se remplace en entier, il n'y a pas de
-- demi-mesure — d'où la longueur.
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
  v_match   uuid;
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

  -- Demande croisée. N'entame PAS le quota : c'est une réponse.
  UPDATE public.contact_requests
  SET status = 'accepted', responded_at = now()
  WHERE sender_id = p_destinataire AND receiver_id = v_moi AND status = 'pending'
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    SELECT id INTO v_match
    FROM public.matches
    WHERE (user1_id = v_moi AND user2_id = p_destinataire)
       OR (user1_id = p_destinataire AND user2_id = v_moi)
    LIMIT 1;

    IF v_match IS NULL THEN
      INSERT INTO public.matches (user1_id, user2_id)
      VALUES (v_moi, p_destinataire)
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_match;
    END IF;

    RETURN jsonb_build_object('ok', true, 'statut', 'accepted',
                              'croisee', true, 'match_id', v_match);
  END IF;

  -- ── Le quota, désormais par palier ──
  -- `-1` = illimité, comme partout. Le test ne porte plus sur « niveau
  -- 0 » : c'est la valeur du réglage qui décide, sans quoi les clés
  -- posées pour les paliers payants ne seraient jamais lues.
  v_max := public.setting_int('quota_demandes_l' || public.effective_level(v_moi)::text, -1);

  IF v_max >= 0 THEN
    SELECT count(*)::integer INTO v_utilise
    FROM public.demandes_envois
    WHERE sender_id = v_moi AND envoye_le >= now() - interval '24 hours';

    IF v_utilise >= v_max THEN
      RETURN jsonb_build_object(
        'ok', false, 'raison', 'quota_atteint',
        'max', v_max, 'utilise', v_utilise,
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

REVOKE ALL ON FUNCTION public.envoyer_demande(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.envoyer_demande(uuid, text) TO authenticated;

-- ------------------------------------------------------------
-- 3. `quota_demandes` suit la même règle
-- ------------------------------------------------------------
-- Les deux DOIVENT lire la même clé : annoncer « il te reste 2 demandes »
-- puis refuser au premier clic serait pire que de ne rien annoncer.
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

  v_max := public.setting_int('quota_demandes_l' || public.effective_level(v_moi)::text, -1);

  IF v_max < 0 THEN
    RETURN jsonb_build_object('illimite', true);
  END IF;

  SELECT count(*)::integer INTO v_utilise
  FROM public.demandes_envois
  WHERE sender_id = v_moi AND envoye_le >= now() - interval '24 hours';

  RETURN jsonb_build_object(
    'illimite', false,
    'max', v_max,
    'utilise', v_utilise,
    'restant', GREATEST(0, v_max - v_utilise)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.quota_demandes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quota_demandes() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Contrôle
-- ------------------------------------------------------------
-- La première requête doit renvoyer 10 lignes (5 demandes + 5 posts),
-- la seconde AUCUNE : l'ancienne clé ne doit plus exister.
SELECT key, value FROM public.app_settings
WHERE key LIKE 'quota_demandes_%' OR key LIKE 'quota_posts_%'
ORDER BY key;

SELECT key FROM public.app_settings WHERE key = 'demandes_max_gratuit';

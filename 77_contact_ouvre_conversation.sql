-- ============================================================
-- Une demande acceptée ouvre une conversation
-- ============================================================
-- LE DÉFAUT
--
-- Accepter une demande de contact ne créait RIEN d'autre qu'un
-- changement de statut. Or toute la messagerie repose sur `matches` :
-- une conversation, un appel, un message vocal, tout est rattaché à un
-- match.
--
-- Deux personnes « en contact » n'avaient donc aucune conversation. Le
-- bouton « Message » menait à la liste des conversations, où la personne
-- ne figurait pas. Rien ne l'indiquait : on cherchait un nom absent.
--
-- CE QUI EST CORRIGÉ
--
-- L'acceptation crée le match s'il n'existe pas. « Être en contact »
-- signifie désormais ce que le membre comprend : on peut s'écrire.
--
-- POURQUOI RÉUTILISER `matches` PLUTÔT QUE CRÉER AUTRE CHOSE
--
-- Messages, appels, archivage, blocage, comptage des non-lus, pastilles,
-- notifications push — une dizaine de mécanismes lisent déjà `matches`.
-- Introduire un second type de conversation aurait obligé à les modifier
-- tous, et le premier oublié aurait produit un bogue silencieux.
--
-- ⚠️ Requiert les migrations 70 et 15.

-- ------------------------------------------------------------
-- 1. Créer le match à l'acceptation
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.repondre_demande(
  p_demande uuid,
  p_accepte boolean
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_moi     uuid := auth.uid();
  v_n       integer;
  v_autre   uuid;
  v_match   uuid;
BEGIN
  IF v_moi IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'non_connecte');
  END IF;

  UPDATE public.contact_requests
  SET status = CASE WHEN p_accepte THEN 'accepted' ELSE 'refused' END,
      responded_at = now()
  WHERE id = p_demande AND receiver_id = v_moi AND status = 'pending'
  RETURNING sender_id INTO v_autre;

  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'introuvable_ou_deja_traitee');
  END IF;

  IF NOT p_accepte THEN
    RETURN jsonb_build_object('ok', true, 'statut', 'refused');
  END IF;

  -- Le match, dans les deux sens : deux personnes peuvent déjà s'être
  -- likées réciproquement avant la demande de contact, et un second
  -- match ferait deux conversations pour la même relation.
  SELECT id INTO v_match
  FROM public.matches
  WHERE (user1_id = v_moi AND user2_id = v_autre)
     OR (user1_id = v_autre AND user2_id = v_moi)
  LIMIT 1;

  IF v_match IS NULL THEN
    INSERT INTO public.matches (user1_id, user2_id)
    VALUES (v_moi, v_autre)
    -- L'index d'unicité de la migration 29 protège des courses : deux
    -- acceptations simultanées ne créeront pas deux conversations.
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_match;

    IF v_match IS NULL THEN
      SELECT id INTO v_match
      FROM public.matches
      WHERE (user1_id = v_moi AND user2_id = v_autre)
         OR (user1_id = v_autre AND user2_id = v_moi)
      LIMIT 1;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'statut', 'accepted', 'match_id', v_match);
END;
$$;

REVOKE ALL ON FUNCTION public.repondre_demande(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repondre_demande(uuid, boolean) TO authenticated;

-- ------------------------------------------------------------
-- 2. Même chose pour la demande CROISÉE
-- ------------------------------------------------------------
-- `envoyer_demande` accepte automatiquement la demande de l'autre quand
-- elle existe déjà. Ce chemin doit ouvrir la conversation lui aussi,
-- sinon deux personnes se retrouvent « en contact » sans pouvoir
-- s'écrire — et par le geste le plus naturel qui soit.
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

  IF public.effective_level(v_moi) = 0 THEN
    SELECT COALESCE((value #>> '{}')::integer, 5) INTO v_max
    FROM public.app_settings WHERE key = 'demandes_max_gratuit';

    SELECT count(*)::integer INTO v_utilise
    FROM public.demandes_envois
    WHERE sender_id = v_moi AND envoye_le >= now() - interval '24 hours';

    IF v_utilise >= COALESCE(v_max, 5) THEN
      RETURN jsonb_build_object(
        'ok', false, 'raison', 'quota_atteint',
        'max', COALESCE(v_max, 5), 'utilise', v_utilise,
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
-- 3. Rattrapage des contacts déjà acceptés
-- ------------------------------------------------------------
-- Sans cela, les personnes acceptées AVANT cette migration resteraient
-- « en contact » sans conversation — exactement le défaut corrigé ici,
-- mais figé pour elles.
INSERT INTO public.matches (user1_id, user2_id)
SELECT c.sender_id, c.receiver_id
FROM public.contact_requests c
WHERE c.status = 'accepted'
  AND NOT EXISTS (
    SELECT 1 FROM public.matches m
    WHERE (m.user1_id = c.sender_id AND m.user2_id = c.receiver_id)
       OR (m.user1_id = c.receiver_id AND m.user2_id = c.sender_id)
  )
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 4. `mes_demandes` renvoie l'identifiant de conversation
-- ------------------------------------------------------------
-- Le bouton « Message » doit ouvrir LA bonne conversation. Sans cet
-- identifiant, l'interface ne peut que renvoyer vers la liste, à charge
-- pour le membre d'y retrouver le nom lui-même.
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
        'photos', p.photos, 'bio', p.bio, 'verifie', p.is_verified,
        'match_id', (SELECT m.id FROM public.matches m
                     WHERE (m.user1_id = v_moi AND m.user2_id = p.id)
                        OR (m.user1_id = p.id AND m.user2_id = v_moi) LIMIT 1)
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
        'photos', p.photos, 'bio', p.bio, 'verifie', p.is_verified,
        'match_id', (SELECT m.id FROM public.matches m
                     WHERE (m.user1_id = v_moi AND m.user2_id = p.id)
                        OR (m.user1_id = p.id AND m.user2_id = v_moi) LIMIT 1)
      ) ORDER BY c.created_at DESC)
      FROM public.contact_requests c
      JOIN public.profiles p ON p.id = c.receiver_id
      WHERE c.sender_id = v_moi
        AND NOT public.blocage_entre(v_moi, c.receiver_id)
    ), '[]'::jsonb),

    'contacts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'autre_id', p.id, 'statut', 'accepted',
        'created_at', COALESCE(c.responded_at, c.created_at),
        'prenom', p.first_name, 'nom', p.last_name,
        'ville', p.city, 'naissance', p.birth_date,
        'photos', p.photos, 'bio', p.bio, 'verifie', p.is_verified,
        'match_id', (SELECT m.id FROM public.matches m
                     WHERE (m.user1_id = v_moi AND m.user2_id = p.id)
                        OR (m.user1_id = p.id AND m.user2_id = v_moi) LIMIT 1)
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

REVOKE ALL ON FUNCTION public.mes_demandes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mes_demandes() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Contrôle
-- ------------------------------------------------------------
SELECT
  (SELECT count(*) FROM public.contact_requests WHERE status = 'accepted') AS contacts,
  (SELECT count(*) FROM public.contact_requests c
    WHERE c.status = 'accepted'
      AND NOT EXISTS (
        SELECT 1 FROM public.matches m
        WHERE (m.user1_id = c.sender_id AND m.user2_id = c.receiver_id)
           OR (m.user1_id = c.receiver_id AND m.user2_id = c.sender_id)))
  AS sans_conversation;   -- doit valoir 0

-- ============================================================
-- Traçabilité des notifications push
-- ============================================================
-- CE QU'ON PEUT MESURER, ET CE QU'ON NE PEUT PAS
--
-- Une notification push n'a PAS d'équivalent du « taux d'ouverture »
-- d'un e-mail. Le pixel invisible qui sert à cela n'existe pas ici :
-- l'appareil affiche la notification sans rien nous dire.
--
-- Le CLIC, lui, est mesurable — et c'est de toute façon la seule chose
-- qui compte. Une notification vue et ignorée n'a rien produit ; une
-- notification cliquée a ramené quelqu'un dans l'application.
--
-- COMMENT, SANS TOUCHER AU SERVICE WORKER
--
-- L'identifiant de l'envoi est glissé dans l'URL de destination
-- (`/decouvrir?pn=1234`). Le service worker ouvre déjà cette URL telle
-- quelle : rien à modifier de son côté, donc rien à redéployer chez les
-- membres qui ont installé l'application — un service worker mis à jour
-- peut mettre des jours à se propager.
--
-- L'application lit ce paramètre au chargement, l'enregistre, et le
-- retire de la barre d'adresse.
--
-- ⚠️ Requiert la migration 73.

-- ------------------------------------------------------------
-- 1. Le clic
-- ------------------------------------------------------------
ALTER TABLE public.push_log
  ADD COLUMN IF NOT EXISTS clique_le timestamp with time zone;

CREATE INDEX IF NOT EXISTS push_log_modele_idx
  ON public.push_log (modele, envoye_le DESC);

-- ------------------------------------------------------------
-- 2. Enregistrer un clic
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marquer_push_clique(p_id bigint)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- `clique_le IS NULL` : on garde le PREMIER clic. Rouvrir l'onglet
  -- plus tard ne doit pas repousser la date et faire croire à un
  -- engagement plus récent qu'il n'est.
  --
  -- `user_id = auth.uid()` : sans cette clause, n'importe qui pourrait
  -- marquer les notifications d'autrui en devinant des identifiants
  -- séquentiels.
  UPDATE public.push_log
  SET clique_le = now()
  WHERE id = p_id
    AND user_id = auth.uid()
    AND clique_le IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.marquer_push_clique(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marquer_push_clique(bigint) TO authenticated;

-- ------------------------------------------------------------
-- 3. Le moteur glisse l'identifiant dans l'URL
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.push_engagement()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actif    boolean;
  v_h_debut  integer;
  v_h_fin    integer;
  v_jour     integer;
  v_semaine  integer;
  v_heure    integer := extract(hour FROM now())::integer;
  v_cible    record;
  v_msg      record;
  v_cle      text;
  v_id       bigint;
  v_url      text;
  v_envoyes  integer := 0;
BEGIN
  SELECT COALESCE((value #>> '{}')::boolean, false) INTO v_actif
  FROM public.app_settings WHERE key = 'push_engagement_actif';

  IF NOT COALESCE(v_actif, false) THEN
    RETURN jsonb_build_object('envoyes', 0, 'raison', 'desactive');
  END IF;

  SELECT COALESCE((value #>> '{}')::integer, 8)  INTO v_h_debut FROM public.app_settings WHERE key = 'push_heure_debut';
  SELECT COALESCE((value #>> '{}')::integer, 20) INTO v_h_fin   FROM public.app_settings WHERE key = 'push_heure_fin';
  SELECT COALESCE((value #>> '{}')::integer, 1)  INTO v_jour    FROM public.app_settings WHERE key = 'push_max_par_jour';
  SELECT COALESCE((value #>> '{}')::integer, 3)  INTO v_semaine FROM public.app_settings WHERE key = 'push_max_par_semaine';

  IF v_heure < COALESCE(v_h_debut, 8) OR v_heure > COALESCE(v_h_fin, 20) THEN
    RETURN jsonb_build_object('envoyes', 0, 'raison', 'heures_calmes', 'heure', v_heure);
  END IF;

  FOR v_cible IN
    WITH candidats AS (
      SELECT p.id, p.first_name,
             CASE
               WHEN public.effective_level(p.id) = 0
                    AND EXISTS (SELECT 1 FROM public.swipes s
                                WHERE s.target_id = p.id
                                  AND s.action IN ('like', 'superlike')
                                  AND s.created_at >= now() - interval '7 days')
               THEN 'premium'

               WHEN p.last_seen < now() - interval '10 days' THEN 'reveil'

               WHEN public.profile_completion(p.id) < 60 THEN 'profil'

               WHEN NOT EXISTS (SELECT 1 FROM public.swipes s
                                WHERE s.swiper_id = p.id
                                  AND s.created_at >= now() - interval '5 days')
               THEN 'demarrage'

               WHEN NOT EXISTS (SELECT 1 FROM public.community_posts c
                                WHERE c.user_id = p.id
                                  AND c.created_at >= now() - interval '14 days')
               THEN 'communaute'

               ELSE NULL
             END AS modele
      FROM public.profiles p
      WHERE p.push_engagement
        AND NOT public.is_suspended(p.id)
        AND EXISTS (SELECT 1 FROM public.push_subscriptions s WHERE s.user_id = p.id)
        AND (p.last_seen IS NULL OR p.last_seen < now() - interval '6 hours')
        AND NOT EXISTS (
          SELECT 1 FROM public.push_log l
          WHERE l.user_id = p.id AND l.envoye_le >= now() - interval '24 hours'
          HAVING count(*) >= COALESCE(v_jour, 1))
        AND NOT EXISTS (
          SELECT 1 FROM public.push_log l
          WHERE l.user_id = p.id AND l.envoye_le >= now() - interval '7 days'
          HAVING count(*) >= COALESCE(v_semaine, 3))
    )
    SELECT c.id, c.first_name, c.modele
    FROM candidats c
    WHERE c.modele IS NOT NULL
    LIMIT 200
  LOOP
    v_cle := v_cible.modele || ':' || v_cible.id::text || ':'
             || to_char(now(), 'IYYY-IW');

    SELECT titre, corps, url INTO v_msg
    FROM public.push_modeles
    WHERE modele = v_cible.modele AND actif
    ORDER BY random() LIMIT 1;

    IF v_msg.titre IS NULL THEN
      CONTINUE;
    END IF;

    -- L'INSERT sert aussi de verrou : si la clé existe déjà, aucune
    -- ligne n'est produite, `v_id` reste NULL et l'on passe au suivant.
    -- Une vérification préalable suivie d'un insert laisserait un
    -- intervalle où deux passages simultanés enverraient deux fois.
    v_id := NULL;
    INSERT INTO public.push_log (user_id, modele, cle_unique)
    VALUES (v_cible.id, v_cible.modele, v_cle)
    ON CONFLICT (cle_unique) DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Le marqueur de clic. `?` ou `&` selon que l'URL porte déjà des
    -- paramètres : coller un second « ? » casserait la destination.
    v_url := v_msg.url || CASE WHEN v_msg.url LIKE '%?%' THEN '&' ELSE '?' END
             || 'pn=' || v_id::text;

    PERFORM public.envoyer_push(
      v_cible.id, v_msg.titre, v_msg.corps, v_url, 'engagement'
    );

    v_envoyes := v_envoyes + 1;
  END LOOP;

  RETURN jsonb_build_object('envoyes', v_envoyes, 'heure', v_heure);
END;
$$;

REVOKE ALL ON FUNCTION public.push_engagement() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.push_engagement() FROM anon;
REVOKE ALL ON FUNCTION public.push_engagement() FROM authenticated;

-- ------------------------------------------------------------
-- 4. Tableau de bord
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_push(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deb   timestamp with time zone;
  v_total integer;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  v_deb := now() - make_interval(days => GREATEST(1, p_days));

  SELECT count(*) INTO v_total FROM public.push_log WHERE envoye_le >= v_deb;

  RETURN jsonb_build_object(
    'periode_jours', p_days,
    'envoyes', v_total,
    'cliques', (SELECT count(*)::integer FROM public.push_log
                WHERE envoye_le >= v_deb AND clique_le IS NOT NULL),

    -- Le dénominateur qui manque partout ailleurs : combien de membres
    -- sont seulement JOIGNABLES. Un envoi de 12 notifications n'a pas le
    -- même sens selon qu'on peut en toucher 15 ou 3 000.
    'joignables', (SELECT count(DISTINCT user_id)::integer FROM public.push_subscriptions),
    'appareils',  (SELECT count(*)::integer FROM public.push_subscriptions),
    'refus',      (SELECT count(*)::integer FROM public.profiles WHERE NOT push_engagement),

    -- Par message : c'est ici qu'on voit lequel ramène du monde.
    'modeles', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'envoyes')::int DESC)
      FROM (
        SELECT jsonb_build_object(
          'modele',  l.modele,
          'envoyes', count(*)::integer,
          'cliques', count(*) FILTER (WHERE l.clique_le IS NOT NULL)::integer,
          'dernier', max(l.envoye_le)
        ) AS x
        FROM public.push_log l
        WHERE l.envoye_le >= v_deb
        GROUP BY l.modele
      ) t
    ), '[]'::jsonb),

    -- Le détail des textes : deux variantes du même motif peuvent avoir
    -- des résultats très différents, et seule cette vue le montre.
    'textes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'modele', m.modele, 'titre', m.titre, 'corps', m.corps,
        'url', m.url, 'actif', m.actif
      ) ORDER BY m.modele, m.titre)
      FROM public.push_modeles m
    ), '[]'::jsonb),

    'courbe', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'jour', j, 'envoyes', n, 'cliques', c
      ) ORDER BY j)
      FROM (
        SELECT envoye_le::date AS j,
               count(*)::integer AS n,
               count(*) FILTER (WHERE clique_le IS NOT NULL)::integer AS c
        FROM public.push_log
        WHERE envoye_le >= v_deb
        GROUP BY envoye_le::date
      ) s
    ), '[]'::jsonb),

    'recents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'prenom', COALESCE(NULLIF(p.first_name, ''), 'Membre'),
        'modele', l.modele,
        'envoye_le', l.envoye_le,
        'clique_le', l.clique_le
      ) ORDER BY l.envoye_le DESC)
      FROM (
        SELECT * FROM public.push_log
        WHERE envoye_le >= v_deb
        ORDER BY envoye_le DESC LIMIT 60
      ) l
      JOIN public.profiles p ON p.id = l.user_id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_push(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_push(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Contrôle
-- ------------------------------------------------------------
SELECT
  (SELECT count(*) FROM public.push_log)                          AS envois,
  (SELECT count(*) FROM public.push_log WHERE clique_le IS NOT NULL) AS clics,
  (SELECT count(DISTINCT user_id) FROM public.push_subscriptions) AS joignables;

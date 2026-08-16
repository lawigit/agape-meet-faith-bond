-- ============================================================
-- Cycle de vie : réparer l'envoi, puis vendre plus tôt
-- ============================================================
-- 1. POURQUOI AUCUN E-MAIL N'EST PARTI
--
-- `lifecycle_endpoint` est resté sur l'adresse d'exemple :
--
--     https://VOTRE-PROJET.supabase.co/functions/v1/daily-lifecycle
--
-- Et `declencher_lifecycle()` teste explicitement ce motif :
--
--     IF v_url IS NULL OR v_url LIKE '%VOTRE-PROJET%' THEN RETURN;
--
-- La tâche s'exécutait donc chaque matin et repartait sans rien faire.
-- Bienvenue, profil incomplet, réveil, relances d'expiration : rien.
-- Seule la certification arrivait, parce que sa propre adresse avait
-- été renseignée correctement.
--
-- Le garde-fou a bien joué son rôle — il a évité d'appeler une adresse
-- inexistante — mais il l'a fait EN SILENCE pendant des semaines.
--
-- 2. VENDRE TROP TARD REVIENT À NE PAS VENDRE
--
-- La seule relance commerciale, `passer_premium`, exige TROIS MATCHS.
-- Un nouvel inscrit n'en a aucun : il ne recevait donc jamais la
-- moindre proposition d'abonnement. Or c'est dans les premiers jours
-- que l'intention est la plus forte — après, on désinstalle.
--
-- Deux relances sont ajoutées, sans condition de match :
--
--   J+2  « Ils vous ont remarqué »  — part de ce qui s'est passé
--   J+5  « Ce que Premium change »  — les atouts, chiffrés
--
-- ⚠️ Requiert la migration 64.

-- ------------------------------------------------------------
-- 1. L'adresse réelle
-- ------------------------------------------------------------
UPDATE public.server_secrets
SET value = 'https://nszcepszwzwafvfuxxip.supabase.co/functions/v1/daily-lifecycle'
WHERE key = 'lifecycle_endpoint';

INSERT INTO public.server_secrets (key, value)
VALUES ('lifecycle_endpoint',
        'https://nszcepszwzwafvfuxxip.supabase.co/functions/v1/daily-lifecycle')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ------------------------------------------------------------
-- 2. Deux relances commerciales précoces
-- ------------------------------------------------------------
-- `lifecycle_targets` est remplacée en entier : ses dix branches
-- existantes sont conservées à l'identique, deux s'y ajoutent.
CREATE OR REPLACE FUNCTION public.lifecycle_targets()
RETURNS TABLE (
  user_id    uuid,
  email      text,
  prenom     text,
  modele     text,
  cle_unique text,
  donnees    jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$

  -- ── J+1 : bienvenue ──
  SELECT p.id, u.email::text, p.first_name,
         'bienvenue',
         'bienvenue-' || p.id::text,
         '{}'::jsonb
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.created_at >= now() - interval '1 day'
    AND NOT public.is_suspended(p.id)

  UNION ALL

  -- ── J+1 : profil incomplet ──
  SELECT p.id, u.email::text, p.first_name,
         'profil_incomplet',
         'profil-' || p.id::text,
         '{}'::jsonb
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.created_at::date = (now() - interval '1 day')::date
    AND public.profile_completion(p.id) < 60
    AND NOT public.is_suspended(p.id)

  UNION ALL

  -- ── J+2 : « ils vous ont remarqué » ──
  -- La relance la plus efficace, parce qu'elle ne vend rien : elle
  -- raconte ce qui s'est réellement passé. Le nombre transmis est le
  -- VRAI, jamais arrondi vers le haut — un chiffre gonflé se découvre
  -- au premier clic, et détruit la confiance sur tout le reste.
  --
  -- Aucune condition de match : c'est précisément le défaut qu'on
  -- corrige. Elle part même à zéro vue, avec un texte adapté côté
  -- fonction Edge.
  SELECT p.id, u.email::text, p.first_name,
         'decouvrez_premium',
         'decouvrez-' || p.id::text,
         jsonb_build_object(
           'vues', (SELECT count(*) FROM public.profile_visits v
                    WHERE v.visited_id = p.id),
           'likes', (SELECT count(*) FROM public.swipes s
                     WHERE s.target_id = p.id AND s.action IN ('like', 'superlike'))
         )
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.created_at::date = (now() - interval '2 days')::date
    AND public.effective_level(p.id) = 0
    AND NOT public.is_suspended(p.id)

  UNION ALL

  -- ── J+3 : jamais exploré ──
  SELECT p.id, u.email::text, p.first_name,
         'jamais_swipe',
         'swipe-' || p.id::text,
         '{}'::jsonb
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.created_at::date = (now() - interval '3 days')::date
    AND NOT EXISTS (SELECT 1 FROM public.swipes s WHERE s.swiper_id = p.id)
    AND NOT public.is_suspended(p.id)

  UNION ALL

  -- ── J+5 : ce que Premium change ──
  -- Séparée de la précédente de trois jours : deux arguments de vente
  -- collés se lisent comme du harcèlement, et le plafond quotidien ne
  -- protège pas d'une insistance étalée.
  SELECT p.id, u.email::text, p.first_name,
         'atouts_premium',
         'atouts-' || p.id::text,
         '{}'::jsonb
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.created_at::date = (now() - interval '5 days')::date
    AND public.effective_level(p.id) = 0
    AND NOT public.is_suspended(p.id)

  UNION ALL

  -- ── J+7 : première semaine ──
  SELECT p.id, u.email::text, p.first_name,
         'semaine_un',
         'semaine-' || p.id::text,
         '{}'::jsonb
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.created_at::date = (now() - interval '7 days')::date
    AND NOT public.is_suspended(p.id)

  UNION ALL

  -- ── J−3 avant expiration ──
  SELECT p.id, u.email::text, p.first_name,
         'expire_3j',
         'exp3-' || p.id::text || '-' || s.expires_at::date::text,
         jsonb_build_object('expire_le', s.expires_at, 'plan', s.plan_id)
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  JOIN public.subscriptions s ON s.user_id = p.id
  WHERE s.expires_at::date = (now() + interval '3 days')::date
    AND NOT public.is_suspended(p.id)

  UNION ALL

  -- ── J−1 avant expiration ──
  SELECT p.id, u.email::text, p.first_name,
         'expire_1j',
         'exp1-' || p.id::text || '-' || s.expires_at::date::text,
         jsonb_build_object('expire_le', s.expires_at, 'plan', s.plan_id)
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  JOIN public.subscriptions s ON s.user_id = p.id
  WHERE s.expires_at::date = (now() + interval '1 day')::date
    AND NOT public.is_suspended(p.id)

  UNION ALL

  -- ── J+2 après expiration ──
  SELECT p.id, u.email::text, p.first_name,
         'expire_depuis',
         'expd-' || p.id::text || '-' || s.expires_at::date::text,
         jsonb_build_object('expire_le', s.expires_at)
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  JOIN public.subscriptions s ON s.user_id = p.id
  WHERE s.expires_at::date = (now() - interval '2 days')::date
    AND public.effective_level(p.id) = 0
    AND NOT public.is_suspended(p.id)

  UNION ALL

  -- ── Gratuit actif avec des matchs ──
  SELECT p.id, u.email::text, p.first_name,
         'passer_premium',
         'premium-' || p.id::text || '-' || to_char(now(), 'IYYY-IW'),
         '{}'::jsonb
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE public.effective_level(p.id) = 0
    AND p.last_seen >= now() - interval '3 days'
    AND (SELECT count(*) FROM public.matches m
         WHERE m.user1_id = p.id OR m.user2_id = p.id) >= 3
    AND NOT public.is_suspended(p.id)

  UNION ALL

  -- ── 14 jours d'absence ──
  SELECT p.id, u.email::text, p.first_name,
         'reveil',
         'reveil-' || p.id::text || '-' || now()::date::text,
         '{}'::jsonb
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.last_seen::date = (now() - interval '14 days')::date
    AND NOT public.is_suspended(p.id)

  UNION ALL

  -- ── Messages non lus ──
  SELECT p.id, u.email::text, p.first_name,
         'messages_non_lus',
         'digest-' || p.id::text || '-' || now()::date::text,
         jsonb_build_object('n', t.n, 'de', t.de)
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  JOIN LATERAL (
    SELECT count(*)::int AS n,
           count(DISTINCT m.sender_id)::int AS de
    FROM public.messages m
    JOIN public.matches ma ON ma.id = m.match_id
    WHERE m.sender_id <> p.id
      AND m.read_at IS NULL
      AND m.created_at >= now() - interval '24 hours'
      AND (ma.user1_id = p.id OR ma.user2_id = p.id)
  ) t ON TRUE
  WHERE t.n > 0
    AND (p.last_seen IS NULL OR p.last_seen < now() - interval '6 hours')
    AND NOT public.is_suspended(p.id)
$$;

REVOKE ALL ON FUNCTION public.lifecycle_targets() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lifecycle_targets() FROM anon;
REVOKE ALL ON FUNCTION public.lifecycle_targets() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_targets() TO service_role;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Contrôle
-- ------------------------------------------------------------
SELECT
  (SELECT count(*) FROM public.server_secrets
    WHERE key = 'lifecycle_endpoint' AND value NOT LIKE '%VOTRE-PROJET%') AS endpoint_ok,
  (SELECT count(*) FROM cron.job WHERE jobname = 'agape-lifecycle')       AS tache,
  (SELECT count(*) FROM public.lifecycle_targets())                        AS a_envoyer_maintenant;

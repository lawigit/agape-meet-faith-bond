-- ============================================================
-- Boosts : un total par abonnement, plus un quota mensuel
-- ============================================================
-- CE QUI CHANGE, ET POURQUOI
--
-- Le quota se comptait par MOIS CALENDAIRE : `started_at >=
-- date_trunc('month', now())`. Impossible, dans ce cadre, d'annoncer
-- « 11 Boosts » sur une offre de trois mois — la valeur aurait été
-- comprise comme 11 PAR MOIS, soit 33 au total.
--
-- Le décompte suit désormais la PÉRIODE D'ABONNEMENT : on compte depuis
-- le début de l'accès en cours, et le quota est le total promis.
--
--   Premium 15 jours .....  1 Boost
--   Premium 1 mois .......  3 Boosts
--   Premium 3 mois ....... 11 Boosts
--   VIP .................. illimité (inchangé)
--
-- UN EFFET DE BORD QUI JOUE EN FAVEUR DU MEMBRE
--
-- Avec le mois calendaire, quelqu'un qui achetait le 28 du mois voyait
-- son quota se réinitialiser trois jours plus tard — puis plus rien
-- pendant tout le mois suivant. Le décompte par période supprime cette
-- loterie : chacun reçoit exactement ce qui lui a été annoncé.
--
-- COMMENT EST DÉTERMINÉ LE DÉBUT DE PÉRIODE
--
-- `subscriptions.starts_at` de l'abonnement actif. À défaut — accès
-- offert par l'administration, membre fondateur —, on retombe sur le
-- mois calendaire, l'ancien comportement.
--
-- ⚠️ MODIFIE DEUX FONCTIONS EXISTANTES : `start_boost` et `boosts_left`.
--    Les Boosts déjà consommés ce mois-ci restent comptés.

-- ------------------------------------------------------------
-- 1. Les quotas annoncés
-- ------------------------------------------------------------
UPDATE public.app_settings SET value = '1'::jsonb  WHERE key = 'quota_boosts_l1';
UPDATE public.app_settings SET value = '3'::jsonb  WHERE key = 'quota_boosts_l2';
UPDATE public.app_settings SET value = '11'::jsonb WHERE key = 'quota_boosts_l3';
-- l4 (VIP) reste à -1 : illimité, conformément à sa fiche.

-- ------------------------------------------------------------
-- 2. Début de la période en cours
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.debut_periode_boost(p_user uuid)
RETURNS timestamp with time zone
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_debut timestamp with time zone;
BEGIN
  -- `subscriptions` a `user_id` en clé primaire : une seule ligne par
  -- membre, mise à jour à chaque achat. Pas d'historique à trier ici.
  --
  -- La colonne est `started_at`, et non `starts_at` — l'homonyme
  -- appartient à la table `suspensions`.
  SELECT s.started_at INTO v_debut
  FROM public.subscriptions s
  WHERE s.user_id = p_user
    AND s.expires_at > timezone('utc'::text, now());

  -- Repli sur le mois calendaire : fondateurs et accès offerts n'ont pas
  -- forcément de ligne d'abonnement.
  RETURN COALESCE(v_debut, date_trunc('month', timezone('utc'::text, now())));
END;
$$;

REVOKE ALL ON FUNCTION public.debut_periode_boost(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.debut_periode_boost(uuid) FROM anon;

-- ------------------------------------------------------------
-- 3. Le solde affiché
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.boosts_left()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user   uuid := auth.uid();
  v_now    timestamp with time zone := timezone('utc'::text, now());
  v_level  smallint;
  v_quota  integer;
  v_used   integer;
  v_active timestamp with time zone;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('left', 0, 'quota', 0, 'plan', 'gratuit');
  END IF;

  v_level := public.effective_level(v_user);
  v_quota := public.quota_boosts(v_level);

  SELECT count(*) INTO v_used
  FROM public.boosts b
  WHERE b.user_id = v_user AND b.source = 'plan'
    AND b.started_at >= public.debut_periode_boost(v_user);

  SELECT p.boosted_until INTO v_active FROM public.profiles p WHERE p.id = v_user;

  RETURN jsonb_build_object(
    'left', CASE WHEN v_quota = -1 THEN -1 ELSE GREATEST(0, v_quota - v_used) END,
    'quota', v_quota,
    'plan', public.effective_plan(v_user),
    'level', v_level,
    'active_until', CASE WHEN v_active > v_now THEN v_active ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.boosts_left() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.boosts_left() FROM anon;
GRANT EXECUTE ON FUNCTION public.boosts_left() TO authenticated;

-- ------------------------------------------------------------
-- 4. Le déclenchement
-- ------------------------------------------------------------
-- Le contrôle vit ICI, pas seulement dans l'affichage : une limite
-- vérifiée côté navigateur se contourne en rejouant l'appel.
CREATE OR REPLACE FUNCTION public.start_boost()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_now     timestamp with time zone := timezone('utc'::text, now());
  v_level   smallint;
  v_plan    text;
  v_quota   integer;
  v_used    integer;
  v_active  timestamp with time zone;
  v_expires timestamp with time zone;
  v_minutes integer;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  v_plan  := public.effective_plan(v_user);
  v_level := public.effective_level(v_user);
  v_quota := public.quota_boosts(v_level);

  IF v_quota = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'plan', 'plan', v_plan);
  END IF;

  SELECT p.boosted_until INTO v_active FROM public.profiles p WHERE p.id = v_user;
  IF v_active IS NOT NULL AND v_active > v_now THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_active', 'expires_at', v_active);
  END IF;

  IF v_quota > 0 THEN
    SELECT count(*) INTO v_used
    FROM public.boosts b
    WHERE b.user_id = v_user AND b.source = 'plan'
      AND b.started_at >= public.debut_periode_boost(v_user);

    IF v_used >= v_quota THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'quota', 'used', v_used, 'quota', v_quota);
    END IF;
  END IF;

  v_minutes := public.setting_int('boost_minutes_l' || v_level::text, 30);

  IF v_minutes <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'plan', 'plan', v_plan);
  END IF;

  v_expires := v_now + make_interval(mins => v_minutes);

  INSERT INTO public.boosts (user_id, plan_id, started_at, expires_at, source)
  VALUES (v_user, v_plan, v_now, v_expires, 'plan');

  UPDATE public.profiles SET boosted_until = v_expires WHERE id = v_user;

  RETURN jsonb_build_object('ok', true, 'expires_at', v_expires, 'plan', v_plan, 'minutes', v_minutes);
END;
$$;

REVOKE ALL ON FUNCTION public.start_boost() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_boost() FROM anon;
GRANT EXECUTE ON FUNCTION public.start_boost() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Contrôle
-- ------------------------------------------------------------
SELECT key, value #>> '{}' AS boosts
FROM public.app_settings
WHERE key LIKE 'quota_boosts_l%'
ORDER BY key;

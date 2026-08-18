-- ============================================================
-- Une publication par 24 h en formule Gratuite
-- ============================================================
-- La communauté n'avait aucune limite de fréquence. Seul le média était
-- réservé — un membre gratuit pouvait publier trente textes dans la
-- journée, et rien ne l'incitait jamais à passer Premium pour cela.
--
-- POURQUOI 24 h GLISSANTES, ET NON « UNE PAR JOUR CALENDAIRE »
--
-- Avec un jour calendaire, publier à 23 h 50 puis à 00 h 10 respecte la
-- règle : deux publications en vingt minutes. On l'apprend vite, et la
-- limite ne limite plus rien. La fenêtre glissante compte depuis la
-- dernière publication, et ne se contourne pas.
--
-- POURQUOI LA SUPPRESSION NE REND PAS LE DROIT
--
-- Le compte porte sur les publications ENCORE PRÉSENTES. Supprimer la
-- sienne pour en publier une autre est donc possible — et c'est voulu :
-- corriger une publication ratée ne doit pas coûter une journée. Ce qui
-- est limité, c'est l'occupation du fil, pas le nombre de tentatives.
--
-- Les paliers payants ne sont pas concernés : `-1` signifie illimité,
-- comme partout ailleurs dans les réglages.

-- ------------------------------------------------------------
-- 1. Les réglages, palier par palier
-- ------------------------------------------------------------
INSERT INTO public.app_settings (key, value, label) VALUES
  ('quota_posts_l0', '1'::jsonb,  'Publications/24 h — Gratuit'),
  ('quota_posts_l1', '-1'::jsonb, 'Publications/24 h — Premium 15 jours'),
  ('quota_posts_l2', '-1'::jsonb, 'Publications/24 h — Premium 1 mois'),
  ('quota_posts_l3', '-1'::jsonb, 'Publications/24 h — Premium 3 mois'),
  ('quota_posts_l4', '-1'::jsonb, 'Publications/24 h — VIP')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- 2. Le contrôle, à l'insertion
-- ------------------------------------------------------------
-- Fonction distincte de `enforce_community_media()` : celle-ci est aussi
-- posée sur UPDATE, pour empêcher d'ajouter une photo après coup. Y
-- mêler le quota refuserait la simple correction d'une publication déjà
-- faite — exactement le piège dans lequel `enforce_message_limits` était
-- tombé, et que la migration 36 a dû défaire.
CREATE OR REPLACE FUNCTION public.enforce_community_quota()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_level   smallint;
  v_quota   integer;
  v_faites  integer;
BEGIN
  v_level := public.effective_level(NEW.user_id);
  v_quota := public.setting_int('quota_posts_l' || v_level::text, -1);

  IF v_quota < 0 THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_faites
  FROM public.community_posts
  WHERE user_id = NEW.user_id
    AND created_at > timezone('utc'::text, now()) - interval '24 hours';

  IF v_faites >= v_quota THEN
    RAISE EXCEPTION 'FREE_POST_QUOTA'
      USING HINT = 'Une publication par 24 h en formule Gratuite.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_quota ON public.community_posts;
CREATE TRIGGER trg_community_quota
BEFORE INSERT ON public.community_posts
FOR EACH ROW EXECUTE FUNCTION public.enforce_community_quota();

-- ------------------------------------------------------------
-- 3. Ce que l'application a besoin de savoir AVANT d'écrire
-- ------------------------------------------------------------
-- Sans cela, la seule façon d'apprendre qu'on est bloqué serait d'écrire
-- un témoignage entier, de téléverser sa photo, et de se le voir refuser
-- à l'envoi. On préfère le dire pendant qu'il est encore temps.
CREATE OR REPLACE FUNCTION public.quota_publications()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user     uuid := auth.uid();
  v_level    smallint;
  v_quota    integer;
  v_faites   integer;
  v_prochain timestamp with time zone;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('illimite', false, 'restant', 0);
  END IF;

  v_level := public.effective_level(v_user);
  v_quota := public.setting_int('quota_posts_l' || v_level::text, -1);

  IF v_quota < 0 THEN
    RETURN jsonb_build_object('illimite', true, 'restant', -1);
  END IF;

  SELECT count(*), min(created_at) INTO v_faites, v_prochain
  FROM public.community_posts
  WHERE user_id = v_user
    AND created_at > timezone('utc'::text, now()) - interval '24 hours';

  RETURN jsonb_build_object(
    'illimite', false,
    'quota',    v_quota,
    'restant',  GREATEST(v_quota - v_faites, 0),
    -- La plus ANCIENNE des publications de la fenêtre : c'est elle qui
    -- en sortira la première, et donc elle qui libère le droit suivant.
    'prochain_le', CASE WHEN v_faites >= v_quota
                        THEN v_prochain + interval '24 hours'
                        ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.quota_publications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quota_publications() TO authenticated;

-- ------------------------------------------------------------
-- Vérification
-- ------------------------------------------------------------
SELECT key, value FROM public.app_settings WHERE key LIKE 'quota_posts_%' ORDER BY key;
SELECT public.quota_publications();

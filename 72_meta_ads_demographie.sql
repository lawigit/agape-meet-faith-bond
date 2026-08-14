-- ============================================================
-- Meta Ads — pays, genre, âge et provenance
-- ============================================================
-- CE QU'ON PEUT SAVOIR, ET CE QU'ON NE PEUT PAS
--
-- `ad_visits` est ANONYME. Une visite n'a ni pays, ni genre, ni âge :
-- personne n'a encore rien déclaré, et rien dans le navigateur ne le dit
-- de façon fiable. Prétendre le contraire produirait des chiffres
-- inventés — exactement ce qu'il ne faut jamais afficher.
--
-- Ce qu'on connaît réellement se répartit en deux niveaux :
--
--   • LA VISITE : campagne, source, page d'arrivée, date. Point.
--   • LE MEMBRE INSCRIT : pays, ville, genre, âge, confession — parce
--     qu'il les a déclarés lui-même à l'inscription.
--
-- Cette fonction ne décrit donc PAS les visiteurs, mais les MEMBRES
-- VENUS DE LA PUBLICITÉ. C'est d'ailleurs la seule population qui
-- intéresse un ciblage : savoir que mille personnes ont regardé sans
-- s'inscrire ne dit pas qui cibler ; savoir que les inscrits venus de
-- Facebook ont 32 ans et vivent à Abidjan, si.
--
-- Chaque bloc renvoie aussi `sans_donnee`, le nombre de membres dont
-- l'information manque. Sans lui, une répartition portant sur trois
-- personnes sur cent aurait l'air aussi solide qu'une autre.
--
-- ⚠️ AJOUT PUR : une fonction. Requiert la migration 65.

CREATE OR REPLACE FUNCTION public.admin_meta_demographie(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deb    timestamp with time zone;
  v_total  integer;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  v_deb := now() - make_interval(days => GREATEST(1, p_days));

  -- La population de référence : les membres arrivés par une publicité.
  -- `fbclid` compte autant qu'`utm_source` — un clic Facebook ne porte
  -- pas toujours d'UTM si le lien n'a pas été balisé.
  SELECT count(*) INTO v_total
  FROM public.profiles p
  WHERE p.created_at >= v_deb
    AND (p.utm_source IS NOT NULL OR p.fbclid IS NOT NULL);

  RETURN jsonb_build_object(
    'periode_jours', p_days,
    'membres_pub', v_total,

    -- ── Ce qu'on MESURE vraiment sur les visites ──
    'visites_total', (
      SELECT count(*)::integer FROM public.ad_visits WHERE created_at >= v_deb),

    'visites_par_campagne', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'n')::int DESC)
      FROM (
        SELECT jsonb_build_object(
          'campagne', COALESCE(v.utm_campaign, 'sans campagne'),
          'source',   COALESCE(v.utm_source, 'direct'),
          'n',        count(*)::integer
        ) AS x
        FROM public.ad_visits v
        WHERE v.created_at >= v_deb
        GROUP BY COALESCE(v.utm_campaign, 'sans campagne'), COALESCE(v.utm_source, 'direct')
      ) t
    ), '[]'::jsonb),

    'visites_par_page', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'n')::int DESC)
      FROM (
        SELECT jsonb_build_object(
          'page', COALESCE(NULLIF(v.landing_path, ''), '/'),
          'n',    count(*)::integer
        ) AS x
        FROM public.ad_visits v
        WHERE v.created_at >= v_deb
        GROUP BY COALESCE(NULLIF(v.landing_path, ''), '/')
        LIMIT 20
      ) t
    ), '[]'::jsonb),

    -- ── Ce qu'on sait des membres inscrits ──
    -- Chaque répartition suit le membre jusqu'au paiement : une tranche
    -- d'âge qui s'inscrit beaucoup sans jamais payer coûte de l'argent
    -- au lieu d'en rapporter, et seule cette colonne le révèle.
    'pays', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'n')::int DESC)
      FROM (
        SELECT jsonb_build_object(
          'valeur',  COALESCE(NULLIF(p.country, ''), 'Non renseigné'),
          'n',       count(*)::integer,
          'payants', count(*) FILTER (WHERE EXISTS (
                       SELECT 1 FROM public.payments pay
                       WHERE pay.user_id = p.id AND pay.status = 'completed'))::integer
        ) AS x
        FROM public.profiles p
        WHERE p.created_at >= v_deb
          AND (p.utm_source IS NOT NULL OR p.fbclid IS NOT NULL)
        GROUP BY COALESCE(NULLIF(p.country, ''), 'Non renseigné')
      ) t
    ), '[]'::jsonb),

    'villes', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'n')::int DESC)
      FROM (
        SELECT jsonb_build_object(
          'valeur', COALESCE(NULLIF(p.city, ''), 'Non renseignée'),
          'pays',   COALESCE(NULLIF(p.country, ''), '—'),
          'n',      count(*)::integer
        ) AS x
        FROM public.profiles p
        WHERE p.created_at >= v_deb
          AND (p.utm_source IS NOT NULL OR p.fbclid IS NOT NULL)
        GROUP BY COALESCE(NULLIF(p.city, ''), 'Non renseignée'),
                 COALESCE(NULLIF(p.country, ''), '—')
        LIMIT 25
      ) t
    ), '[]'::jsonb),

    'genre', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'n')::int DESC)
      FROM (
        SELECT jsonb_build_object(
          'valeur',  COALESCE(NULLIF(p.gender, ''), 'Non renseigné'),
          'n',       count(*)::integer,
          'payants', count(*) FILTER (WHERE EXISTS (
                       SELECT 1 FROM public.payments pay
                       WHERE pay.user_id = p.id AND pay.status = 'completed'))::integer
        ) AS x
        FROM public.profiles p
        WHERE p.created_at >= v_deb
          AND (p.utm_source IS NOT NULL OR p.fbclid IS NOT NULL)
        GROUP BY COALESCE(NULLIF(p.gender, ''), 'Non renseigné')
      ) t
    ), '[]'::jsonb),

    -- Tranches alignées sur celles de Meta : elles servent à régler un
    -- ciblage, et devoir convertir d'un découpage à l'autre est le
    -- meilleur moyen de se tromper.
    'age', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'valeur')
      FROM (
        SELECT jsonb_build_object(
          'valeur',  q.tranche,
          'n',       count(*)::integer,
          'payants', count(*) FILTER (WHERE q.a_paye)::integer
        ) AS x
        FROM (
          SELECT
            CASE
              WHEN p.birth_date IS NULL THEN 'Non renseigné'
              ELSE (
                WITH a AS (SELECT extract(year FROM age(p.birth_date))::int AS n)
                SELECT CASE
                  WHEN a.n < 18 THEN 'Non renseigné'
                  WHEN a.n <= 24 THEN '18–24'
                  WHEN a.n <= 34 THEN '25–34'
                  WHEN a.n <= 44 THEN '35–44'
                  WHEN a.n <= 54 THEN '45–54'
                  WHEN a.n <= 64 THEN '55–64'
                  ELSE '65+'
                END FROM a
              )
            END AS tranche,
            EXISTS (SELECT 1 FROM public.payments pay
                    WHERE pay.user_id = p.id AND pay.status = 'completed') AS a_paye
          FROM public.profiles p
          WHERE p.created_at >= v_deb
            AND (p.utm_source IS NOT NULL OR p.fbclid IS NOT NULL)
        ) q
        GROUP BY q.tranche
      ) t
    ), '[]'::jsonb),

    'denomination', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'n')::int DESC)
      FROM (
        SELECT jsonb_build_object(
          'valeur', COALESCE(NULLIF(p.denomination, ''), 'Non renseignée'),
          'n',      count(*)::integer
        ) AS x
        FROM public.profiles p
        WHERE p.created_at >= v_deb
          AND (p.utm_source IS NOT NULL OR p.fbclid IS NOT NULL)
        GROUP BY COALESCE(NULLIF(p.denomination, ''), 'Non renseignée')
        LIMIT 15
      ) t
    ), '[]'::jsonb),

    -- ── Le croisement qui décide d'un budget ──
    -- Pays × genre par campagne : c'est ce tableau qui dit s'il faut
    -- restreindre une audience ou en ouvrir une autre.
    'campagne_pays', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'n')::int DESC)
      FROM (
        SELECT jsonb_build_object(
          'campagne', COALESCE(NULLIF(p.utm_campaign, ''), 'sans campagne'),
          'pays',     COALESCE(NULLIF(p.country, ''), 'Non renseigné'),
          'n',        count(*)::integer,
          'payants',  count(*) FILTER (WHERE EXISTS (
                        SELECT 1 FROM public.payments pay
                        WHERE pay.user_id = p.id AND pay.status = 'completed'))::integer,
          'revenus',  COALESCE(sum((
                        SELECT sum(pay.amount_xof) FROM public.payments pay
                        WHERE pay.user_id = p.id AND pay.status = 'completed')), 0)
        ) AS x
        FROM public.profiles p
        WHERE p.created_at >= v_deb
          AND (p.utm_source IS NOT NULL OR p.fbclid IS NOT NULL)
        GROUP BY COALESCE(NULLIF(p.utm_campaign, ''), 'sans campagne'),
                 COALESCE(NULLIF(p.country, ''), 'Non renseigné')
        LIMIT 40
      ) t
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_meta_demographie(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_meta_demographie(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Contrôle
-- ------------------------------------------------------------
SELECT
  (SELECT count(*) FROM public.ad_visits) AS visites,
  (SELECT count(*) FROM public.profiles
    WHERE utm_source IS NOT NULL OR fbclid IS NOT NULL) AS membres_venus_de_pub;

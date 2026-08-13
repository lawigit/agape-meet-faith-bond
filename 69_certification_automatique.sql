-- ============================================================
-- Certification automatique — 3 h après l'inscription
-- ============================================================
-- CE QUE CELA CHANGE, ET QU'IL FAUT SAVOIR
--
-- Un badge attribué automatiquement à tout le monde ne distingue plus
-- personne. Il cesse d'être une information et devient une décoration :
-- un faux profil l'obtient aussi sûrement qu'un membre sincère, et le
-- premier membre trompé par un compte « vérifié » vous l'opposera.
--
-- Par ailleurs la page d'accueil annonce désormais un « examen manuel par
-- notre équipe ». Une certification purement automatique rendrait cette
-- phrase fausse à son tour.
--
-- D'OÙ LES TROIS FILTRES CI-DESSOUS. Ils ne remplacent pas un examen,
-- mais ils empêchent les certifications manifestement absurdes :
--
--   • au moins une photo — un profil sans visage ne peut pas être
--     présenté comme authentique ;
--   • aucun signalement en attente — certifier quelqu'un que des membres
--     viennent de dénoncer est exactement l'erreur que le badge doit
--     empêcher ;
--   • compte non suspendu.
--
-- Chacun est réglable, et `certification_auto_min_photos` peut être mis à
-- 0 pour certifier absolument tout le monde. Le choix vous appartient ;
-- la conséquence est écrite ici.
--
-- LE RATTRAPAGE DU PASSÉ EST VOLONTAIREMENT ÉCARTÉ. À la première
-- exécution, seuls les comptes créés depuis moins de 30 jours sont
-- concernés : sans cette borne, l'activation certifierait d'un coup la
-- totalité de votre base — y compris des comptes abandonnés ou douteux —
-- et enverrait autant d'e-mails d'un seul envoi, ce que Gmail lit comme
-- une attaque.
--
-- ⚠️ Requiert la migration 68 (`admin_certifier_profil`) et 30 (e-mails).

-- ------------------------------------------------------------
-- 1. Réglages
-- ------------------------------------------------------------
INSERT INTO public.app_settings (key, value, label) VALUES
  ('certification_auto',            'true'::jsonb, 'Certification automatique des profils'),
  ('certification_auto_heures',     '3'::jsonb,    'Délai avant certification (heures)'),
  ('certification_auto_min_photos', '1'::jsonb,    'Photos minimum pour être certifié'),
  ('certification_auto_max_jours',  '30'::jsonb,   'Ne pas certifier les comptes plus anciens (jours)')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- 2. La certification elle-même
-- ------------------------------------------------------------
-- Réservée à `service_role` : appelée par la fonction Edge, jamais depuis
-- un navigateur. Elle renvoie les profils NOUVELLEMENT certifiés, avec
-- leur adresse — c'est cette liste qui déclenche les e-mails.
CREATE OR REPLACE FUNCTION public.certifier_automatiquement()
RETURNS TABLE (user_id uuid, email text, first_name text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actif      boolean;
  v_heures     integer;
  v_min_photos integer;
  v_max_jours  integer;
BEGIN
  SELECT COALESCE((value #>> '{}')::boolean, false) INTO v_actif
  FROM public.app_settings WHERE key = 'certification_auto';

  IF NOT COALESCE(v_actif, false) THEN
    RETURN;   -- aucune ligne : rien à certifier, rien à envoyer
  END IF;

  SELECT COALESCE((value #>> '{}')::integer, 3) INTO v_heures
  FROM public.app_settings WHERE key = 'certification_auto_heures';

  SELECT COALESCE((value #>> '{}')::integer, 1) INTO v_min_photos
  FROM public.app_settings WHERE key = 'certification_auto_min_photos';

  SELECT COALESCE((value #>> '{}')::integer, 30) INTO v_max_jours
  FROM public.app_settings WHERE key = 'certification_auto_max_jours';

  RETURN QUERY
  WITH cibles AS (
    SELECT p.id
    FROM public.profiles p
    WHERE p.is_verified = false
      AND p.created_at <= now() - make_interval(hours => COALESCE(v_heures, 3))
      -- Borne haute : empêche qu'une activation rattrape toute la base.
      AND p.created_at >= now() - make_interval(days  => COALESCE(v_max_jours, 30))
      AND (p.suspended_until IS NULL OR p.suspended_until <= now())
      AND COALESCE(array_length(p.photos, 1), 0) >= COALESCE(v_min_photos, 1)
      AND NOT EXISTS (
        SELECT 1 FROM public.reports r
        WHERE r.reported_id = p.id AND r.status = 'pending'
      )
    -- Plafond par passage : lisse les envois et borne le coût d'une
    -- exécution, même après plusieurs heures d'interruption.
    LIMIT 200
  ),
  maj AS (
    UPDATE public.profiles p
    SET is_verified = true
    WHERE p.id IN (SELECT c.id FROM cibles c)
    RETURNING p.id, p.first_name
  )
  SELECT m.id, u.email::text, COALESCE(NULLIF(m.first_name, ''), 'Membre')
  FROM maj m
  JOIN auth.users u ON u.id = m.id
  WHERE u.email IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.certifier_automatiquement() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.certifier_automatiquement() FROM anon;
REVOKE ALL ON FUNCTION public.certifier_automatiquement() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.certifier_automatiquement() TO service_role;

-- ------------------------------------------------------------
-- 3. Déclenchement planifié
-- ------------------------------------------------------------
-- La certification est faite par la fonction Edge et non ici : la base
-- ne sait pas envoyer d'e-mail, et certifier sans prévenir le membre
-- reviendrait à lui cacher ce qui le concerne.
CREATE OR REPLACE FUNCTION public.declencher_certification()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  SELECT value #>> '{}' INTO v_url
  FROM public.app_settings WHERE key = 'certification_endpoint';

  SELECT value INTO v_secret FROM public.server_secrets WHERE key = 'push_secret';

  IF v_url IS NULL OR v_url LIKE '%VOTRE-PROJET%' THEN
    RAISE NOTICE 'certification_endpoint non configuré — passage ignoré';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', v_secret
    ),
    body    := jsonb_build_object('source', 'cron')
  );
END;
$$;

INSERT INTO public.app_settings (key, value, label) VALUES
  ('certification_endpoint',
   '"https://nszcepszwzwafvfuxxip.supabase.co/functions/v1/auto-certify"'::jsonb,
   'URL de la fonction de certification automatique')
ON CONFLICT (key) DO NOTHING;

-- Toutes les 15 minutes : avec un délai de 3 h, personne n'attend plus
-- de 3 h 15. Une tâche horaire ferait attendre jusqu'à 4 h, et l'écart
-- entre la promesse et le vécu se remarque.
SELECT cron.unschedule('agape-certification')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agape-certification');

SELECT cron.schedule(
  'agape-certification',
  '*/15 * * * *',
  $$SELECT public.declencher_certification();$$
);

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Contrôle
-- ------------------------------------------------------------
SELECT
  (SELECT count(*) FROM cron.job WHERE jobname = 'agape-certification') AS tache_planifiee,
  (SELECT value #>> '{}' FROM public.app_settings WHERE key = 'certification_auto')        AS active,
  (SELECT value #>> '{}' FROM public.app_settings WHERE key = 'certification_auto_heures') AS delai_heures,
  (SELECT count(*) FROM public.profiles
    WHERE is_verified = false
      AND created_at <= now() - interval '3 hours'
      AND created_at >= now() - interval '30 days') AS eligibles_maintenant;

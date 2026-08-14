-- ============================================================
-- Notifications push d'engagement
-- ============================================================
-- CE QUI PEUT TUER UNE APPLICATION DE RENCONTRE
--
-- Ce n'est pas le manque de notifications, c'est leur excès. Une seule
-- notification de trop, une seule reçue à 3 h du matin, et la personne
-- ne les désactive pas : elle DÉSINSTALLE. Et un désabonnement push est
-- définitif — le navigateur ne redemandera jamais l'autorisation.
--
-- Ce fichier est donc autant un système d'envoi qu'un système de
-- retenue. Quatre garde-fous, tous obligatoires :
--
--   1. HEURES CALMES — rien avant 8 h ni après 21 h. Le marché est en
--      Afrique de l'Ouest et centrale (UTC / UTC+1), la fenêtre est
--      calculée dessus.
--   2. UNE SEULE notification d'engagement par jour et par membre.
--   3. TROIS par semaine au maximum : le plafond journalier seul
--      autoriserait sept par semaine, ce qui est déjà trop.
--   4. JAMAIS à quelqu'un qui vient d'utiliser l'application. Prévenir
--      d'aller voir ses matchs celui qui les regarde à l'instant est le
--      genre de détail qui fait paraître une application idiote.
--
-- Les notifications de MESSAGE, de MATCH et de SUPER LIKE ne passent pas
-- par ici : elles sont immédiates, attendues, et hors plafond. Ce
-- fichier ne traite que ce qui relève de la relance.
--
-- ⚠️ AJOUT PUR. Requiert les migrations 58 et 61.

-- ------------------------------------------------------------
-- 1. Réglages
-- ------------------------------------------------------------
INSERT INTO public.app_settings (key, value, label) VALUES
  ('push_engagement_actif',   'true'::jsonb, 'Notifications d''engagement actives'),
  ('push_heure_debut',        '8'::jsonb,    'Première heure d''envoi (UTC)'),
  ('push_heure_fin',          '20'::jsonb,   'Dernière heure d''envoi (UTC)'),
  ('push_max_par_jour',       '1'::jsonb,    'Notifications d''engagement par jour'),
  ('push_max_par_semaine',    '3'::jsonb,    'Notifications d''engagement par semaine')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- 2. Journal — c'est lui qui fait respecter les plafonds
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_log (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  modele     text NOT NULL,
  -- Clé d'unicité fonctionnelle : « premium:<user>:<semaine> ». Elle
  -- empêche de répéter le même message, même après un redémarrage.
  cle_unique text UNIQUE,
  envoye_le  timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS push_log_user_idx ON public.push_log (user_id, envoye_le DESC);

ALTER TABLE public.push_log ENABLE ROW LEVEL SECURITY;
-- Aucune politique : réservé aux fonctions ci-dessous.

-- ------------------------------------------------------------
-- 3. Le désabonnement, par membre
-- ------------------------------------------------------------
-- Séparé du push transactionnel : quelqu'un peut vouloir être averti de
-- ses messages sans recevoir de relance. Confondre les deux ferait
-- perdre les DEUX au premier agacement.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_engagement boolean NOT NULL DEFAULT true;

-- ------------------------------------------------------------
-- 4. Les messages
-- ------------------------------------------------------------
-- Écrits en base et non dans le code : vous pouvez les réécrire sans
-- redéploiement, et c'est le genre de texte qu'on ajuste souvent.
--
-- PLUSIEURS VARIANTES PAR MODÈLE, tirées au hasard. Recevoir trois fois
-- la même phrase apprend à ignorer la notification ; c'est la répétition
-- qui use, pas la fréquence.
CREATE TABLE IF NOT EXISTS public.push_modeles (
  id      bigserial PRIMARY KEY,
  modele  text NOT NULL,
  titre   text NOT NULL,
  corps   text NOT NULL,
  url     text NOT NULL DEFAULT '/accueil',
  actif   boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS push_modeles_idx ON public.push_modeles (modele) WHERE actif;

-- Rend la migration rejouable. Sans cette contrainte, le `ON CONFLICT`
-- ci-dessous n'a aucune cible et chaque réexécution dupliquerait les
-- quinze messages — un membre finirait par recevoir trois fois le même.
CREATE UNIQUE INDEX IF NOT EXISTS push_modeles_uidx
  ON public.push_modeles (modele, titre);

ALTER TABLE public.push_modeles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gèrent les modèles push" ON public.push_modeles;
CREATE POLICY "Admins gèrent les modèles push"
ON public.push_modeles FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.push_modeles (modele, titre, corps, url) VALUES
  -- ── Commencer à chercher ──
  ('demarrage', 'Votre âme sœur vous attend 💫',
   'Des profils chrétiens de votre région viennent de rejoindre AgapeMeet. Prenez cinq minutes pour les découvrir.', '/decouvrir'),
  ('demarrage', 'Et si c''était aujourd''hui ?',
   'Beaucoup de belles rencontres commencent par un simple profil regardé. Le vôtre attend d''en découvrir d''autres.', '/decouvrir'),
  ('demarrage', 'Ne laissez pas passer 🙏',
   'Des membres qui partagent votre foi cherchent la même chose que vous. Allez à leur rencontre.', '/decouvrir'),

  -- ── Profil incomplet ──
  ('profil', 'Votre profil mérite mieux ✨',
   'Les profils complets reçoivent bien plus de visites. Quelques minutes suffisent pour compléter le vôtre.', '/profil'),
  ('profil', 'On vous voit à moitié',
   'Ajoutez une photo et quelques mots sur votre foi : c''est ce que les autres regardent en premier.', '/profil'),

  -- ── Communauté ──
  ('communaute', 'Un témoignage à partager ? 🕊️',
   'Votre parcours peut encourager quelqu''un aujourd''hui. La communauté vous écoute.', '/communaute'),
  ('communaute', 'Quelqu''un prie pour vous',
   'Des membres partagent leurs sujets de prière en ce moment. Rejoignez-les.', '/communaute'),
  ('communaute', 'La communauté s''anime 💬',
   'Témoignages, prières, encouragements — voyez ce qui se dit aujourd''hui.', '/communaute'),

  -- ── Vers Premium ── (compte gratuit seulement)
  ('premium', 'Quelqu''un vous a remarqué 👀',
   'Des membres ont aimé votre profil. Découvrez qui, avec Premium.', '/abonnement'),
  ('premium', 'Vous plaisez plus que vous ne croyez',
   'Votre profil a été vu cette semaine. Premium vous montre par qui.', '/abonnement'),
  ('premium', 'Ne restez pas au bord du chemin',
   'Messages illimités, appels, et savoir qui vous aime : Premium à partir de 2 500 F.', '/abonnement'),

  -- ── Boost ──
  ('boost', 'Passez en tête 🚀',
   'Un Boost place votre profil devant tous les autres pendant 24 h. C''est le moment où l''on vous voit.', '/abonnement'),

  -- ── Réveil ──
  ('reveil', 'Vous nous avez manqué',
   'De nouveaux membres ont rejoint AgapeMeet depuis votre dernière visite. Venez voir.', '/decouvrir'),
  ('reveil', 'Votre place vous attend toujours 🙏',
   'Rien n''est perdu. Reprenez là où vous vous étiez arrêté.', '/accueil')
ON CONFLICT (modele, titre) DO NOTHING;

-- ------------------------------------------------------------
-- 5. Le moteur
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

  -- HEURES CALMES. Le contrôle est ici, dans le moteur, et non dans la
  -- planification : une tâche mal reprogrammée un jour ne doit pas
  -- pouvoir réveiller toute la base à 4 h du matin.
  IF v_heure < COALESCE(v_h_debut, 8) OR v_heure > COALESCE(v_h_fin, 20) THEN
    RETURN jsonb_build_object('envoyes', 0, 'raison', 'heures_calmes', 'heure', v_heure);
  END IF;

  FOR v_cible IN
    WITH candidats AS (
      SELECT p.id, p.first_name,
             CASE
               -- L'ordre compte : le premier motif qui s'applique gagne.
               -- Un compte gratuit qui a des admirateurs reçoit l'appel
               -- Premium plutôt qu'une invitation à compléter son profil.
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
        -- Un appareil doit être enregistré, sinon l'envoi ne mène nulle part.
        AND EXISTS (SELECT 1 FROM public.push_subscriptions s WHERE s.user_id = p.id)
        -- JAMAIS à quelqu'un qui est dans l'application en ce moment.
        AND (p.last_seen IS NULL OR p.last_seen < now() - interval '6 hours')
        -- Plafond journalier
        AND NOT EXISTS (
          SELECT 1 FROM public.push_log l
          WHERE l.user_id = p.id AND l.envoye_le >= now() - interval '24 hours'
          HAVING count(*) >= COALESCE(v_jour, 1))
        -- Plafond hebdomadaire
        AND NOT EXISTS (
          SELECT 1 FROM public.push_log l
          WHERE l.user_id = p.id AND l.envoye_le >= now() - interval '7 days'
          HAVING count(*) >= COALESCE(v_semaine, 3))
    )
    SELECT c.id, c.first_name, c.modele
    FROM candidats c
    WHERE c.modele IS NOT NULL
    -- Plafond par passage : lisse la charge et borne les dégâts d'une
    -- erreur de ciblage. Mieux vaut rattraper au passage suivant que
    -- réveiller toute la base d'un coup.
    LIMIT 200
  LOOP
    -- Une seule fois par modèle et par semaine : sans cette clé, un
    -- membre inactif recevrait « Vous nous avez manqué » chaque jour.
    v_cle := v_cible.modele || ':' || v_cible.id::text || ':'
             || to_char(now(), 'IYYY-IW');

    IF EXISTS (SELECT 1 FROM public.push_log WHERE cle_unique = v_cle) THEN
      CONTINUE;
    END IF;

    SELECT titre, corps, url INTO v_msg
    FROM public.push_modeles
    WHERE modele = v_cible.modele AND actif
    ORDER BY random() LIMIT 1;

    IF v_msg.titre IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.push_log (user_id, modele, cle_unique)
    VALUES (v_cible.id, v_cible.modele, v_cle)
    ON CONFLICT (cle_unique) DO NOTHING;

    -- Le journal AVANT l'envoi. Si l'envoi échoue, on aura prévenu une
    -- personne de moins ; dans l'ordre inverse, un incident réseau
    -- pourrait la faire notifier deux fois.
    PERFORM public.envoyer_push(
      v_cible.id,
      v_msg.titre,
      v_msg.corps,
      v_msg.url,
      'engagement'        -- même étiquette : une relance remplace la précédente
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
-- 6. Réglage par le membre
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.regler_push_engagement(p_actif boolean)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  UPDATE public.profiles SET push_engagement = COALESCE(p_actif, true)
  WHERE id = auth.uid();

  RETURN jsonb_build_object('ok', true, 'actif', COALESCE(p_actif, true));
END;
$$;

REVOKE ALL ON FUNCTION public.regler_push_engagement(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regler_push_engagement(boolean) TO authenticated;

-- ------------------------------------------------------------
-- 7. Planification
-- ------------------------------------------------------------
-- Deux passages par jour, à 10 h et 18 h UTC : le matin avant le
-- travail, le soir après. Un passage horaire n'enverrait pas davantage —
-- les plafonds l'interdisent — mais multiplierait les requêtes pour rien.
SELECT cron.unschedule('agape-push-engagement')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agape-push-engagement');

SELECT cron.schedule(
  'agape-push-engagement',
  '0 10,18 * * *',
  $$SELECT public.push_engagement();$$
);

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Contrôle
-- ------------------------------------------------------------
SELECT
  (SELECT count(*) FROM cron.job WHERE jobname = 'agape-push-engagement') AS tache,
  (SELECT count(*) FROM public.push_modeles WHERE actif) AS messages,
  (SELECT count(*) FROM public.push_subscriptions)       AS appareils,
  (SELECT count(DISTINCT user_id) FROM public.push_subscriptions) AS membres_joignables;

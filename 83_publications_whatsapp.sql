-- ============================================================
-- Publications quotidiennes pour la chaîne WhatsApp
-- ============================================================
-- ⚠️ À LIRE AVANT D'EXÉCUTER — CE QUI EST POSSIBLE, ET CE QUI NE L'EST PAS
--
-- Les CHAÎNES WhatsApp n'ont AUCUNE API officielle. Meta ne permet pas de
-- publier dans une chaîne par programme : ni webhook, ni Cloud API, ni
-- outil d'automatisation. La Cloud API ne sait qu'envoyer des messages
-- à des personnes qui ont accepté d'être contactées — ce qui est un
-- autre produit, payant au message, et qui ne touche pas les abonnés
-- d'une chaîne.
--
-- Il existe des bibliothèques non officielles qui pilotent WhatsApp Web.
-- Elles violent les conditions d'utilisation, et le risque n'est pas
-- théorique : c'est le bannissement du numéro, donc la perte de la
-- chaîne et de ses abonnés. Ce n'est pas un pari à faire sur le canal
-- d'acquisition d'AgapeMeet.
--
-- CE QUE FAIT DONC CETTE MIGRATION
--
-- Elle automatise tout sauf les cinq dernières secondes :
--
--   • une banque de messages, classés par angle chrétien ;
--   • deux créneaux par jour, remplis automatiquement une semaine à
--     l'avance, sans jamais reprendre un message récent ;
--   • une notification push à l'heure dite, sur le téléphone de
--     l'administrateur, avec le texte déjà prêt ;
--   • un écran /admin/whatsapp où le message se copie d'un geste.
--
-- Reste à ouvrir WhatsApp et coller. C'est le seul moyen honnête, et il
-- garde la chaîne en vie.

-- ------------------------------------------------------------
-- 1. Les réglages
-- ------------------------------------------------------------
-- Le Togo est à UTC+0 : l'heure enregistrée ici est donc l'heure locale.
INSERT INTO public.app_settings (key, value, label) VALUES
  ('whatsapp_heure_matin', '7'::jsonb,  'Chaîne WhatsApp — heure du message du matin'),
  ('whatsapp_heure_soir',  '19'::jsonb, 'Chaîne WhatsApp — heure du message du soir'),
  ('whatsapp_jours_avance', '7'::jsonb, 'Chaîne WhatsApp — jours programmés à l''avance'),
  ('whatsapp_repos_jours', '21'::jsonb, 'Chaîne WhatsApp — jours avant qu''un message puisse revenir')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- 2. La banque de messages
-- ------------------------------------------------------------
-- `moment` sépare deux registres qui ne se confondent pas : le matin
-- nourrit (verset, prière, promesse), le soir parle de la relation et
-- de la communauté. Publier une question d'engagement à 7 h du matin
-- n'obtient aucune réponse ; un verset le soir passe inaperçu après une
-- journée de travail.
CREATE TABLE IF NOT EXISTS public.whatsapp_modeles (
  id       bigserial PRIMARY KEY,
  moment   text NOT NULL CHECK (moment IN ('matin', 'soir')),
  angle    text NOT NULL,
  contenu  text NOT NULL,
  actif    boolean NOT NULL DEFAULT true,
  cree_le  timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Sans cet index, réexécuter la migration dupliquerait toute la banque.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_modeles_uidx
  ON public.whatsapp_modeles (md5(contenu));

ALTER TABLE public.whatsapp_modeles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_modeles_admin ON public.whatsapp_modeles;
CREATE POLICY whatsapp_modeles_admin ON public.whatsapp_modeles
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- 3. Le calendrier
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_planning (
  id          bigserial PRIMARY KEY,
  publier_le  timestamp with time zone NOT NULL,
  moment      text NOT NULL CHECK (moment IN ('matin', 'soir')),
  modele_id   bigint REFERENCES public.whatsapp_modeles(id) ON DELETE SET NULL,
  angle       text,
  -- Copie du texte, et non simple référence : un modèle corrigé ou
  -- désactivé ne doit pas réécrire après coup ce qui a déjà été publié.
  contenu     text NOT NULL,
  statut      text NOT NULL DEFAULT 'prevu'
              CHECK (statut IN ('prevu', 'publie', 'saute')),
  publie_le   timestamp with time zone,
  rappel_le   timestamp with time zone,
  cree_le     timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Un seul message par créneau : le remplissage peut tourner plusieurs
-- fois par jour sans jamais doubler une case déjà servie.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_planning_creneau_uidx
  ON public.whatsapp_planning (publier_le);

CREATE INDEX IF NOT EXISTS whatsapp_planning_statut_idx
  ON public.whatsapp_planning (statut, publier_le);

ALTER TABLE public.whatsapp_planning ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_planning_admin ON public.whatsapp_planning;
CREATE POLICY whatsapp_planning_admin ON public.whatsapp_planning
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- 4. La banque, huit angles
-- ------------------------------------------------------------
-- Guillemets dollar (`$m$`) plutôt que simples : les textes français
-- sont pleins d'apostrophes, et les doubler à la main sur cinquante
-- messages produit une erreur qu'on ne voit qu'à l'exécution.

INSERT INTO public.whatsapp_modeles (moment, angle, contenu) VALUES

-- ══ MATIN · VERSET ══════════════════════════════════════════
('matin', 'verset', $m$📖 *Verset du jour*

« Confie-toi en l'Éternel de tout ton cœur, et ne t'appuie pas sur ton intelligence. »
— Proverbes 3:5

Aujourd'hui, il y a peut-être une décision que tu tournes dans ta tête depuis des semaines. Pose-la devant Lui avant de la poser devant les autres.

Bonne journée 🙏$m$),

('matin', 'verset', $m$📖 *Verset du jour*

« Fais de l'Éternel tes délices, et il te donnera ce que ton cœur désire. »
— Psaume 37:4

Remarque l'ordre : d'abord la joie en Lui, ensuite le désir accompli. Beaucoup vivent l'inverse et s'étonnent d'attendre.

Bonne journée 🙏$m$),

('matin', 'verset', $m$📖 *Verset du jour*

« Car je connais les projets que j'ai formés sur vous, dit l'Éternel, projets de paix et non de malheur, afin de vous donner un avenir et de l'espérance. »
— Jérémie 29:11

Ton histoire n'est pas en retard. Elle est en cours.

Bonne journée 🙏$m$),

('matin', 'verset', $m$📖 *Verset du jour*

« L'amour est patient, il est plein de bonté ; l'amour n'est point envieux ; il ne se vante point, il ne s'enfle point d'orgueil. »
— 1 Corinthiens 13:4

Relis-le lentement. Ce n'est pas une définition du sentiment : c'est une liste de choses à faire.

Bonne journée 🙏$m$),

('matin', 'verset', $m$📖 *Verset du jour*

« Il y a un temps pour tout, un temps pour toute chose sous les cieux. »
— Ecclésiaste 3:1

Ce qui ne vient pas encore n'est pas ce qui ne viendra jamais.

Bonne journée 🙏$m$),

('matin', 'verset', $m$📖 *Verset du jour*

« Si l'Éternel ne bâtit la maison, ceux qui la bâtissent travaillent en vain. »
— Psaume 127:1

Un foyer se bâtit à trois. Choisis bien qui pose les fondations.

Bonne journée 🙏$m$),

-- ══ MATIN · PRIÈRE ══════════════════════════════════════════
('matin', 'priere', $m$🙏 *Prière du matin*

Seigneur,
Aujourd'hui je ne veux plus forcer ce que Tu n'as pas ouvert.
Donne-moi la patience de Ton calendrier, et le courage de faire ma part.
Prépare mon cœur avant de me présenter quelqu'un.

Amen.$m$),

('matin', 'priere', $m$🙏 *Prière du matin*

Père,
Garde-moi de la solitude qui fait accepter n'importe qui.
Que je préfère attendre seul dans Ta paix plutôt que d'être accompagné dans Ton silence.

Amen.$m$),

('matin', 'priere', $m$🙏 *Prière du matin*

Seigneur,
Fais de moi la personne que la personne que je demande mérite de rencontrer.
Travaille mon caractère avant de travailler mon histoire.

Amen.$m$),

('matin', 'priere', $m$🙏 *Prière du matin*

Père,
Merci pour ce que Tu m'as déjà donné et que j'oublie de compter.
Ouvre mes yeux aujourd'hui — parfois la réponse est là, et c'est moi qui regarde ailleurs.

Amen.$m$),

('matin', 'priere', $m$🙏 *Prière du matin*

Seigneur,
Que ma foi ne dépende pas de ce que je reçois cette semaine.
Que je Te serve aussi bien dans l'attente que dans l'accomplissement.

Amen.$m$),

('matin', 'priere', $m$🙏 *Prière du matin*

Père,
Protège les couples de cette communauté.
Là où il y a de la fatigue, remets de la douceur ; là où il y a du doute, remets de la parole donnée.

Amen.$m$),

-- ══ MATIN · PROMESSE ════════════════════════════════════════
('matin', 'promesse', $m$✨ *Une promesse pour aujourd'hui*

« Ceux qui se confient en l'Éternel renouvellent leur force. Ils prennent leur vol comme les aigles. »
— Ésaïe 40:31

Tu n'es pas fatigué parce que tu es faible. Tu es fatigué parce que tu portes seul quelque chose qui se porte à deux — Lui, et toi.$m$),

('matin', 'promesse', $m$✨ *Une promesse pour aujourd'hui*

« Je ne te délaisserai point, et je ne t'abandonnerai point. »
— Hébreux 13:5

Des gens sont partis. Lui n'est pas parti. Commence ta journée avec cette différence en tête.$m$),

('matin', 'promesse', $m$✨ *Une promesse pour aujourd'hui*

« Toutes choses concourent au bien de ceux qui aiment Dieu. »
— Romains 8:28

Y compris la relation qui n'a pas abouti. Surtout celle-là, peut-être.$m$),

('matin', 'promesse', $m$✨ *Une promesse pour aujourd'hui*

« L'Éternel est près de ceux qui ont le cœur brisé. »
— Psaume 34:18

Si tu traverses une rupture en ce moment : tu n'es pas puni. Tu es accompagné.$m$),

('matin', 'promesse', $m$✨ *Une promesse pour aujourd'hui*

« Demandez, et l'on vous donnera ; cherchez, et vous trouverez. »
— Matthieu 7:7

Remarque qu'il y a un verbe d'action dans chaque partie. La foi n'est pas l'immobilité.$m$),

('matin', 'promesse', $m$✨ *Une promesse pour aujourd'hui*

« Celui qui trouve une femme trouve le bonheur ; c'est une grâce qu'il obtient de l'Éternel. »
— Proverbes 18:22

Une grâce, donc quelque chose qui se reçoit — et quelque chose qui se garde.$m$),

-- ══ SOIR · ATTENTE ══════════════════════════════════════════
('soir', 'attente', $m$⏳ *Sur l'attente*

Attendre n'est pas ne rien faire.

Pendant que tu attends, tu peux : apprendre à gérer un budget, guérir d'une blessure ancienne, apprendre à écouter sans interrompre.

Le jour où la personne arrive, elle rencontre ce que tu es devenu pendant l'attente — pas ce que tu étais avant.

Bonne soirée 🌙$m$),

('soir', 'attente', $m$⏳ *Sur l'attente*

La solitude ment souvent. Elle dit : « tu n'auras personne ».

Elle a dit la même chose à des milliers de personnes aujourd'hui mariées.

Ne prends pas de décision définitive un soir de découragement.

Bonne soirée 🌙$m$),

('soir', 'attente', $m$⏳ *Sur l'attente*

Il vaut mieux être seul et en paix, que deux et en guerre.

Beaucoup de gens ont dit oui trop vite parce que la maison était vide. Trois ans plus tard, la maison est pleine — et le silence est pire.

Prends ton temps. Vraiment.

Bonne soirée 🌙$m$),

('soir', 'attente', $m$⏳ *Sur l'attente*

Une question honnête ce soir :

Est-ce que tu veux te marier, ou est-ce que tu veux arrêter d'être seul ?

Ce ne sont pas les mêmes désirs, et ils ne mènent pas au même endroit.

Bonne soirée 🌙$m$),

('soir', 'attente', $m$⏳ *Sur l'attente*

« Rebecca était très belle... » — mais ce n'est pas ce que le serviteur d'Abraham avait demandé en signe. Il avait demandé une femme qui donnerait à boire aux chameaux.

Genèse 24. Le caractère avant l'apparence, jusque dans le signe demandé à Dieu.

Bonne soirée 🌙$m$),

('soir', 'attente', $m$⏳ *Sur l'attente*

Si une relation te demande de renoncer à ta foi pour continuer, ce n'est pas une relation : c'est un échange.

Et ce que tu donnes vaut plus que ce que tu reçois.

Bonne soirée 🌙$m$),

-- ══ SOIR · CARACTÈRE ════════════════════════════════════════
('soir', 'caractere', $m$🌱 *Se préparer*

Trois choses à travailler avant le mariage, que personne ne remarque pendant les fiançailles :

1. Savoir dire pardon en premier
2. Savoir tenir un budget à deux
3. Savoir se taire quand on a raison

Le reste s'apprend en chemin.

Bonne soirée 🌙$m$),

('soir', 'caractere', $m$🌱 *Se préparer*

Ce que tu tolères aujourd'hui pendant les fiançailles, tu le vivras multiplié par dix après le mariage.

Le mariage ne corrige pas les caractères. Il les révèle.

Bonne soirée 🌙$m$),

('soir', 'caractere', $m$🌱 *Se préparer*

Observe comment il ou elle parle de son ex.

Ce ton-là, un jour, c'est de toi qu'on l'emploiera.

Bonne soirée 🌙$m$),

('soir', 'caractere', $m$🌱 *Se préparer*

Une relation saine ne se reconnaît pas à l'absence de conflits, mais à la façon dont ils se terminent.

Est-ce qu'on cherche à gagner, ou à comprendre ?

Bonne soirée 🌙$m$),

('soir', 'caractere', $m$🌱 *Se préparer*

Regarde comment la personne traite le serveur, le taximan, sa mère.

C'est là qu'on voit qui elle est — pas dans la façon dont elle te traite toi, pendant qu'elle veut te séduire.

Bonne soirée 🌙$m$),

('soir', 'caractere', $m$🌱 *Se préparer*

« Ne formez pas avec les incrédules un attelage disparate. »
— 2 Corinthiens 6:14

Deux bœufs de tailles différentes ne labourent pas droit. Ce n'est pas du mépris : c'est de la mécanique.

Bonne soirée 🌙$m$),

-- ══ SOIR · TÉMOIGNAGE ═══════════════════════════════════════
('soir', 'temoignage', $m$💍 *Ils y sont arrivés*

Elle avait 34 ans et pensait que le train était passé.
Il avait 39 ans et sortait d'un divorce difficile.

Ils se sont écrit pendant quatre mois avant de se voir. Ils sont mariés depuis deux ans.

Il n'est jamais trop tard, et ton passé n'est pas une condamnation.

Bonne soirée 🌙$m$),

('soir', 'temoignage', $m$💍 *Ils y sont arrivés*

« On s'est parlé tous les soirs pendant trois mois, sans jamais se voir. Quand on s'est rencontrés, j'avais l'impression de la connaître depuis dix ans. »

La précipitation abîme. La constance construit.

Bonne soirée 🌙$m$),

('soir', 'temoignage', $m$💍 *Ils y sont arrivés*

Elle m'a dit : « J'avais arrêté de chercher. J'avais juste continué à prier. »

Parfois Dieu attend qu'on lâche le volant pour prendre le virage.

Bonne soirée 🌙$m$),

('soir', 'temoignage', $m$💍 *Ils y sont arrivés*

Deux enfants d'un premier lit de son côté. Elle a dit oui quand même.

Aujourd'hui, ces enfants l'appellent maman.

Dieu répare des choses qu'on croyait cassées pour de bon.

Bonne soirée 🌙$m$),

('soir', 'temoignage', $m$💍 *Ils y sont arrivés*

Ils habitaient deux pays différents. Tout le monde leur a dit que ça ne marcherait pas.

Ce qui a tenu : la prière ensemble, chaque dimanche soir, par téléphone. Sans exception, pendant onze mois.

La discipline est une forme d'amour.

Bonne soirée 🌙$m$),

('soir', 'temoignage', $m$💍 *Ils y sont arrivés*

« Ma seule condition, c'était qu'il aime Dieu plus qu'il ne m'aime moi. Parce que le jour où il ne m'aimerait plus, il resterait quand même. »

Bonne soirée 🌙$m$),

-- ══ SOIR · QUESTION ═════════════════════════════════════════
('soir', 'question', $m$💬 *Question du soir*

Quelle est LA qualité non négociable chez ton futur conjoint ?

Une seule. Pas trois.

Répondez en commentaire 👇$m$),

('soir', 'question', $m$💬 *Question du soir*

Quel verset t'a porté dans une période où tu ne comprenais pas ce que Dieu faisait ?

Partage-le — quelqu'un ici en a besoin ce soir 👇$m$),

('soir', 'question', $m$💬 *Question du soir*

Selon toi : combien de temps faut-il se connaître avant de se fiancer ?

3 mois · 6 mois · 1 an · plus ?

Dites-nous 👇$m$),

('soir', 'question', $m$💬 *Question du soir*

Qu'est-ce que tu aurais aimé qu'on te dise avant ta première relation sérieuse ?

Ta réponse aidera les plus jeunes de cette communauté 👇$m$),

('soir', 'question', $m$💬 *Question du soir*

Prier ensemble avant le mariage : indispensable, ou trop tôt ?

On lit vos avis 👇$m$),

('soir', 'question', $m$💬 *Question du soir*

Une chose que tu as apprise sur toi-même pendant ton célibat ?

Répondez, même en une phrase 👇$m$),

-- ══ SOIR · AGAPE ════════════════════════════════════════════
-- Un rappel de l'application deux ou trois fois par semaine au plus.
-- Une chaîne qui ne parle que d'elle-même se vide en un mois.
('soir', 'agape', $m$❤️ *AgapeMeet*

Ici, on ne cherche pas une aventure. On cherche un foyer.

Profils vérifiés · Communauté chrétienne · Gratuit pour commencer

👉 https://agapemeet.com

Bonne soirée 🌙$m$),

('soir', 'agape', $m$❤️ *AgapeMeet*

Chaque semaine, de nouveaux frères et sœurs rejoignent la communauté.

Si tu pries depuis longtemps pour rencontrer quelqu'un qui partage ta foi — il n'y a rien de moins spirituel à faire le premier pas.

👉 https://agapemeet.com

Bonne soirée 🌙$m$),

('soir', 'agape', $m$❤️ *AgapeMeet*

Ton profil est-il complet ?

Une photo claire, une vraie présentation, ta vision du mariage. Les profils complets reçoivent trois fois plus de visites.

👉 https://agapemeet.com

Bonne soirée 🌙$m$),

('soir', 'agape', $m$❤️ *AgapeMeet*

Quelqu'un a peut-être regardé ton profil cette semaine sans oser écrire.

Ouvre l'application, fais le premier pas. Le pire qui puisse arriver, c'est un silence — et tu y survivras.

👉 https://agapemeet.com

Bonne soirée 🌙$m$),

('soir', 'agape', $m$❤️ *AgapeMeet*

Partage la chaîne avec un frère ou une sœur qui prie pour rencontrer quelqu'un.

Tu ne sais pas ce que ce simple transfert peut déclencher dans sa vie.

👉 https://agapemeet.com

Bonne soirée 🌙$m$),

('soir', 'agape', $m$❤️ *AgapeMeet*

Sur AgapeMeet, chaque profil est vérifié avant d'être visible.

Parce qu'on ne confie pas son cœur à un inconnu sans visage.

👉 https://agapemeet.com

Bonne soirée 🌙$m$)

ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 5. Remplir le calendrier
-- ------------------------------------------------------------
-- Idempotente : elle ne remplit que les créneaux VIDES. On peut la
-- lancer dix fois dans la journée sans rien doubler.
CREATE OR REPLACE FUNCTION public.programmer_whatsapp()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_jours   integer := public.setting_int('whatsapp_jours_avance', 7);
  v_repos   integer := public.setting_int('whatsapp_repos_jours', 21);
  v_matin   integer := public.setting_int('whatsapp_heure_matin', 7);
  v_soir    integer := public.setting_int('whatsapp_heure_soir', 19);
  v_jour    date;
  v_moment  text;
  v_quand   timestamp with time zone;
  v_modele  public.whatsapp_modeles%ROWTYPE;
  v_poses   integer := 0;
BEGIN
  FOR i IN 0..v_jours LOOP
    v_jour := (timezone('utc'::text, now()))::date + i;

    FOREACH v_moment IN ARRAY ARRAY['matin', 'soir'] LOOP
      v_quand := (v_jour + make_interval(hours =>
                    CASE v_moment WHEN 'matin' THEN v_matin ELSE v_soir END))
                 AT TIME ZONE 'UTC';

      -- Le passé ne se programme pas, et un créneau servi ne se réécrit
      -- pas : sans ce test, relancer la fonction remplacerait le message
      -- du matin alors qu'il vient d'être publié.
      CONTINUE WHEN v_quand <= timezone('utc'::text, now());
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.whatsapp_planning WHERE publier_le = v_quand
      );

      -- Le moins récemment utilisé d'abord, au hasard à égalité. Un
      -- simple ORDER BY random() ramènerait le même message deux fois
      -- dans la semaine, ce qui se remarque immédiatement sur une chaîne.
      SELECT m.* INTO v_modele
      FROM public.whatsapp_modeles m
      WHERE m.actif AND m.moment = v_moment
        AND NOT EXISTS (
          SELECT 1 FROM public.whatsapp_planning p
          WHERE p.modele_id = m.id
            AND p.publier_le > timezone('utc'::text, now()) - make_interval(days => v_repos)
        )
      ORDER BY random()
      LIMIT 1;

      -- Banque épuisée pour ce moment : on relâche la contrainte de repos
      -- plutôt que de laisser un créneau vide. Un message déjà vu vaut
      -- mieux que le silence.
      IF v_modele.id IS NULL THEN
        SELECT m.* INTO v_modele
        FROM public.whatsapp_modeles m
        WHERE m.actif AND m.moment = v_moment
        ORDER BY (
          SELECT COALESCE(max(p.publier_le), 'epoch'::timestamptz)
          FROM public.whatsapp_planning p WHERE p.modele_id = m.id
        ) ASC, random()
        LIMIT 1;
      END IF;

      CONTINUE WHEN v_modele.id IS NULL;

      INSERT INTO public.whatsapp_planning (publier_le, moment, modele_id, angle, contenu)
      VALUES (v_quand, v_moment, v_modele.id, v_modele.angle, v_modele.contenu)
      ON CONFLICT (publier_le) DO NOTHING;

      v_poses := v_poses + 1;
      v_modele := NULL;
    END LOOP;
  END LOOP;

  RETURN v_poses;
END;
$$;

-- ------------------------------------------------------------
-- 6. Le rappel, à l'heure dite
-- ------------------------------------------------------------
-- Une notification push sur le téléphone des administrateurs. Sans elle,
-- il faudrait penser à ouvrir le back-office deux fois par jour — et
-- c'est exactement ce qu'on oublie au bout de quatre jours.
CREATE OR REPLACE FUNCTION public.rappel_whatsapp()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ligne record;
  v_admin uuid;
  v_n     integer := 0;
BEGIN
  FOR v_ligne IN
    SELECT id, moment, contenu
    FROM public.whatsapp_planning
    WHERE statut = 'prevu'
      AND rappel_le IS NULL
      AND publier_le <= timezone('utc'::text, now())
      -- Au-delà de six heures, le créneau est manqué : rappeler à 23 h
      -- un message prévu pour 7 h ne sert plus à rien.
      AND publier_le > timezone('utc'::text, now()) - interval '6 hours'
    ORDER BY publier_le
  LOOP
    FOR v_admin IN
      SELECT id FROM public.profiles WHERE role IN ('admin', 'moderator')
    LOOP
      PERFORM public.envoyer_push(
        v_admin,
        CASE v_ligne.moment WHEN 'matin' THEN 'Publication du matin prête'
                            ELSE 'Publication du soir prête' END,
        left(regexp_replace(v_ligne.contenu, '\*|_', '', 'g'), 90) || '…',
        '/admin/whatsapp',
        'whatsapp-' || v_ligne.id::text
      );
    END LOOP;

    UPDATE public.whatsapp_planning
    SET rappel_le = timezone('utc'::text, now())
    WHERE id = v_ligne.id;

    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$$;

-- ------------------------------------------------------------
-- 7. Ce que lit le back-office
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_whatsapp(p_jours integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'acces_refuse');
  END IF;

  RETURN jsonb_build_object(
    'planning', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'publier_le', p.publier_le, 'moment', p.moment,
        'angle', p.angle, 'contenu', p.contenu, 'statut', p.statut,
        'publie_le', p.publie_le
      ) ORDER BY p.publier_le)
      FROM public.whatsapp_planning p
      WHERE p.publier_le > timezone('utc'::text, now()) - interval '3 days'
        AND p.publier_le < timezone('utc'::text, now()) + make_interval(days => p_jours)
    ), '[]'::jsonb),

    -- Le nombre de messages disponibles par moment : c'est le seul
    -- indicateur qui annonce l'essoufflement de la chaîne avant qu'il
    -- ne se voie dans les publications.
    'banque', COALESCE((
      SELECT jsonb_object_agg(moment, n) FROM (
        SELECT moment, count(*) AS n
        FROM public.whatsapp_modeles WHERE actif GROUP BY moment
      ) s
    ), '{}'::jsonb),

    'en_retard', (
      SELECT count(*) FROM public.whatsapp_planning
      WHERE statut = 'prevu' AND publier_le <= timezone('utc'::text, now())
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.marquer_whatsapp(p_id bigint, p_statut text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'acces_refuse');
  END IF;

  IF p_statut NOT IN ('prevu', 'publie', 'saute') THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'statut_invalide');
  END IF;

  UPDATE public.whatsapp_planning
  SET statut = p_statut,
      publie_le = CASE WHEN p_statut = 'publie'
                       THEN timezone('utc'::text, now()) ELSE NULL END
  WHERE id = p_id;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_n > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_whatsapp(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_whatsapp(integer) TO authenticated;
REVOKE ALL ON FUNCTION public.marquer_whatsapp(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marquer_whatsapp(bigint, text) TO authenticated;

-- ------------------------------------------------------------
-- 8. Les tâches planifiées
-- ------------------------------------------------------------
SELECT cron.unschedule('agape-whatsapp-programmer')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agape-whatsapp-programmer');

SELECT cron.schedule(
  'agape-whatsapp-programmer',
  '0 3 * * *',
  $$SELECT public.programmer_whatsapp();$$
);

SELECT cron.unschedule('agape-whatsapp-rappel')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agape-whatsapp-rappel');

-- Toutes les quinze minutes : les heures de publication sont réglables
-- dans /admin/parametres, et une tâche fixée sur 7 h et 19 h cesserait
-- de fonctionner dès qu'on les change.
SELECT cron.schedule(
  'agape-whatsapp-rappel',
  '*/15 * * * *',
  $$SELECT public.rappel_whatsapp();$$
);

-- Premier remplissage, tout de suite.
SELECT public.programmer_whatsapp() AS creneaux_programmes;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Contrôle
-- ------------------------------------------------------------
SELECT moment, count(*) AS messages FROM public.whatsapp_modeles GROUP BY moment;
SELECT publier_le, moment, angle FROM public.whatsapp_planning
ORDER BY publier_le LIMIT 10;

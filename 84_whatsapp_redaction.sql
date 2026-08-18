-- ============================================================
-- Chaîne WhatsApp : production illimitée
-- ============================================================
-- LE PROBLÈME D'UNE BANQUE FINIE
--
-- La migration 83 a posé 48 messages. À deux publications par jour, la
-- banque fait un tour en vingt-quatre jours ; le repos de 21 jours ne
-- fait que retarder l'échéance. Sur une chaîne, relire un message déjà
-- lu est le signal qu'il n'y a plus rien à voir — et l'on se désabonne.
--
-- CE QUE FAIT CETTE MIGRATION
--
--   1. Elle élargit le socle écrit à la main : quatre angles nouveaux et
--      une trentaine de messages de plus.
--   2. Elle ouvre la banque à l'écriture automatique, par une fonction
--      Edge qui rédige de nouveaux messages chaque nuit.
--
-- L'ORDRE COMPTE. Le socle d'abord : si la clé API manque, si le quota
-- est atteint, si le service répond mal, la chaîne continue de publier.
-- Une panne de rédaction ne doit jamais produire un créneau vide.
--
-- ⚠️ Requiert la migration 83.

-- ------------------------------------------------------------
-- 1. Quatre angles de plus, écrits à la main
-- ------------------------------------------------------------
INSERT INTO public.whatsapp_modeles (moment, angle, contenu) VALUES

-- ══ MATIN · SAGESSE (Proverbes appliqués) ═══════════════════
('matin', 'sagesse', $m$🕊️ *Sagesse du jour*

« Mieux vaut peu, avec la crainte de l'Éternel, qu'un grand trésor avec le trouble. »
— Proverbes 15:16

Ne choisis pas quelqu'un pour ce qu'il possède. Le compte se vide ; le caractère reste.

Bonne journée 🙏$m$),

('matin', 'sagesse', $m$🕊️ *Sagesse du jour*

« Celui qui marche avec les sages devient sage. »
— Proverbes 13:20

Regarde qui entoure la personne qui t'intéresse. Dans cinq ans, tu lui ressembleras un peu.

Bonne journée 🙏$m$),

('matin', 'sagesse', $m$🕊️ *Sagesse du jour*

« La réponse douce calme la fureur. »
— Proverbes 15:1

Une seule phrase peut éteindre une dispute ou l'allumer. C'est un savoir-faire, pas un tempérament — cela s'apprend.

Bonne journée 🙏$m$),

('matin', 'sagesse', $m$🕊️ *Sagesse du jour*

« Le cœur de l'homme médite sa voie, mais c'est l'Éternel qui dirige ses pas. »
— Proverbes 16:9

Fais tes plans. Prépare-toi. Puis accepte que le chemin ne ressemble pas au dessin.

Bonne journée 🙏$m$),

('matin', 'sagesse', $m$🕊️ *Sagesse du jour*

« Ne dis pas à ton prochain : reviens demain, quand tu as de quoi donner aujourd'hui. »
— Proverbes 3:28

Ce qui vaut pour l'argent vaut pour la parole donnée. Ce que tu peux faire aujourd'hui, fais-le.

Bonne journée 🙏$m$),

-- ══ MATIN · GRATITUDE ═══════════════════════════════════════
('matin', 'gratitude', $m$🌾 *Avant de demander*

Compte trois choses que tu as ce matin et que tu n'avais pas il y a cinq ans.

La reconnaissance ne remplace pas la demande. Elle la rend juste plus paisible.

Bonne journée 🙏$m$),

('matin', 'gratitude', $m$🌾 *Avant de demander*

« Rendez grâces en toutes choses. »
— 1 Thessaloniciens 5:18

En toutes choses, pas pour toutes choses. La nuance change tout quand la saison est dure.

Bonne journée 🙏$m$),

('matin', 'gratitude', $m$🌾 *Avant de demander*

Quelqu'un prie ce matin pour ce que tu as déjà : la santé, un travail, une famille qui répond au téléphone.

Ne laisse pas ce qui manque effacer ce qui est là.

Bonne journée 🙏$m$),

('matin', 'gratitude', $m$🌾 *Avant de demander*

Tu as traversé des choses dont tu pensais ne pas te relever. Tu es là ce matin.

Ce n'est pas rien. C'est même l'essentiel.

Bonne journée 🙏$m$),

-- ══ SOIR · DISCERNEMENT ═════════════════════════════════════
('soir', 'discernement', $m$🔍 *Un signe à observer*

Comment réagit-il quand tu dis non ?

Une personne saine est déçue puis passe à autre chose. Une personne qui pose problème insiste, boude, ou te fait payer.

Bonne soirée 🌙$m$),

('soir', 'discernement', $m$🔍 *Un signe à observer*

Est-ce que tu peux avoir une opinion différente sans que la soirée soit gâchée ?

Si la réponse est non, ce n'est pas un détail de caractère. C'est le climat de ta vie future.

Bonne soirée 🌙$m$),

('soir', 'discernement', $m$🔍 *Un signe à observer*

L'amour véritable ne demande pas de couper les liens avec ta famille, tes amis ou ton église.

Ce qui t'isole ne te protège pas. Ce qui t'isole te prépare.

Bonne soirée 🌙$m$),

('soir', 'discernement', $m$🔍 *Un signe à observer*

Les paroles sont gratuites. Regarde plutôt ce qui se répète : les rendez-vous tenus, les promesses suivies d'effet, la constance sur trois mois.

Bonne soirée 🌙$m$),

('soir', 'discernement', $m$🔍 *Un signe à observer*

« Vous les reconnaîtrez à leurs fruits. »
— Matthieu 7:16

Pas à leurs paroles. Pas à leur assiduité au culte. À leurs fruits.

Bonne soirée 🌙$m$),

('soir', 'discernement', $m$🔍 *Un signe à observer*

Si tu dois cacher cette relation à ceux qui t'aiment, demande-toi pourquoi.

La honte est souvent un avertissement avant d'être un sentiment.

Bonne soirée 🌙$m$),

-- ══ SOIR · FAMILLE ══════════════════════════════════════════
('soir', 'famille', $m$🏠 *Le foyer*

On n'épouse pas seulement une personne : on épouse une histoire, une famille, des habitudes.

Rencontre les siens avant de décider. Pas pour juger — pour comprendre d'où elle vient.

Bonne soirée 🌙$m$),

('soir', 'famille', $m$🏠 *Le foyer*

Parlez d'argent avant le mariage. Combien vous gagnez, ce que vous devez, ce que vous envoyez à vos familles.

Beaucoup de foyers se déchirent là-dessus, jamais sur ce qu'ils avaient annoncé.

Bonne soirée 🌙$m$),

('soir', 'famille', $m$🏠 *Le foyer*

Si l'un veut des enfants et l'autre non, ce n'est pas une divergence : c'est deux vies différentes.

Dites-le tôt. Dites-le clairement. C'est une preuve de respect, pas un manque de romantisme.

Bonne soirée 🌙$m$),

('soir', 'famille', $m$🏠 *Le foyer*

« Quant à moi et à ma maison, nous servirons l'Éternel. »
— Josué 24:15

Une décision prise à deux, avant que les enfants n'arrivent, tient bien mieux qu'une habitude improvisée.

Bonne soirée 🌙$m$),

('soir', 'famille', $m$🏠 *Le foyer*

Le respect des aînés est une belle chose. Il ne signifie pas leur laisser choisir ton conjoint.

Écoute leur conseil. La décision reste la tienne — et la responsabilité aussi.

Bonne soirée 🌙$m$),

-- ══ Quelques messages de plus sur les angles existants ══════
('matin', 'verset', $m$📖 *Verset du jour*

« Deux valent mieux qu'un… car s'ils tombent, l'un relève son compagnon. Mais malheur à celui qui est seul et qui tombe ! »
— Ecclésiaste 4:9-10

Chercher quelqu'un n'est pas un manque de foi. C'est écrit noir sur blanc.

Bonne journée 🙏$m$),

('matin', 'verset', $m$📖 *Verset du jour*

« Recommande à l'Éternel tes œuvres, et tes projets réussiront. »
— Proverbes 16:3

Recommande — pas « abandonne ». Tu gardes tes mains sur l'ouvrage.

Bonne journée 🙏$m$),

('matin', 'priere', $m$🙏 *Prière du matin*

Seigneur,
Ôte de mon cœur l'amertume laissée par ceux qui sont partis.
Que je n'entre pas dans une nouvelle histoire en portant l'ancienne.

Amen.$m$),

('matin', 'promesse', $m$✨ *Une promesse pour aujourd'hui*

« Je te fortifie, je viens à ton secours, je te soutiens de ma droite triomphante. »
— Ésaïe 41:10

Trois verbes. Aucun ne dépend de ce que tu réussiras aujourd'hui.

Bonne journée 🙏$m$),

('soir', 'attente', $m$⏳ *Sur l'attente*

Ne compare pas ton chapitre trois au chapitre vingt de quelqu'un d'autre.

Les mariages qu'on voit sur les réseaux ont aussi commencé par des années dont personne n'a publié les photos.

Bonne soirée 🌙$m$),

('soir', 'caractere', $m$🌱 *Se préparer*

Apprends à vivre seul avant de vouloir vivre à deux.

Celui qui ne supporte pas sa propre compagnie demandera à l'autre de combler un vide que personne ne peut combler.

Bonne soirée 🌙$m$),

('soir', 'temoignage', $m$💍 *Ils y sont arrivés*

Elle avait dit non trois fois à un homme bien, parce qu'il ne ressemblait pas à ce qu'elle imaginait.

La quatrième fois, elle a accepté un café. Ils fêtent leurs cinq ans.

Parfois la réponse a une autre tête que la question.

Bonne soirée 🌙$m$),

('soir', 'question', $m$💬 *Question du soir*

Qu'est-ce qui compte le plus à tes yeux : la foi, le caractère, ou le projet de vie ?

Et pourquoi celui-là avant les deux autres ? 👇$m$),

('soir', 'agape', $m$❤️ *AgapeMeet*

On ne promet pas de miracle. On promet un endroit où les gens cherchent la même chose que toi : un foyer, pas une distraction.

👉 https://agapemeet.com

Bonne soirée 🌙$m$)

ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 2. Le versement des messages écrits automatiquement
-- ------------------------------------------------------------
-- Une fonction dédiée plutôt qu'un INSERT direct depuis la fonction Edge :
-- l'unicité repose sur un index d'EXPRESSION (`md5(contenu)`), que
-- PostgREST ne sait pas désigner comme cible de conflit. Le `ON CONFLICT
-- DO NOTHING` doit donc être écrit ici, en SQL.
CREATE OR REPLACE FUNCTION public.ajouter_modeles_whatsapp(p_messages jsonb)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_n integer := 0;
  v_m jsonb;
BEGIN
  FOR v_m IN SELECT * FROM jsonb_array_elements(p_messages) LOOP
    -- Une insertion par message, et non un lot : un seul doublon ferait
    -- retomber tout le lot, et l'on perdrait six textes valides pour un.
    INSERT INTO public.whatsapp_modeles (moment, angle, contenu)
    VALUES (v_m ->> 'moment', v_m ->> 'angle', v_m ->> 'contenu')
    ON CONFLICT DO NOTHING;

    IF FOUND THEN v_n := v_n + 1; END IF;
  END LOOP;

  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.ajouter_modeles_whatsapp(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ajouter_modeles_whatsapp(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.ajouter_modeles_whatsapp(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ajouter_modeles_whatsapp(jsonb) TO service_role;

-- ------------------------------------------------------------
-- 3. L'appel nocturne à la rédaction
-- ------------------------------------------------------------
INSERT INTO public.server_secrets (key, value)
VALUES ('whatsapp_redaction_endpoint',
        'https://nszcepszwzwafvfuxxip.supabase.co/functions/v1/whatsapp-redaction')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

CREATE OR REPLACE FUNCTION public.declencher_redaction_whatsapp()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_url    text;
  v_secret text;
  v_stock  integer;
BEGIN
  SELECT value INTO v_url    FROM public.server_secrets WHERE key = 'whatsapp_redaction_endpoint';
  SELECT value INTO v_secret FROM public.server_secrets WHERE key = 'push_secret';

  IF v_url IS NULL OR v_url LIKE '%VOTRE-PROJET%' THEN
    RETURN;
  END IF;

  -- Plafond de stock. Sans lui, la banque grossirait indéfiniment : au
  -- bout d'un an on paierait chaque nuit pour des messages qui ne
  -- reviendraient jamais devant les abonnés.
  SELECT count(*) INTO v_stock FROM public.whatsapp_modeles WHERE actif;
  IF v_stock >= public.setting_int('whatsapp_stock_max', 400) THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', COALESCE(v_secret, '')
    ),
    body    := '{}'::jsonb
  );
END;
$$;

INSERT INTO public.app_settings (key, value, label) VALUES
  ('whatsapp_stock_max', '400'::jsonb, 'Chaîne WhatsApp — messages max en banque')
ON CONFLICT (key) DO NOTHING;

SELECT cron.unschedule('agape-whatsapp-redaction')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agape-whatsapp-redaction');

-- 2 h du matin : avant le remplissage du calendrier (3 h), pour que les
-- messages écrits cette nuit soient programmables dès le lendemain.
SELECT cron.schedule(
  'agape-whatsapp-redaction',
  '0 2 * * *',
  $$SELECT public.declencher_redaction_whatsapp();$$
);

-- Le calendrier tient compte des nouveaux angles dès maintenant.
SELECT public.programmer_whatsapp() AS creneaux_programmes;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Contrôle
-- ------------------------------------------------------------
SELECT moment, angle, count(*) AS messages
FROM public.whatsapp_modeles WHERE actif
GROUP BY moment, angle ORDER BY moment, angle;

SELECT
  (SELECT count(*) FROM public.whatsapp_modeles WHERE actif) AS banque,
  (SELECT count(*) FROM cron.job WHERE jobname = 'agape-whatsapp-redaction') AS tache_redaction,
  (SELECT count(*) FROM public.server_secrets
    WHERE key = 'whatsapp_redaction_endpoint' AND value NOT LIKE '%VOTRE-PROJET%') AS endpoint_ok;

-- ============================================================
-- La vidéo « Comment ça marche »
-- ============================================================
-- Sur 149 inscrits, 103 n'ont jamais fait un seul geste dans l'écran de
-- découverte, et beaucoup ont écrit pour demander « comment trouver mon
-- âme sœur ». Une démonstration filmée répond à cette question mieux
-- qu'un texte, quel qu'il soit.
--
-- POURQUOI UN RÉGLAGE ET NON UNE CONSTANTE DANS LE CODE
--
-- Une première version de vidéo se refait presque toujours : le son est
-- trop bas, une étape manque, l'interface a changé. Passer par un
-- réglage permet de la remplacer en dix secondes depuis
-- /admin/parametres, sans reconstruire ni redéployer le site.
--
-- POURQUOI YOUTUBE, ET SÛREMENT PAS NOTRE STOCKAGE
--
-- Une vidéo de 30 Mo regardée par 149 membres, ce sont 4,5 Go de bande
-- passante — presque le quota mensuel entier, en une journée, et chaque
-- nouvel inscrit la regarde à son tour. C'est très exactement ce qui
-- vient de mettre le projet en dépassement avec les photos. YouTube
-- absorbe ce coût et adapte la qualité aux réseaux mobiles.

INSERT INTO public.app_settings (key, value, label) VALUES
  ('video_guide_url',
   '"https://youtu.be/_ljLfV0rIXQ"'::jsonb,
   'Vidéo « Comment ça marche » — adresse YouTube')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Contrôle
-- ------------------------------------------------------------
SELECT value #>> '{}' AS adresse_video
FROM public.app_settings WHERE key = 'video_guide_url';

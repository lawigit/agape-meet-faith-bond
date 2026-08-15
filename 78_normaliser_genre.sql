-- ============================================================
-- Genre : une seule convention, « male » / « female »
-- ============================================================
-- LE DÉFAUT
--
-- L'inscription enregistrait `homme` / `femme`. TOUT LE RESTE de
-- l'application attend `male` / `female` : la page profil, les filtres,
-- les statistiques d'administration, les répartitions publicitaires.
--
-- CE QUE CELA CASSAIT, ET QUI DÉPASSE L'AFFICHAGE
--
--   • /profil affichait « Non précisé » — aucune option ne correspondait
--     à la valeur enregistrée. C'est le symptôme visible.
--
--   • LE DECK SE FILTRAIT DANS LE VIDE. L'accueil applique
--     `gender = seeking_gender` : une personne cherchant `female` ne
--     croisait aucun profil enregistré `femme`. Selon l'ordre des
--     inscriptions, on pouvait ne voir personne sans comprendre pourquoi.
--
--   • Les tableaux d'administration comptaient ces membres en « genre non
--     renseigné » : les migrations 44 et 45 testent explicitement
--     `gender NOT IN ('female','male')`.
--
--   • Les répartitions Meta Ads séparaient « homme » et « male » en deux
--     segments, faussant tout ciblage.
--
-- POURQUOI ALIGNER SUR L'ANGLAIS PLUTÔT QUE SUR LE FRANÇAIS
--
-- Ce n'est pas un choix de goût : quatre écrans, deux fonctions SQL et
-- les filtres utilisent déjà `male`/`female`. Basculer dans l'autre sens
-- aurait demandé de tout réécrire, avec bien plus d'occasions d'oublier
-- un endroit.
--
-- ⚠️ MODIFIE DES DONNÉES. Idempotent : réexécuter ne change rien de plus.

-- ------------------------------------------------------------
-- Avant : l'état des lieux
-- ------------------------------------------------------------
SELECT 'AVANT' AS moment, gender, count(*)
FROM public.profiles GROUP BY gender ORDER BY count(*) DESC;

-- ------------------------------------------------------------
-- La conversion
-- ------------------------------------------------------------
UPDATE public.profiles
SET gender = CASE lower(trim(gender))
               WHEN 'homme' THEN 'male'
               WHEN 'femme' THEN 'female'
               ELSE gender
             END
WHERE lower(trim(gender)) IN ('homme', 'femme');

-- `seeking_gender` porte le même défaut, et c'est LUI qui filtre le
-- deck. Le corriger sans corriger `gender` — ou l'inverse — laisserait
-- la moitié du problème en place.
--
-- `all` est conservé tel quel : c'est déjà la valeur attendue partout.
UPDATE public.profiles
SET seeking_gender = CASE lower(trim(seeking_gender))
                       WHEN 'homme' THEN 'male'
                       WHEN 'femme' THEN 'female'
                       ELSE seeking_gender
                     END
WHERE lower(trim(seeking_gender)) IN ('homme', 'femme');

-- ------------------------------------------------------------
-- Après : contrôle
-- ------------------------------------------------------------
-- `restants` doit valoir 0. Toute autre valeur que male, female, all ou
-- NULL signale une troisième convention qu'il faudra traiter à part.
SELECT
  'APRES' AS moment,
  (SELECT count(*) FROM public.profiles WHERE gender = 'male')   AS hommes,
  (SELECT count(*) FROM public.profiles WHERE gender = 'female') AS femmes,
  (SELECT count(*) FROM public.profiles
    WHERE gender IS NOT NULL AND gender NOT IN ('male', 'female')) AS restants,
  (SELECT count(*) FROM public.profiles
    WHERE seeking_gender IS NOT NULL
      AND seeking_gender NOT IN ('male', 'female', 'all'))         AS recherche_restants;

-- ============================================================
-- Fermer l'insertion directe dans `messages`
-- ============================================================
-- À EXÉCUTER APRÈS AVOIR DÉPLOYÉ L'APPLICATION, jamais avant.
--
-- Séparée de la migration 86 pour une question de séquence :
--
--   1. migration 86 — `envoyer_message()` existe. L'ancienne
--      application continue d'insérer directement : rien ne casse.
--   2. déploiement — la nouvelle application appelle la fonction.
--   3. cette migration — l'insertion directe est fermée.
--
-- Inversé, l'ordre coupe la messagerie : soit l'ancienne application
-- écrit dans une table verrouillée, soit la nouvelle appelle une
-- fonction qui n'existe pas encore.
--
-- POURQUOI CETTE RÉVOCATION EST LE CŒUR DU DISPOSITIF
--
-- Sans elle, tout le reste est décoratif. La clé anon est publique par
-- construction — elle est dans le code du navigateur, lisible par
-- n'importe qui. Quiconque la copie peut écrire dans `messages` par un
-- appel HTTP et poster son numéro au premier message.
--
-- Une règle appliquée dans le navigateur n'est pas une règle, c'est une
-- suggestion. C'est cette ligne qui la rend réelle.

REVOKE INSERT ON public.messages FROM anon;
REVOKE INSERT ON public.messages FROM authenticated;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Contrôle — la colonne `insertion_directe` doit être VIDE.
-- ------------------------------------------------------------
SELECT string_agg(grantee, ', ') AS insertion_directe
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'messages'
  AND privilege_type = 'INSERT'
  AND grantee IN ('anon', 'authenticated');

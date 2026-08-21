-- ============================================================
-- La profession
-- ============================================================
-- Le champ existait dans le TYPE côté client, mais pas en base : les
-- deux écrans qui l'affichaient écrivaient « Profession non précisée »
-- en dur, pour tout le monde. Ce n'était pas une donnée, c'était un
-- décor.
--
-- POURQUOI ELLE COMPTE ICI
--
-- Sur une application de mariage, la profession dit le rythme de vie, la
-- mobilité, le milieu — autant de choses qu'on cherche à savoir et qu'on
-- n'ose pas demander au premier message. Elle donne aussi de quoi
-- engager une conversation autrement que par « ça va ? ».
--
-- ⚠️ Requiert la migration 86 : le déclencheur anti-coordonnées est
--    étendu pour couvrir ce nouveau champ.

-- ------------------------------------------------------------
-- 1. La colonne
-- ------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profession text;

-- 80 caractères : « Infirmière en pédiatrie au CHU de Lomé » tient
-- largement. Au-delà, ce n'est plus une profession, c'est une biographie
-- — et la place de la biographie est le champ « Présentation ».
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_profession_len;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_profession_len
  CHECK (profession IS NULL OR char_length(profession) <= 80);

-- ------------------------------------------------------------
-- 2. Un champ public de plus, donc un canal de plus
-- ------------------------------------------------------------
-- La profession est visible de tous, sans le moindre message échangé.
-- L'oublier ici rouvrirait exactement la brèche que la migration 86
-- referme : « Couturière — 90 12 34 56 » serait un profil public avec
-- un numéro dessus.
CREATE OR REPLACE FUNCTION public.enforce_profil_sans_coordonnees()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF public.contient_coordonnees(
       COALESCE(NEW.bio, '') || ' ' ||
       COALESCE(NEW.first_name, '') || ' ' ||
       COALESCE(NEW.last_name, '') || ' ' ||
       COALESCE(NEW.profession, '')) IS NOT NULL THEN
    RAISE EXCEPTION 'PROFIL_COORDONNEES'
      USING HINT = 'Un numéro ou un compte de réseau social ne peut pas figurer sur un profil public.';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_profil_coordonnees ON public.profiles;
CREATE TRIGGER trg_profil_coordonnees
BEFORE INSERT OR UPDATE OF bio, first_name, last_name, profession ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_profil_sans_coordonnees();

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Contrôle
-- ------------------------------------------------------------
-- La colonne doit exister, et le déclencheur surveiller quatre champs.
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'profession') AS colonne,
  (SELECT count(*) FROM pg_trigger
    WHERE tgname = 'trg_profil_coordonnees' AND NOT tgisinternal) AS declencheur;

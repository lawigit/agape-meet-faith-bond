-- ============================================================
-- Certification d'un profil — par fonction, plus par UPDATE direct
-- ============================================================
-- LE DÉFAUT CORRIGÉ
--
-- La certification était le SEUL geste d'administration qui écrivait
-- directement sur `profiles` depuis le navigateur :
--
--     supabase.from("profiles").update({ is_verified: true }).eq("id", …)
--
-- Toutes les autres écritures — suspension, levée de suspension, jours
-- offerts — passent par une fonction `SECURITY DEFINER`. Il y a deux
-- raisons à cela, et la seconde est la plus grave.
--
-- 1. LA POLITIQUE RLS. Si `profiles` n'autorise l'écriture que sur sa
--    propre ligne (`auth.uid() = id`), un administrateur qui certifie
--    quelqu'un d'autre est bloqué.
--
-- 2. UN REFUS RLS NE LÈVE AUCUNE ERREUR. PostgREST renvoie simplement
--    « 0 ligne modifiée », sans code d'erreur. Le navigateur affiche donc
--    « Profil certifié », la carte disparaît de la file… et rien n'a été
--    écrit. L'échec est totalement silencieux, et ne se découvre qu'en
--    rechargeant la page — ou jamais.
--
-- Et si à l'inverse la politique autorisait l'administrateur à écrire sur
-- `profiles`, elle l'autoriserait sur TOUTES les colonnes : plan,
-- abonnement, rôle. Une fonction qui ne touche qu'`is_verified` est aussi
-- une réduction de surface.
--
-- `is_admin()` couvre les rôles `admin` ET `moderator` : la file de
-- vérification vit dans la modération, un modérateur doit pouvoir la
-- traiter.
--
-- ⚠️ AJOUT PUR : une fonction. Aucune politique, aucune table modifiée.

CREATE OR REPLACE FUNCTION public.admin_certifier_profil(
  p_user    uuid,
  p_verifie boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'forbidden');
  END IF;

  UPDATE public.profiles
  SET is_verified = COALESCE(p_verifie, true)
  WHERE id = p_user;

  -- Le décompte est RENVOYÉ à l'appelant : c'est lui qui permet à
  -- l'interface de distinguer un succès d'un profil introuvable, au lieu
  -- d'annoncer une réussite dans les deux cas.
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'introuvable');
  END IF;

  RETURN jsonb_build_object('ok', true, 'verifie', COALESCE(p_verifie, true));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_certifier_profil(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_certifier_profil(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_certifier_profil(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Diagnostic — la politique d'écriture actuelle sur `profiles`
-- ------------------------------------------------------------
-- Si `cmd` vaut UPDATE et que `qual` se limite à `auth.uid() = id`, la
-- certification en direct était effectivement bloquée, et silencieusement.
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY cmd, policyname;

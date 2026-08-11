-- ============================================================
-- Parrainage à vie — 20 % sur les abonnements
-- ============================================================
-- LE PRINCIPE QUI GOUVERNE TOUT
--
-- Une commission ne naît JAMAIS d'un clic, d'une inscription ou d'une
-- intention d'achat : uniquement d'un paiement passé en `completed`.
-- C'est la même règle que pour l'événement `Purchase` envoyé à Meta.
--
-- Le déclenchement est un TRIGGER sur `payments`, et non un ajout dans
-- le webhook Chariow. Un paiement peut être confirmé par plusieurs
-- chemins — le webhook, la réconciliation, une correction manuelle en
-- base — et un seul de ces chemins oublié suffirait à priver un parrain
-- de sa commission sans que personne ne s'en aperçoive. La base est le
-- seul endroit que tous traversent.
--
-- « À VIE » SIGNIFIE VRAIMENT À VIE
--
-- Les commissions continuent tant que le FILLEUL paie, quel que soit ce
-- que devient le parrain. Un parrain qui se désabonne continue de
-- percevoir. C'est la promesse faite, et la trahir une seule fois
-- suffirait à rendre le programme inutilisable.
--
-- Seule la suppression du compte y met fin, faute de destinataire.
--
-- ⚠️ AJOUT PUR : nouvelles tables, nouvelles colonnes, nouveau trigger.
--    Aucun comportement existant n'est modifié.

-- ------------------------------------------------------------
-- 1. Réglages — le programme est ÉTEINT par défaut
-- ------------------------------------------------------------
INSERT INTO public.app_settings (key, value, label) VALUES
  ('affiliation_active', 'false'::jsonb,
   'Programme de parrainage actif'),

  -- « invitation » : vous désignez les parrains un par un.
  -- « tous » : chaque membre obtient son lien automatiquement.
  --
  -- Démarrer en « invitation » n'est pas une précaution excessive.
  -- C'est la seule protection réelle contre la cannibalisation : sans
  -- elle, quelqu'un crée un second compte, s'inscrit par son propre
  -- lien, et vous lui versez 20 % à vie sur un abonnement qu'il aurait
  -- payé de toute façon.
  ('affiliation_mode', '"invitation"'::jsonb,
   'Mode : invitation ou tous'),

  ('affiliation_taux', '20'::jsonb,
   'Pourcentage versé au parrain'),

  ('affiliation_seuil', '3000'::jsonb,
   'Montant minimum de retrait (F CFA)'),

  -- Une commission n'est retirable qu'après ce délai. Sans lui, on
  -- fabrique un faux compte, on paie, on encaisse 20 %, et on disparaît
  -- avant que la modération n'ait rien vu.
  ('affiliation_maturation_jours', '7'::jsonb,
   'Jours avant qu''une commission devienne retirable')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- 2. Les parrains
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliates (
  user_id    uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  code       text NOT NULL UNIQUE,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Voir son propre parrainage" ON public.affiliates;
CREATE POLICY "Voir son propre parrainage"
ON public.affiliates FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

-- Aucune politique d'écriture : les lignes ne naissent que par les
-- fonctions ci-dessous. Un membre ne doit pas pouvoir s'auto-affilier
-- ni réactiver un code que vous avez coupé.

-- ------------------------------------------------------------
-- 3. Le lien parrain → filleul
-- ------------------------------------------------------------
-- Posé UNE SEULE FOIS, à l'inscription. Le premier lien gagne : c'est
-- lui qui a produit la venue. Un second lien cliqué plus tard ne doit
-- pas pouvoir voler la filleul à celui qui l'a amenée.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referred_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS profiles_referred_by_idx
ON public.profiles (referred_by) WHERE referred_by IS NOT NULL;

-- ------------------------------------------------------------
-- 4. Les retraits
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payouts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_xof  integer NOT NULL CHECK (amount_xof > 0),
  numero      text NOT NULL,
  status      text NOT NULL DEFAULT 'demande'
              CHECK (status IN ('demande', 'payee', 'refusee')),
  note        text,
  demande_le  timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  paye_le     timestamp with time zone,
  paye_par    uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS payouts_referrer_idx ON public.payouts (referrer_id, demande_le DESC);
CREATE INDEX IF NOT EXISTS payouts_status_idx   ON public.payouts (status, demande_le);

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Voir ses retraits" ON public.payouts;
CREATE POLICY "Voir ses retraits"
ON public.payouts FOR SELECT TO authenticated
USING (referrer_id = auth.uid() OR public.is_admin());

-- ------------------------------------------------------------
-- 5. Les commissions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- UNIQUE, et c'est la protection la plus importante de ce fichier.
  -- Un webhook peut se déclencher deux fois pour la même vente ; sans
  -- cette contrainte, vous payez deux fois la même commission.
  payment_id  uuid NOT NULL UNIQUE REFERENCES public.payments(id) ON DELETE CASCADE,

  referrer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  base_xof    integer NOT NULL,
  -- Le taux est FIGÉ au moment de l'encaissement. Passer plus tard de
  -- 20 % à 25 % ne doit jamais réécrire l'historique : une commission
  -- déjà annoncée à un parrain ne se recalcule pas.
  taux        numeric(5,2) NOT NULL,
  amount_xof  integer NOT NULL CHECK (amount_xof > 0),

  -- « disponible » n'est pas un état stocké : c'est `en_attente` dont
  -- la date de maturité est passée. Un état calculé ne peut pas se
  -- désynchroniser, là où une tâche planifiée qui cesse de tourner
  -- laisserait des commissions bloquées sans que rien ne l'indique.
  status      text NOT NULL DEFAULT 'en_attente'
              CHECK (status IN ('en_attente', 'payee', 'annulee')),
  mature_le   timestamp with time zone NOT NULL,

  payout_id   uuid REFERENCES public.payouts(id) ON DELETE SET NULL,
  created_at  timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS commissions_referrer_idx
ON public.commissions (referrer_id, status, mature_le);
CREATE INDEX IF NOT EXISTS commissions_referred_idx
ON public.commissions (referred_id);

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Voir ses commissions" ON public.commissions;
CREATE POLICY "Voir ses commissions"
ON public.commissions FOR SELECT TO authenticated
USING (referrer_id = auth.uid() OR public.is_admin());

-- ------------------------------------------------------------
-- 6. Génération d'un code
-- ------------------------------------------------------------
-- Alphabet volontairement amputé de 0/O, 1/I/L : le code sera dicté au
-- téléphone et recopié à la main.
CREATE OR REPLACE FUNCTION public.generer_code_parrain()
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_alpha text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code  text;
  v_essai integer := 0;
BEGIN
  LOOP
    v_code := '';
    FOR i IN 1..5 LOOP
      v_code := v_code || substr(v_alpha, 1 + floor(random() * length(v_alpha))::int, 1);
    END LOOP;

    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.affiliates WHERE code = v_code);

    v_essai := v_essai + 1;
    IF v_essai > 50 THEN
      RAISE EXCEPTION 'Impossible de générer un code unique';
    END IF;
  END LOOP;

  RETURN v_code;
END;
$$;

-- ------------------------------------------------------------
-- 7. Rattachement du filleul, à l'inscription
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rattacher_parrain(p_code text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_moi     uuid := auth.uid();
  v_parrain uuid;
  v_deja    uuid;
BEGIN
  IF v_moi IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'non_connecte');
  END IF;

  IF NOT COALESCE((SELECT (value #>> '{}')::boolean
                   FROM public.app_settings WHERE key = 'affiliation_active'), false) THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'programme_inactif');
  END IF;

  SELECT referred_by INTO v_deja FROM public.profiles WHERE id = v_moi;
  IF v_deja IS NOT NULL THEN
    -- Le premier parrain garde son filleul. Ce n'est pas une erreur.
    RETURN jsonb_build_object('ok', false, 'raison', 'deja_rattache');
  END IF;

  SELECT user_id INTO v_parrain
  FROM public.affiliates
  WHERE code = upper(trim(p_code)) AND active;

  IF v_parrain IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'code_inconnu');
  END IF;

  -- L'auto-parrainage est refusé EN BASE, pas seulement dans l'écran :
  -- une interface se contourne, une fonction non.
  IF v_parrain = v_moi THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'auto_parrainage');
  END IF;

  UPDATE public.profiles
  SET referred_by = v_parrain, referred_at = now()
  WHERE id = v_moi AND referred_by IS NULL;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ------------------------------------------------------------
-- 8. LE TRIGGER — naissance d'une commission
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.creer_commission()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parrain uuid;
  v_taux    numeric;
  v_jours   integer;
  v_montant integer;
BEGIN
  -- Seul le passage À `completed` compte.
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  -- ⚠️ OLD est testé dans un IF SÉPARÉ, jamais dans la même expression
  -- que TG_OP. PL/pgSQL prépare une condition composée comme une seule
  -- requête SQL : sur un INSERT, où OLD n'existe pas, `TG_OP='INSERT'
  -- OR OLD.status<>...` échouerait malgré la branche non empruntée.
  -- C'est exactement le défaut qui avait bloqué toutes les écritures.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'completed' THEN
      RETURN NEW;   -- déjà encaissé, déjà commissionné
    END IF;
  END IF;

  -- Abonnements uniquement : les Boosts ne rémunèrent pas.
  IF NEW.plan_id NOT IN ('premium', 'vip') THEN
    RETURN NEW;
  END IF;

  IF NOT COALESCE((SELECT (value #>> '{}')::boolean
                   FROM public.app_settings WHERE key = 'affiliation_active'), false) THEN
    RETURN NEW;
  END IF;

  SELECT referred_by INTO v_parrain FROM public.profiles WHERE id = NEW.user_id;

  IF v_parrain IS NULL OR v_parrain = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Le code doit être actif AU MOMENT DE L'ENCAISSEMENT. Couper un
  -- parrain pour fraude arrête ses gains futurs sans toucher aux
  -- commissions déjà acquises.
  IF NOT EXISTS (SELECT 1 FROM public.affiliates
                 WHERE user_id = v_parrain AND active) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE((value #>> '{}')::numeric, 20) INTO v_taux
  FROM public.app_settings WHERE key = 'affiliation_taux';

  SELECT COALESCE((value #>> '{}')::integer, 7) INTO v_jours
  FROM public.app_settings WHERE key = 'affiliation_maturation_jours';

  v_montant := round(NEW.amount_xof * COALESCE(v_taux, 20) / 100.0);

  IF v_montant <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.commissions (
    payment_id, referrer_id, referred_id,
    base_xof, taux, amount_xof, mature_le
  ) VALUES (
    NEW.id, v_parrain, NEW.user_id,
    NEW.amount_xof, COALESCE(v_taux, 20), v_montant,
    now() + make_interval(days => COALESCE(v_jours, 7))
  )
  ON CONFLICT (payment_id) DO NOTHING;   -- webhook rejoué : sans effet

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS creer_commission_trg ON public.payments;
CREATE TRIGGER creer_commission_trg
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.creer_commission();

-- ------------------------------------------------------------
-- 9. Annulation — remboursement
-- ------------------------------------------------------------
-- Une commission déjà VERSÉE n'est pas reprise : l'argent est parti, et
-- créer un solde négatif chez un parrain de bonne foi coûterait plus
-- cher en confiance que la somme récupérée.
CREATE OR REPLACE FUNCTION public.annuler_commission()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'refunded' THEN
    UPDATE public.commissions
    SET status = 'annulee'
    WHERE payment_id = NEW.id AND status = 'en_attente';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS annuler_commission_trg ON public.payments;
CREATE TRIGGER annuler_commission_trg
AFTER UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.annuler_commission();

-- ------------------------------------------------------------
-- 10. Annulation — filleul suspendu
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.annuler_commissions_suspension()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.suspended_until IS NOT NULL
     AND NEW.suspended_until > now() THEN
    -- Uniquement les commissions non encore mûres : c'est la raison
    -- d'être du délai de maturation.
    UPDATE public.commissions
    SET status = 'annulee'
    WHERE referred_id = NEW.id
      AND status = 'en_attente'
      AND mature_le > now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS annuler_commissions_suspension_trg ON public.profiles;
CREATE TRIGGER annuler_commissions_suspension_trg
AFTER UPDATE OF suspended_until ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.annuler_commissions_suspension();

-- ------------------------------------------------------------
-- 11. Vue membre
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mon_parrainage()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_moi    uuid := auth.uid();
  v_actif  boolean;
  v_mode   text;
  v_code   text;
  v_ok     boolean;
BEGIN
  IF v_moi IS NULL THEN
    RETURN jsonb_build_object('error', 'non_connecte');
  END IF;

  SELECT COALESCE((value #>> '{}')::boolean, false) INTO v_actif
  FROM public.app_settings WHERE key = 'affiliation_active';

  IF NOT COALESCE(v_actif, false) THEN
    RETURN jsonb_build_object('programme_actif', false);
  END IF;

  SELECT COALESCE(value #>> '{}', 'invitation') INTO v_mode
  FROM public.app_settings WHERE key = 'affiliation_mode';

  SELECT code, active INTO v_code, v_ok
  FROM public.affiliates WHERE user_id = v_moi;

  -- En mode « tous », le code est créé à la première visite de la page.
  IF v_code IS NULL AND v_mode = 'tous' THEN
    INSERT INTO public.affiliates (user_id, code)
    VALUES (v_moi, public.generer_code_parrain())
    ON CONFLICT (user_id) DO NOTHING;

    SELECT code, active INTO v_code, v_ok
    FROM public.affiliates WHERE user_id = v_moi;
  END IF;

  IF v_code IS NULL THEN
    RETURN jsonb_build_object('programme_actif', true, 'autorise', false);
  END IF;

  RETURN jsonb_build_object(
    'programme_actif', true,
    'autorise', COALESCE(v_ok, false),
    'code', v_code,
    'taux',  (SELECT (value #>> '{}')::numeric FROM public.app_settings WHERE key = 'affiliation_taux'),
    'seuil', (SELECT (value #>> '{}')::integer FROM public.app_settings WHERE key = 'affiliation_seuil'),
    'maturation_jours', (SELECT (value #>> '{}')::integer FROM public.app_settings WHERE key = 'affiliation_maturation_jours'),

    'filleuls_total', (SELECT count(*)::integer FROM public.profiles WHERE referred_by = v_moi),
    'filleuls_payants', (
      SELECT count(DISTINCT referred_id)::integer FROM public.commissions
      WHERE referrer_id = v_moi AND status <> 'annulee'
    ),

    -- Trois soldes, jamais confondus : ce que j'ai gagné, ce que je peux
    -- demander maintenant, ce que j'ai déjà reçu.
    'gains_total', COALESCE((
      SELECT sum(amount_xof)::integer FROM public.commissions
      WHERE referrer_id = v_moi AND status <> 'annulee'), 0),
    'en_attente', COALESCE((
      SELECT sum(amount_xof)::integer FROM public.commissions
      WHERE referrer_id = v_moi AND status = 'en_attente' AND mature_le > now()), 0),
    -- `payout_id IS NULL` est indispensable : une commission rattachée à
    -- une demande de retrait en cours n'est plus disponible. Sans ce
    -- filtre, le membre verrait la même somme deux fois — une fois dans
    -- son retrait en attente, une fois dans son solde.
    'disponible', COALESCE((
      SELECT sum(amount_xof)::integer FROM public.commissions
      WHERE referrer_id = v_moi AND status = 'en_attente'
        AND mature_le <= now() AND payout_id IS NULL), 0),
    'paye', COALESCE((
      SELECT sum(amount_xof)::integer FROM public.commissions
      WHERE referrer_id = v_moi AND status = 'payee'), 0),
    'retrait_en_cours', EXISTS (
      SELECT 1 FROM public.payouts WHERE referrer_id = v_moi AND status = 'demande'),

    'filleuls', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        -- Prénom seul, comme partout ailleurs dans l'application : un
        -- parrain n'a pas à connaître le nom complet de ses filleuls.
        'prenom', COALESCE(NULLIF(p.first_name, ''), 'Membre'),
        'depuis', p.referred_at,
        'gains', COALESCE((SELECT sum(c.amount_xof)::integer FROM public.commissions c
                           WHERE c.referred_id = p.id AND c.referrer_id = v_moi
                             AND c.status <> 'annulee'), 0)
      ) ORDER BY p.referred_at DESC NULLS LAST)
      FROM public.profiles p WHERE p.referred_by = v_moi
    ), '[]'::jsonb),

    'historique', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'date' DESC) FROM (
        SELECT jsonb_build_object(
          'date', c.created_at, 'montant', c.amount_xof,
          'base', c.base_xof, 'taux', c.taux, 'statut', c.status,
          'mature_le', c.mature_le
        ) AS x
        FROM public.commissions c
        WHERE c.referrer_id = v_moi
        ORDER BY c.created_at DESC LIMIT 50
      ) t
    ), '[]'::jsonb),

    'retraits', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'montant', amount_xof, 'statut', status,
        'demande_le', demande_le, 'paye_le', paye_le
      ) ORDER BY demande_le DESC)
      FROM public.payouts WHERE referrer_id = v_moi
    ), '[]'::jsonb)
  );
END;
$$;

-- ------------------------------------------------------------
-- 12. Demande de retrait
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.demander_retrait(p_numero text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_moi   uuid := auth.uid();
  v_seuil integer;
  v_dispo integer;
  v_id    uuid;
BEGIN
  IF v_moi IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'non_connecte');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.affiliates WHERE user_id = v_moi AND active) THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'non_autorise');
  END IF;

  -- Une seule demande à la fois : deux demandes concurrentes
  -- réclameraient les mêmes commissions.
  IF EXISTS (SELECT 1 FROM public.payouts WHERE referrer_id = v_moi AND status = 'demande') THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'demande_en_cours');
  END IF;

  IF length(trim(COALESCE(p_numero, ''))) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'numero_invalide');
  END IF;

  SELECT COALESCE((value #>> '{}')::integer, 3000) INTO v_seuil
  FROM public.app_settings WHERE key = 'affiliation_seuil';

  SELECT COALESCE(sum(amount_xof), 0)::integer INTO v_dispo
  FROM public.commissions
  WHERE referrer_id = v_moi AND status = 'en_attente'
    AND mature_le <= now() AND payout_id IS NULL;

  IF v_dispo < COALESCE(v_seuil, 3000) THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'sous_le_seuil',
                              'disponible', v_dispo, 'seuil', v_seuil);
  END IF;

  INSERT INTO public.payouts (referrer_id, amount_xof, numero)
  VALUES (v_moi, v_dispo, trim(p_numero))
  RETURNING id INTO v_id;

  -- Les commissions sont RATTACHÉES à la demande sans être marquées
  -- payées : elles ne le seront qu'une fois l'argent réellement envoyé.
  -- Ce rattachement les retire du solde disponible et empêche une
  -- seconde demande de les réclamer.
  UPDATE public.commissions
  SET payout_id = v_id
  WHERE referrer_id = v_moi AND status = 'en_attente'
    AND mature_le <= now() AND payout_id IS NULL;

  RETURN jsonb_build_object('ok', true, 'montant', v_dispo);
END;
$$;

-- ------------------------------------------------------------
-- 13. Administration
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_affiliation()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  RETURN jsonb_build_object(
    'actif', COALESCE((SELECT (value #>> '{}')::boolean FROM public.app_settings WHERE key = 'affiliation_active'), false),
    'mode',  COALESCE((SELECT value #>> '{}' FROM public.app_settings WHERE key = 'affiliation_mode'), 'invitation'),
    'taux',  COALESCE((SELECT (value #>> '{}')::numeric FROM public.app_settings WHERE key = 'affiliation_taux'), 20),
    'seuil', COALESCE((SELECT (value #>> '{}')::integer FROM public.app_settings WHERE key = 'affiliation_seuil'), 3000),
    'maturation_jours', COALESCE((SELECT (value #>> '{}')::integer FROM public.app_settings WHERE key = 'affiliation_maturation_jours'), 7),

    'nb_parrains', (SELECT count(*)::integer FROM public.affiliates WHERE active),
    'nb_filleuls', (SELECT count(*)::integer FROM public.profiles WHERE referred_by IS NOT NULL),
    'du_total',    COALESCE((SELECT sum(amount_xof)::integer FROM public.commissions WHERE status = 'en_attente'), 0),
    'paye_total',  COALESCE((SELECT sum(amount_xof)::integer FROM public.commissions WHERE status = 'payee'), 0),

    'parrains', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'gains')::int DESC) FROM (
        SELECT jsonb_build_object(
          'user_id', a.user_id,
          'nom',     trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
          'code',    a.code,
          'active',  a.active,
          'filleuls', (SELECT count(*)::integer FROM public.profiles f WHERE f.referred_by = a.user_id),
          'gains',   COALESCE((SELECT sum(c.amount_xof)::integer FROM public.commissions c
                               WHERE c.referrer_id = a.user_id AND c.status <> 'annulee'), 0),
          'du',      COALESCE((SELECT sum(c.amount_xof)::integer FROM public.commissions c
                               WHERE c.referrer_id = a.user_id AND c.status = 'en_attente'), 0)
        ) AS x
        FROM public.affiliates a
        JOIN public.profiles p ON p.id = a.user_id
      ) t
    ), '[]'::jsonb),

    'retraits', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', po.id,
        'nom', trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
        'montant', po.amount_xof, 'numero', po.numero,
        'statut', po.status, 'demande_le', po.demande_le, 'paye_le', po.paye_le
      ) ORDER BY po.demande_le DESC)
      FROM public.payouts po JOIN public.profiles p ON p.id = po.referrer_id
    ), '[]'::jsonb)
  );
END;
$$;

-- Désigner un parrain (mode invitation) ou couper un code.
CREATE OR REPLACE FUNCTION public.admin_definir_parrain(p_user uuid, p_active boolean)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  INSERT INTO public.affiliates (user_id, code, active)
  VALUES (p_user, public.generer_code_parrain(), p_active)
  ON CONFLICT (user_id) DO UPDATE SET active = p_active;

  RETURN jsonb_build_object('ok', true,
    'code', (SELECT code FROM public.affiliates WHERE user_id = p_user));
END;
$$;

-- Marquer un retrait comme payé. C'est VOUS qui envoyez l'argent par
-- Mobile Money ; cette fonction ne fait qu'enregistrer le fait.
-- Aucun versement automatique : un bug qui paie tout seul coûte
-- infiniment plus cher qu'un versement fait à la main.
CREATE OR REPLACE FUNCTION public.admin_payer_retrait(
  p_payout uuid, p_statut text DEFAULT 'payee', p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  IF p_statut NOT IN ('payee', 'refusee') THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'statut_invalide');
  END IF;

  UPDATE public.payouts
  SET status = p_statut, note = p_note,
      paye_le = CASE WHEN p_statut = 'payee' THEN now() ELSE NULL END,
      paye_par = auth.uid()
  WHERE id = p_payout AND status = 'demande';

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'introuvable_ou_deja_traite');
  END IF;

  IF p_statut = 'payee' THEN
    UPDATE public.commissions SET status = 'payee' WHERE payout_id = p_payout;
  ELSE
    -- Refus : les commissions redeviennent disponibles, elles ne sont
    -- pas perdues. Le parrain les a bien gagnées.
    UPDATE public.commissions SET payout_id = NULL WHERE payout_id = p_payout;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ------------------------------------------------------------
-- 14. Droits
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.generer_code_parrain() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rattacher_parrain(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mon_parrainage() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.demander_retrait(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_affiliation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_definir_parrain(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_payer_retrait(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rattacher_parrain(text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.mon_parrainage()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.demander_retrait(text)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_affiliation()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_definir_parrain(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_payer_retrait(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Contrôle
-- ------------------------------------------------------------
SELECT
  (SELECT count(*) FROM public.affiliates)  AS parrains,
  (SELECT count(*) FROM public.commissions) AS commissions,
  (SELECT value #>> '{}' FROM public.app_settings WHERE key = 'affiliation_active') AS actif,
  (SELECT value #>> '{}' FROM public.app_settings WHERE key = 'affiliation_taux')   AS taux;

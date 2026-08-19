-- ============================================================
-- Les coordonnées s'échangent après 30 messages
-- ============================================================
-- LE PROBLÈME
--
-- Des membres réclament un numéro dès le premier contact. C'est le
-- signal d'arnaque le plus fiable qui soit : un escroc veut sortir de
-- l'application au plus vite, là où plus rien ne le surveille et où le
-- signalement ne sert plus à rien.
--
-- LA RÈGLE
--
--   30 messages dans la conversation, dont au moins 12 de CHAQUE côté.
--
-- Le « de chaque côté » est l'essentiel. Avec un simple total, un
-- escroc envoie 29 messages tout seul et réclame le numéro au 30ᵉ. Il
-- faut qu'une conversation ait réellement eu lieu.
--
-- POURQUOI L'INSERTION DIRECTE EST RÉVOQUÉE
--
-- Un contrôle côté navigateur se contourne en trente secondes : la clé
-- anon est publique par nature, et n'importe qui peut écrire dans
-- `messages` par un simple appel HTTP. La seule défense qui tienne est
-- de fermer la table et de n'ouvrir qu'une porte : `envoyer_message()`.
--
-- Les quotas de formule continuent de s'appliquer : ils sont posés en
-- triggers, et la fonction insère — donc les triggers s'exécutent.
--
-- CE QUE CETTE RÈGLE N'ATTRAPE PAS
--
-- Une photo du numéro, ou un vocal qui le dicte. Il faudrait de l'OCR
-- et de la transcription. Ces deux brèches restent ouvertes : c'est un
-- choix assumé pour ne pas mutiler la conversation.

-- ------------------------------------------------------------
-- 1. Les réglages
-- ------------------------------------------------------------
INSERT INTO public.app_settings (key, value, label) VALUES
  ('contact_seuil_total',  '30'::jsonb, 'Coordonnées — messages requis dans la conversation'),
  ('contact_seuil_chacun', '12'::jsonb, 'Coordonnées — messages requis de chaque côté'),
  ('contact_fenetre_min',  '10'::jsonb, 'Coordonnées — minutes de recollement anti-découpage')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- 2. Le journal des tentatives
-- ------------------------------------------------------------
-- Refuser sans garder trace ne protège que la conversation en cours.
-- Trois tentatives depuis le même compte, sur trois conversations
-- différentes, c'est un profil à examiner — bien avant qu'un membre ne
-- pense à le signaler.
CREATE TABLE IF NOT EXISTS public.tentatives_coordonnees (
  id         bigserial PRIMARY KEY,
  match_id   uuid NOT NULL,
  auteur_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Le texte refusé est conservé : sans lui, la modération ne peut pas
  -- distinguer une arnaque d'un faux positif sur une date de naissance.
  extrait    text NOT NULL,
  motif      text NOT NULL,
  msg_total  integer NOT NULL,
  cree_le    timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS tentatives_auteur_idx
  ON public.tentatives_coordonnees (auteur_id, cree_le DESC);

ALTER TABLE public.tentatives_coordonnees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tentatives_admin ON public.tentatives_coordonnees;
CREATE POLICY tentatives_admin ON public.tentatives_coordonnees
  FOR SELECT USING (public.is_admin());

-- ------------------------------------------------------------
-- 3. Normalisation
-- ------------------------------------------------------------
-- L'ordre des opérations fait tout, et un détail décide de la fiabilité :
-- ON NE RETIRE JAMAIS LES LETTRES. Seuls les séparateurs disparaissent.
--
-- Les lettres restantes coupent les suites de chiffres. « sos » devient
-- « 505 », mais « je suis ravi de te lire » ne peut pas produire huit
-- chiffres d'affilée : il faudrait huit caractères consécutifs pris
-- dans {o, l, i, s}, ce qui n'arrive pas en français. C'est ce qui
-- permet de traduire les sosies sans noyer les vrais messages sous les
-- faux positifs.
CREATE OR REPLACE FUNCTION public.normaliser_coordonnees(p_texte text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT translate(
    regexp_replace(
      translate(
        -- Les dates partent d'abord : « 12/08/2026 » ferait huit
        -- chiffres et bloquerait un anniversaire.
        regexp_replace(lower(coalesce(p_texte, '')),
                       '\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}', ' ', 'g'),
        -- Chiffres arabes-indiens, persans et pleine largeur vers l'ASCII.
        '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹０１２３４５６７８９',
        '012345678901234567890123456789'),
      -- Séparateurs : c'est ce qui recolle « 90 12 34 56 ».
      '[\s./\-()+_,:;*#\[\]]', '', 'g'),
    -- Sosies. Uniquement celles-ci : elles sont peu fréquentes en
    -- suites longues, contrairement à « e » ou « a ».
    'olis', '0115');
$fn$;

-- ------------------------------------------------------------
-- 4. Détection
-- ------------------------------------------------------------
-- Renvoie le MOTIF, ou NULL si le texte est propre. Un motif nommé vaut
-- mieux qu'un booléen : la modération doit pouvoir distinguer un numéro
-- d'un renvoi vers WhatsApp.
CREATE OR REPLACE FUNCTION public.contient_coordonnees(p_texte text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  v_norm text := public.normaliser_coordonnees(p_texte);
  v_mots integer;
BEGIN
  -- a) Une suite de 8 chiffres ou plus. Huit est le format togolais et
  --    béninois ; en dessous, on bloquerait des prix et des âges.
  IF v_norm ~ '[0-9]{8,}' THEN
    RETURN 'numero';
  END IF;

  -- a-bis) L'indicatif international. Un « +228 » ou un « 00228 » est un
  --    signal bien plus fort que la longueur : quatre chiffres derrière
  --    suffisent alors à conclure, là où il en faut huit sans lui. Cela
  --    rattrape les numéros partiels — « +228 9012 » — qui passaient
  --    sous le seuil.
  --
  --    La liste est celle des indicatifs RÉELS, pas un « +\d{1,4} »
  --    générique : « +100 000 FCFA » serait sinon lu comme « +1 » suivi
  --    de cinq chiffres, donc pris pour un numéro.
  --
  --    Le « +1 » nord-américain est ABSENT pour cette raison précise :
  --    un seul chiffre suivi de n'importe quoi collisionne avec les
  --    prix, qui s'écrivent souvent avec un « + » en Afrique de l'Ouest.
  --    Les numéros américains font dix chiffres et tombent de toute
  --    façon sous la règle des huit.
  --
  --    Les indicatifs à trois chiffres précèdent ceux à deux : l'alter-
  --    native doit tester le plus spécifique en premier.
  --    Afrique de l'Ouest et centrale d'abord, puis les pays de la
  --    diaspora — c'est de là que viennent les membres.
  IF regexp_replace(lower(coalesce(p_texte, '')), '[\s.\-()_,;]', '', 'g') ~
     '(\+|00)(228|229|225|226|227|223|222|221|220|224|237|241|242|243|235|236|240|245|234|233|231|232|238|261|269|250|257|253|212|213|216|351|352|353|350|33|32|41|44|49|39|34|31|30|43|45|46|47|48)[0-9]{4,}' THEN
    RETURN 'indicatif';
  END IF;

  -- b) Le numéro dicté en toutes lettres. On COMPTE les mots-nombres au
  --    lieu de les convertir : « quatre-vingt-douze » se convertit mal,
  --    mais se compte très bien. « un » et « une » sont exclus — trop
  --    courants pour distinguer un numéro d'une phrase ordinaire.
  SELECT count(*) INTO v_mots
  FROM regexp_matches(
    lower(coalesce(p_texte, '')),
    '\m(zero|zéro|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|septante|nonante)\M',
    'g') AS m;

  IF v_mots >= 5 THEN
    RETURN 'numero_en_lettres';
  END IF;

  -- c) Sortir de l'application par un autre canal.
  IF lower(coalesce(p_texte, '')) ~
     '(wa\.me|t\.me|whats\s?app|telegram|snapchat|\msnap\M|viber|messenger|instagram|\minsta\M|facebook|tiktok|\mimo\M)' THEN
    RETURN 'autre_canal';
  END IF;

  RETURN NULL;
END;
$fn$;

-- ------------------------------------------------------------
-- 5. Où en est la conversation
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.etat_coordonnees(p_match uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_moi    uuid := auth.uid();
  v_total  integer := public.setting_int('contact_seuil_total', 30);
  v_chacun integer := public.setting_int('contact_seuil_chacun', 12);
  v_a      integer;
  v_b      integer;
  v_autre  uuid;
BEGIN
  IF v_moi IS NULL THEN
    RETURN jsonb_build_object('debloque', false);
  END IF;

  SELECT CASE WHEN m.user1_id = v_moi THEN m.user2_id ELSE m.user1_id END
  INTO v_autre
  FROM public.matches m
  WHERE m.id = p_match AND (m.user1_id = v_moi OR m.user2_id = v_moi);

  IF v_autre IS NULL THEN
    RETURN jsonb_build_object('error', 'conversation_inconnue');
  END IF;

  SELECT count(*) FILTER (WHERE sender_id = v_moi),
         count(*) FILTER (WHERE sender_id = v_autre)
  INTO v_a, v_b
  FROM public.messages WHERE match_id = p_match;

  RETURN jsonb_build_object(
    'debloque', (v_a + v_b) >= v_total AND v_a >= v_chacun AND v_b >= v_chacun,
    'total',  v_a + v_b,
    'seuil',  v_total,
    'moi',    v_a,
    'autre',  v_b,
    'chacun', v_chacun
  );
END;
$fn$;

-- ------------------------------------------------------------
-- 6. La seule porte d'entrée
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.envoyer_message(
  p_match      uuid,
  p_contenu    text DEFAULT '',
  p_media_url  text DEFAULT NULL,
  p_media_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_moi     uuid := auth.uid();
  v_autre   uuid;
  v_etat    jsonb;
  v_motif   text;
  v_recolle text;
  v_id      uuid;
BEGIN
  IF v_moi IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'non_connecte');
  END IF;

  -- SECURITY DEFINER contourne RLS : l'appartenance à la conversation
  -- doit donc être vérifiée ici, à la main. L'oublier ouvrirait
  -- l'écriture dans n'importe quelle conversation.
  SELECT CASE WHEN m.user1_id = v_moi THEN m.user2_id ELSE m.user1_id END
  INTO v_autre
  FROM public.matches m
  WHERE m.id = p_match AND (m.user1_id = v_moi OR m.user2_id = v_moi);

  IF v_autre IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'conversation_inconnue');
  END IF;

  IF public.blocage_entre(v_moi, v_autre) THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'bloque');
  END IF;

  v_etat := public.etat_coordonnees(p_match);

  IF NOT COALESCE((v_etat ->> 'debloque')::boolean, false)
     AND COALESCE(p_contenu, '') <> '' THEN

    -- Anti-découpage : « 90 », puis « 12 », puis « 34 » dans trois
    -- messages séparés. On examine la suite recollée des messages
    -- récents du même auteur, pas seulement celui qu'on écrit.
    SELECT string_agg(content, '' ORDER BY created_at)
    INTO v_recolle
    FROM public.messages
    WHERE match_id = p_match AND sender_id = v_moi
      AND created_at > timezone('utc'::text, now())
          - make_interval(mins => public.setting_int('contact_fenetre_min', 10));

    v_motif := COALESCE(
      public.contient_coordonnees(p_contenu),
      public.contient_coordonnees(COALESCE(v_recolle, '') || p_contenu)
    );

    IF v_motif IS NOT NULL THEN
      -- Journalisé AVANT le retour, dans la même transaction. Une
      -- exception ici annulerait aussi cette écriture : c'est pourquoi
      -- la fonction RENVOIE une erreur au lieu d'en lever une.
      INSERT INTO public.tentatives_coordonnees
        (match_id, auteur_id, extrait, motif, msg_total)
      VALUES (p_match, v_moi, left(p_contenu, 500), v_motif,
              COALESCE((v_etat ->> 'total')::integer, 0));

      RETURN jsonb_build_object(
        'ok', false, 'raison', 'coordonnees_trop_tot',
        'motif', v_motif, 'etat', v_etat);
    END IF;
  END IF;

  -- Les triggers de quota s'appliquent ici, comme avant. S'ils lèvent
  -- une exception, elle remonte au client telle quelle : les messages
  -- d'erreur existants continuent de fonctionner.
  INSERT INTO public.messages (match_id, sender_id, content, media_url, media_type)
  VALUES (p_match, v_moi, COALESCE(p_contenu, ''), p_media_url, p_media_type)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.envoyer_message(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.envoyer_message(uuid, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.etat_coordonnees(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.etat_coordonnees(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 7. La fermeture de la table est dans la migration 87
-- ------------------------------------------------------------
-- Elle est SÉPARÉE pour une raison de séquence : révoquer l'insertion
-- ici couperait la messagerie pour tous ceux qui utilisent encore
-- l'ancienne version de l'application, le temps du déploiement.
--
-- Tant que 87 n'est pas exécutée, la règle s'applique à quiconque passe
-- par l'application, et se contourne par un appel direct à l'API. C'est
-- un état transitoire de quelques minutes, pas un état de repos.

-- ------------------------------------------------------------
-- 8. Le profil est un canal comme un autre
-- ------------------------------------------------------------
-- Un numéro dans la bio est visible de TOUS, sans le moindre message
-- échangé. Bloquer la conversation en laissant la bio ouverte
-- reviendrait à fermer la porte et à laisser la fenêtre.
CREATE OR REPLACE FUNCTION public.enforce_profil_sans_coordonnees()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF public.contient_coordonnees(
       COALESCE(NEW.bio, '') || ' ' ||
       COALESCE(NEW.first_name, '') || ' ' ||
       COALESCE(NEW.last_name, '')) IS NOT NULL THEN
    RAISE EXCEPTION 'PROFIL_COORDONNEES'
      USING HINT = 'Un numéro ou un compte de réseau social ne peut pas figurer sur un profil public.';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_profil_coordonnees ON public.profiles;
CREATE TRIGGER trg_profil_coordonnees
BEFORE INSERT OR UPDATE OF bio, first_name, last_name ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_profil_sans_coordonnees();

-- ------------------------------------------------------------
-- 9. Ce que lit la modération
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_tentatives_coordonnees(p_jours integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'acces_refuse');
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(x ORDER BY x ->> 'derniere' DESC) FROM (
      SELECT jsonb_build_object(
        'auteur_id', t.auteur_id,
        'prenom',    p.first_name,
        -- Le nombre de conversations distinctes compte plus que le
        -- nombre de tentatives : insister dans une seule conversation
        -- est maladroit, recommencer dans cinq est une méthode.
        'tentatives',      count(*),
        'conversations',   count(DISTINCT t.match_id),
        'derniere',        max(t.cree_le),
        'motifs',          jsonb_agg(DISTINCT t.motif),
        'dernier_extrait', (array_agg(t.extrait ORDER BY t.cree_le DESC))[1]
      ) AS x
      FROM public.tentatives_coordonnees t
      JOIN public.profiles p ON p.id = t.auteur_id
      WHERE t.cree_le > timezone('utc'::text, now()) - make_interval(days => p_jours)
      GROUP BY t.auteur_id, p.first_name
    ) s
  ), '[]'::jsonb);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_tentatives_coordonnees(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_tentatives_coordonnees(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Contrôle
-- ------------------------------------------------------------
-- Les trois premières colonnes doivent renvoyer un motif,
-- les quatre suivantes doivent être VIDES (aucun faux positif).
SELECT public.contient_coordonnees('appelle moi au 90 12 34 56')          AS t1_numero,
       public.contient_coordonnees('zero sept quatre vingt douze trente') AS t2_lettres,
       public.contient_coordonnees('ecris moi sur wa.me/22890123456')     AS t3_canal,
       public.contient_coordonnees('rendez-vous le 12/08/2026')           AS f1_date,
       public.contient_coordonnees('Jean 3:16 me porte beaucoup')         AS f2_verset,
       public.contient_coordonnees('j ai 32 ans et 2 enfants')            AS f3_age,
       public.contient_coordonnees('je suis ravi de te lire, sois beni')  AS f4_phrase,
       public.contient_coordonnees('mon numero +228 9012')                AS t4_indicatif,
       public.contient_coordonnees('appelle 00229 97 45')                 AS t5_indicatif,
       public.contient_coordonnees('ca coute +100 000 FCFA le sac')       AS f5_prix,
       public.contient_coordonnees('indicatif du Togo : +228')            AS f6_indicatif_seul;

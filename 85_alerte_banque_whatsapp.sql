-- ============================================================
-- « Il reste 14 jours de messages inédits »
-- ============================================================
-- LE CHOIX RETENU
--
-- Plutôt que de faire écrire les messages par un service payant, on
-- prévient l'administrateur avant que la réserve ne s'épuise, et il en
-- commande une nouvelle série. Les 77 messages actuels tiennent environ
-- un mois ; l'alerte part à cinq jours de la fin.
--
-- POURQUOI COMPTER LES INÉDITS, ET NON LE STOCK TOTAL
--
-- « 77 messages en banque » ne dit rien : ce qui compte est combien
-- n'ont JAMAIS été publiés. Le jour où ce nombre tombe à zéro, la
-- chaîne recommence à se répéter — et c'est ce jour-là qu'on perd des
-- abonnés, pas le jour où le stock total baisse.
--
-- POURQUOI LE PLUS PETIT DES DEUX MOMENTS
--
-- Il faut un message du matin ET un du soir chaque jour. La réserve
-- s'épuise donc au rythme du moment le moins fourni : 31 messages du
-- matin contre 46 du soir, ce sont les matins qui manqueront d'abord.
--
-- ⚠️ Requiert les migrations 73 (push) et 83.

-- ------------------------------------------------------------
-- 1. Le seuil
-- ------------------------------------------------------------
INSERT INTO public.app_settings (key, value, label) VALUES
  ('whatsapp_alerte_jours', '5'::jsonb,
   'Chaîne WhatsApp — alerter quand il reste moins de N jours d''inédits')
ON CONFLICT (key) DO NOTHING;

-- Le `DO NOTHING` ci-dessus protège un réglage que vous auriez ajusté
-- vous-même — mais il laisserait aussi en place le 14 posé par une
-- première exécution de cette migration. Cette ligne corrige ce cas
-- précis, et ne touche à rien d'autre.
UPDATE public.app_settings SET value = '5'::jsonb
WHERE key = 'whatsapp_alerte_jours' AND value = '14'::jsonb;

-- ------------------------------------------------------------
-- 2. Combien de jours restent
-- ------------------------------------------------------------
-- Fonction séparée : l'alerte s'en sert pour décider, le back-office
-- pour afficher. Deux calculs distincts finiraient par se contredire, et
-- l'écran annoncerait « 20 jours » le matin où la notification dit 12.
CREATE OR REPLACE FUNCTION public.jours_inedits_whatsapp()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT LEAST(
    (SELECT count(*) FROM public.whatsapp_modeles m
      WHERE m.actif AND m.moment = 'matin'
        AND NOT EXISTS (SELECT 1 FROM public.whatsapp_planning p WHERE p.modele_id = m.id)),
    (SELECT count(*) FROM public.whatsapp_modeles m
      WHERE m.actif AND m.moment = 'soir'
        AND NOT EXISTS (SELECT 1 FROM public.whatsapp_planning p WHERE p.modele_id = m.id))
  )::integer;
$$;

-- ------------------------------------------------------------
-- 3. L'alerte
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.alerte_banque_whatsapp()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_jours  integer := public.jours_inedits_whatsapp();
  v_seuil  integer := public.setting_int('whatsapp_alerte_jours', 5);
  v_admin  uuid;
  v_id     bigint;
  v_n      integer := 0;
  v_corps  text;
BEGIN
  IF v_jours > v_seuil THEN
    RETURN 0;
  END IF;

  v_corps := CASE
    WHEN v_jours <= 0 THEN
      'La réserve est vide : la chaîne republie d''anciens messages. Demandez-en 77 nouveaux.'
    WHEN v_jours = 1 THEN
      'Il reste 1 jour de messages inédits. Demandez-en 77 nouveaux.'
    ELSE
      'Il reste ' || v_jours || ' jours de messages inédits. Demandez-en 77 nouveaux.'
  END;

  FOR v_admin IN
    SELECT id FROM public.profiles WHERE role IN ('admin', 'moderator')
  LOOP
    -- Une seule alerte par semaine et par personne. Sans ce verrou, on
    -- recevrait la même notification chaque matin pendant deux semaines
    -- — et l'on cesserait de la lire bien avant la panne.
    INSERT INTO public.push_log (user_id, modele, cle_unique)
    VALUES (v_admin, 'whatsapp_stock',
            'whatsapp_stock:' || v_admin::text || ':'
            || to_char(timezone('utc'::text, now()), 'IYYY-IW'))
    ON CONFLICT (cle_unique) DO NOTHING
    RETURNING id INTO v_id;

    CONTINUE WHEN v_id IS NULL;

    PERFORM public.envoyer_push(
      v_admin,
      'Chaîne WhatsApp : réserve bientôt vide',
      v_corps,
      '/admin/whatsapp',
      'whatsapp-stock'
    );

    v_n := v_n + 1;
    v_id := NULL;
  END LOOP;

  RETURN v_n;
END;
$$;

-- ------------------------------------------------------------
-- 4. Le back-office lit le même chiffre
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

    'banque', COALESCE((
      SELECT jsonb_object_agg(moment, n) FROM (
        SELECT moment, count(*) AS n
        FROM public.whatsapp_modeles WHERE actif GROUP BY moment
      ) s
    ), '{}'::jsonb),

    -- Le seul chiffre qui annonce l'essoufflement AVANT qu'il ne se voie
    -- dans les publications.
    'jours_inedits', public.jours_inedits_whatsapp(),
    'seuil_alerte',  public.setting_int('whatsapp_alerte_jours', 5),

    'en_retard', (
      SELECT count(*) FROM public.whatsapp_planning
      WHERE statut = 'prevu' AND publier_le <= timezone('utc'::text, now())
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_whatsapp(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_whatsapp(integer) TO authenticated;
REVOKE ALL ON FUNCTION public.jours_inedits_whatsapp() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.jours_inedits_whatsapp() TO authenticated;

-- ------------------------------------------------------------
-- 5. La tâche
-- ------------------------------------------------------------
SELECT cron.unschedule('agape-whatsapp-stock')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agape-whatsapp-stock');

-- 8 h : après la publication du matin, à une heure où l'on peut agir.
-- Une alerte à 3 h du matin serait lue au réveil, noyée sous le reste.
SELECT cron.schedule(
  'agape-whatsapp-stock',
  '0 8 * * *',
  $$SELECT public.alerte_banque_whatsapp();$$
);

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Contrôle
-- ------------------------------------------------------------
SELECT
  public.jours_inedits_whatsapp() AS jours_inedits,
  (SELECT count(*) FROM public.whatsapp_modeles WHERE actif) AS banque_totale,
  (SELECT count(*) FROM cron.job WHERE jobname = 'agape-whatsapp-stock') AS tache;

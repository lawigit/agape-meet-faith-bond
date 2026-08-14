-- ============================================================
-- Traçabilité des e-mails — du départ à l'ouverture
-- ============================================================
-- CE QUI MANQUAIT
--
-- `email_log` note qu'un message est PARTI. Il ne dit rien de ce qu'il
-- devient : arrivé ou non, ouvert ou non, cliqué, rejeté, dénoncé.
--
-- Le webhook Resend recevait pourtant déjà ces événements — et les
-- jetait tous, sauf le rebond dur et la plainte. On savait donc qu'un
-- e-mail avait été envoyé, jamais s'il avait servi à quelque chose.
--
-- POURQUOI DEUX NIVEAUX
--
-- `email_events` conserve CHAQUE événement, horodaté : c'est la preuve,
-- celle qu'on ressort en cas de litige ou pour comprendre un incident.
--
-- Les colonnes ajoutées à `email_log` sont un RÉSUMÉ de ces événements.
-- Sans elles, afficher un taux d'ouverture exigerait de parcourir tous
-- les événements à chaque chargement de page.
--
-- Ce résumé est tenu à jour par un trigger, jamais à la main : deux
-- écritures séparées finissent toujours par diverger.
--
-- ⚠️ AJOUT PUR : une table, des colonnes, un trigger, deux fonctions.
--    Aucun envoi existant n'est modifié.

-- ------------------------------------------------------------
-- 1. Le journal fin
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_events (
  id         bigserial PRIMARY KEY,
  -- Identifiant Resend du message. C'est la seule clé qui relie un
  -- événement à l'envoi correspondant.
  resend_id  text,
  email      text NOT NULL,
  type       text NOT NULL,
  -- Détail brut utile : motif de rebond, lien cliqué, agent. On ne
  -- conserve PAS la charge complète : elle contient le corps du message,
  -- donc potentiellement des données personnelles sans usage ici.
  detail     jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS email_events_resend_idx ON public.email_events (resend_id);
CREATE INDEX IF NOT EXISTS email_events_email_idx  ON public.email_events (email, created_at DESC);
CREATE INDEX IF NOT EXISTS email_events_type_idx   ON public.email_events (type, created_at DESC);

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

-- Aucune politique : écriture par la fonction Edge (clé de service),
-- lecture par les fonctions d'administration ci-dessous. Un e-mail
-- révèle qui écrit à qui et quand — cela ne se lit pas depuis un
-- navigateur, fût-il celui d'un administrateur.

-- ------------------------------------------------------------
-- 2. Le résumé, sur chaque envoi
-- ------------------------------------------------------------
ALTER TABLE public.email_log
  ADD COLUMN IF NOT EXISTS delivered_at  timestamp with time zone,
  ADD COLUMN IF NOT EXISTS opened_at     timestamp with time zone,
  ADD COLUMN IF NOT EXISTS clicked_at    timestamp with time zone,
  ADD COLUMN IF NOT EXISTS bounced_at    timestamp with time zone,
  ADD COLUMN IF NOT EXISTS complained_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_status   text,
  ADD COLUMN IF NOT EXISTS bounce_reason text;

CREATE INDEX IF NOT EXISTS email_log_resend_idx ON public.email_log (resend_id);
CREATE INDEX IF NOT EXISTS email_log_template_idx
  ON public.email_log (template, sent_at DESC);

-- ------------------------------------------------------------
-- 3. Le trigger qui tient le résumé
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resumer_email_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.resend_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- `LEAST(existant, nouveau)` sur les dates : Resend peut livrer ses
  -- événements dans le désordre, et une PREMIÈRE ouverture ne doit pas
  -- être réécrite par une seconde arrivée entre-temps.
  UPDATE public.email_log l
  SET
    delivered_at  = CASE WHEN NEW.type = 'email.delivered'
                    THEN LEAST(COALESCE(l.delivered_at, NEW.created_at), NEW.created_at)
                    ELSE l.delivered_at END,
    opened_at     = CASE WHEN NEW.type = 'email.opened'
                    THEN LEAST(COALESCE(l.opened_at, NEW.created_at), NEW.created_at)
                    ELSE l.opened_at END,
    clicked_at    = CASE WHEN NEW.type = 'email.clicked'
                    THEN LEAST(COALESCE(l.clicked_at, NEW.created_at), NEW.created_at)
                    ELSE l.clicked_at END,
    bounced_at    = CASE WHEN NEW.type = 'email.bounced'
                    THEN LEAST(COALESCE(l.bounced_at, NEW.created_at), NEW.created_at)
                    ELSE l.bounced_at END,
    complained_at = CASE WHEN NEW.type = 'email.complained'
                    THEN LEAST(COALESCE(l.complained_at, NEW.created_at), NEW.created_at)
                    ELSE l.complained_at END,
    bounce_reason = CASE WHEN NEW.type = 'email.bounced'
                    THEN COALESCE(NEW.detail ->> 'raison', l.bounce_reason)
                    ELSE l.bounce_reason END,

    -- `last_status` suit une HIÉRARCHIE, pas la chronologie. Une plainte
    -- arrivée après une ouverture reste l'information la plus grave, et
    -- c'est elle qu'on doit lire dans la liste.
    last_status = CASE
      WHEN l.last_status = 'complained' THEN 'complained'
      WHEN NEW.type = 'email.complained' THEN 'complained'
      WHEN l.last_status = 'bounced' AND NEW.type <> 'email.complained' THEN 'bounced'
      WHEN NEW.type = 'email.bounced' THEN 'bounced'
      WHEN NEW.type = 'email.clicked' THEN 'clicked'
      WHEN l.last_status = 'clicked' THEN 'clicked'
      WHEN NEW.type = 'email.opened' THEN 'opened'
      WHEN l.last_status = 'opened' THEN 'opened'
      WHEN NEW.type = 'email.delivered' THEN 'delivered'
      ELSE COALESCE(l.last_status, 'sent')
    END
  WHERE l.resend_id = NEW.resend_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resumer_email_event_trg ON public.email_events;
CREATE TRIGGER resumer_email_event_trg
AFTER INSERT ON public.email_events
FOR EACH ROW EXECUTE FUNCTION public.resumer_email_event();

-- ------------------------------------------------------------
-- 4. Tableau de bord
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_emails(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deb   timestamp with time zone;
  v_total integer;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  v_deb := now() - make_interval(days => GREATEST(1, p_days));

  SELECT count(*) INTO v_total FROM public.email_log WHERE sent_at >= v_deb;

  RETURN jsonb_build_object(
    'periode_jours', p_days,
    'envoyes', v_total,

    -- Les taux se calculent sur les messages RÉELLEMENT DÉLIVRÉS, pas
    -- sur les envois. Rapporter les ouvertures aux envois ferait baisser
    -- le taux à cause d'adresses mortes, ce qui masquerait la vraie
    -- performance du message.
    'delivres',  (SELECT count(*)::integer FROM public.email_log WHERE sent_at >= v_deb AND delivered_at IS NOT NULL),
    'ouverts',   (SELECT count(*)::integer FROM public.email_log WHERE sent_at >= v_deb AND opened_at IS NOT NULL),
    'cliques',   (SELECT count(*)::integer FROM public.email_log WHERE sent_at >= v_deb AND clicked_at IS NOT NULL),
    'rebonds',   (SELECT count(*)::integer FROM public.email_log WHERE sent_at >= v_deb AND bounced_at IS NOT NULL),
    'plaintes',  (SELECT count(*)::integer FROM public.email_log WHERE sent_at >= v_deb AND complained_at IS NOT NULL),
    'supprimes', (SELECT count(*)::integer FROM public.email_suppression),

    -- Par modèle : c'est ici qu'on voit quel message fonctionne.
    'modeles', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'envoyes')::int DESC)
      FROM (
        SELECT jsonb_build_object(
          'template',  l.template,
          'categorie', min(l.category),
          'envoyes',   count(*)::integer,
          'delivres',  count(*) FILTER (WHERE l.delivered_at IS NOT NULL)::integer,
          'ouverts',   count(*) FILTER (WHERE l.opened_at IS NOT NULL)::integer,
          'cliques',   count(*) FILTER (WHERE l.clicked_at IS NOT NULL)::integer,
          'rebonds',   count(*) FILTER (WHERE l.bounced_at IS NOT NULL)::integer,
          'plaintes',  count(*) FILTER (WHERE l.complained_at IS NOT NULL)::integer,
          'dernier',   max(l.sent_at)
        ) AS x
        FROM public.email_log l
        WHERE l.sent_at >= v_deb
        GROUP BY l.template
      ) t
    ), '[]'::jsonb),

    'categories', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'envoyes')::int DESC)
      FROM (
        SELECT jsonb_build_object(
          'categorie', l.category,
          'envoyes',   count(*)::integer,
          'ouverts',   count(*) FILTER (WHERE l.opened_at IS NOT NULL)::integer,
          'plaintes',  count(*) FILTER (WHERE l.complained_at IS NOT NULL)::integer
        ) AS x
        FROM public.email_log l
        WHERE l.sent_at >= v_deb
        GROUP BY l.category
      ) t
    ), '[]'::jsonb),

    'courbe', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'jour', j, 'envoyes', n, 'ouverts', o, 'rebonds', r
      ) ORDER BY j)
      FROM (
        SELECT sent_at::date AS j,
               count(*)::integer AS n,
               count(*) FILTER (WHERE opened_at IS NOT NULL)::integer AS o,
               count(*) FILTER (WHERE bounced_at IS NOT NULL)::integer AS r
        FROM public.email_log
        WHERE sent_at >= v_deb
        GROUP BY sent_at::date
      ) s
    ), '[]'::jsonb),

    -- Les incidents en premier : un rebond ou une plainte demande une
    -- action, une ouverture non.
    'incidents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'email', l.email, 'template', l.template,
        'statut', l.last_status, 'motif', l.bounce_reason,
        'date', COALESCE(l.complained_at, l.bounced_at)
      ) ORDER BY COALESCE(l.complained_at, l.bounced_at) DESC)
      FROM public.email_log l
      WHERE l.sent_at >= v_deb
        AND (l.bounced_at IS NOT NULL OR l.complained_at IS NOT NULL)
      LIMIT 50
    ), '[]'::jsonb)
  );
END;
$$;

-- ------------------------------------------------------------
-- 5. Le détail, envoi par envoi
-- ------------------------------------------------------------
-- Paginé et filtrable : la liste complète atteindra vite des dizaines de
-- milliers de lignes, et personne ne les lit d'un bloc.
CREATE OR REPLACE FUNCTION public.admin_emails_liste(
  p_days     integer DEFAULT 30,
  p_statut   text    DEFAULT NULL,   -- sent, delivered, opened, clicked, bounced, complained
  p_template text    DEFAULT NULL,
  p_recherche text   DEFAULT NULL,   -- fragment d'adresse
  p_limit    integer DEFAULT 50,
  p_offset   integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deb   timestamp with time zone;
  v_total integer;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  v_deb := now() - make_interval(days => GREATEST(1, p_days));

  SELECT count(*) INTO v_total
  FROM public.email_log l
  WHERE l.sent_at >= v_deb
    AND (p_statut IS NULL OR COALESCE(l.last_status, 'sent') = p_statut)
    AND (p_template IS NULL OR l.template = p_template)
    AND (p_recherche IS NULL OR l.email ILIKE '%' || p_recherche || '%');

  RETURN jsonb_build_object(
    'total', v_total,
    'lignes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', l.id,
        'email', l.email,
        'prenom', p.first_name,
        'categorie', l.category,
        'template', l.template,
        'statut', COALESCE(l.last_status, 'sent'),
        'envoye_le', l.sent_at,
        'delivre_le', l.delivered_at,
        'ouvert_le', l.opened_at,
        'clique_le', l.clicked_at,
        'rebond_le', l.bounced_at,
        'plainte_le', l.complained_at,
        'motif', l.bounce_reason,
        'resend_id', l.resend_id
      ) ORDER BY l.sent_at DESC)
      FROM (
        SELECT * FROM public.email_log l2
        WHERE l2.sent_at >= v_deb
          AND (p_statut IS NULL OR COALESCE(l2.last_status, 'sent') = p_statut)
          AND (p_template IS NULL OR l2.template = p_template)
          AND (p_recherche IS NULL OR l2.email ILIKE '%' || p_recherche || '%')
        ORDER BY l2.sent_at DESC
        LIMIT GREATEST(1, LEAST(p_limit, 200)) OFFSET GREATEST(0, p_offset)
      ) l
      LEFT JOIN public.profiles p ON p.id = l.user_id
    ), '[]'::jsonb)
  );
END;
$$;

-- ------------------------------------------------------------
-- 6. L'historique complet d'un message
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_email_evenements(p_resend_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'type', e.type, 'date', e.created_at, 'detail', e.detail
    ) ORDER BY e.created_at)
    FROM public.email_events e
    WHERE e.resend_id = p_resend_id
  ), '[]'::jsonb);
END;
$$;

-- ------------------------------------------------------------
-- 7. Droits
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_emails(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_emails_liste(integer, text, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_email_evenements(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_emails(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_emails_liste(integer, text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_email_evenements(text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Contrôle
-- ------------------------------------------------------------
SELECT
  (SELECT count(*) FROM public.email_log)    AS envois_journalises,
  (SELECT count(*) FROM public.email_events) AS evenements,
  (SELECT count(*) FROM public.email_log WHERE resend_id IS NOT NULL) AS rattachables;

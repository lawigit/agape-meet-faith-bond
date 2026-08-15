-- ============================================================
-- Pastille des demandes de contact
-- ============================================================
-- CE QUI MANQUAIT
--
-- `my_badges()` renvoie trois compteurs : messages, « demandes » et
-- communauté. Mais son champ `demandes` compte les LIKES reçus — il date
-- d'avant l'existence des demandes de contact.
--
-- Ces likes s'affichent désormais sur l'accueil, dans « M'ont aimé », et
-- la pastille les suit correctement sur l'icône Accueil.
--
-- Les demandes de contact, elles, n'avaient AUCUN compteur. Une
-- invitation arrivait dans /demandes sans que rien ne le signale : il
-- fallait ouvrir la page au hasard pour la découvrir. Sur une
-- sollicitation nominative qui attend une réponse, c'est le pire endroit
-- où être silencieux.
--
-- Un QUATRIÈME champ est donc ajouté plutôt que de détourner l'existant.
-- Réutiliser `demandes` aurait mélangé deux notions distinctes sur deux
-- icônes différentes, et l'une des deux aurait forcément menti.
--
-- ⚠️ AJOUT PUR : le champ s'ajoute, les trois autres ne bougent pas.
--    Requiert les migrations 57 et 70.

CREATE OR REPLACE FUNCTION public.my_badges()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user      uuid := auth.uid();
  v_messages  integer := 0;
  v_demandes  integer := 0;
  v_contacts  integer := 0;
  v_posts     integer := 0;
  v_a_archive boolean;
  v_last_read timestamp with time zone;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object(
      'messages', 0, 'demandes', 0, 'contacts', 0, 'communaute', 0);
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.archived_chats WHERE user_id = v_user)
  INTO v_a_archive;

  -- ── Messages non lus ──
  SELECT count(*) INTO v_messages
  FROM public.messages m
  JOIN public.matches ma ON ma.id = m.match_id
  WHERE m.sender_id <> v_user
    AND m.read_at IS NULL
    AND (ma.user1_id = v_user OR ma.user2_id = v_user)
    AND (
      NOT v_a_archive
      OR NOT EXISTS (
        SELECT 1 FROM public.archived_chats a
        WHERE a.user_id = v_user AND a.match_id = m.match_id
      )
    );

  -- ── Likes et Super Likes reçus, sans réponse ──
  -- Affichés dans « M'ont aimé », sur l'accueil.
  SELECT count(*) INTO v_demandes
  FROM public.swipes s
  WHERE s.target_id = v_user
    AND s.action IN ('like', 'superlike')
    AND NOT EXISTS (
      SELECT 1 FROM public.swipes r
      WHERE r.swiper_id = v_user AND r.target_id = s.swiper_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.blocks b
      WHERE (b.blocker_id = v_user AND b.blocked_id = s.swiper_id)
         OR (b.blocker_id = s.swiper_id AND b.blocked_id = v_user))
    AND NOT EXISTS (
      SELECT 1 FROM public.dismissed_likes d
      WHERE d.user_id = v_user AND d.dismissed_user_id = s.swiper_id);

  -- ── Demandes de contact en attente ──
  -- Uniquement celles REÇUES et non tranchées : une demande que j'ai
  -- envoyée n'appelle aucune action de ma part, et la compter ferait
  -- une pastille qui ne retombe jamais.
  --
  -- `to_regclass` : la table vient de la migration 70. Sans ce test, la
  -- fonction échouerait entièrement là où 70 n'est pas passée — et les
  -- trois autres pastilles disparaîtraient avec elle.
  IF to_regclass('public.contact_requests') IS NOT NULL THEN
    EXECUTE $q$
      SELECT count(*) FROM public.contact_requests c
      WHERE c.receiver_id = $1
        AND c.status = 'pending'
        AND NOT public.blocage_entre($1, c.sender_id)
    $q$ INTO v_contacts USING v_user;
  END IF;

  -- ── Publications non lues ──
  SELECT last_read INTO v_last_read
  FROM public.community_reads WHERE user_id = v_user;

  SELECT count(*) INTO v_posts
  FROM public.community_posts p
  WHERE p.user_id <> v_user
    AND p.created_at > COALESCE(v_last_read, now() - interval '7 days')
    AND COALESCE(p.status, 'approved') = 'approved';

  RETURN jsonb_build_object(
    'messages',   v_messages,
    'demandes',   v_demandes,
    'contacts',   v_contacts,
    'communaute', v_posts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.my_badges() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_badges() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Contrôle
-- ------------------------------------------------------------
SELECT public.my_badges();

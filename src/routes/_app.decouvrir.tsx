import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion, useMotionValue, useTransform, AnimatePresence } from "motion/react";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { envoyerDemande, RAISONS } from "@/lib/contacts";
import { LimiteDemandes } from "@/components/app/LimiteDemandes";
import { GuideGestes } from "@/components/app/GuideGestes";
import { PanneauPremium } from "@/components/app/PanneauPremium";
import { getCurrentUser } from "@/lib/auth";
import {
  X,
  Heart,
  Star,
  Undo2,
  Zap,
  CheckCircle2,
  Crown,
  MapPin,
  Church,
  BookOpen,
  Info,
  SlidersHorizontal,
  Sparkles,
  MessageCircle,
  UserPlus,
  Lock,
  Heart as HeartIcon
} from "lucide-react";
import { type Profile } from "@/lib/mock-data";
import { toast } from "sonner";
import { useSubscription } from "@/lib/subscription";
import { compatibilityScore, rankProfiles } from "@/lib/matching";
import { DEFAULT_FILTERS, fetchDeck, countActiveFilters, type Filters } from "@/lib/filtres";
import { FilterSheet } from "@/components/app/FilterSheet";
import { Drapeau } from "@/components/app/Drapeau";
import { BOOST_DURATION_MIN, boostErrorMessage, fetchBoostStatus, startBoost, type BoostStatus } from "@/lib/boost";
import { BoostPicker } from "@/components/app/BoostPicker";
import { daysUntilSuperLike, fetchQuotas, quotaErrorMessage, type Quotas } from "@/lib/quotas";



import { displayName } from "@/lib/utils";
import { ProfileExtrasBlocks } from "@/components/app/ProfileExtras";

export const Route = createFileRoute("/_app/decouvrir")({
  head: () => ({
    meta: [
      { title: "Découvrir — AgapeMeet" },
      { name: "description", content: "Swipez et découvrez des profils compatibles." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DiscoverPage,
});

function DiscoverPage() {
  const [deck, setDeck] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<{ id: string; action: string }[]>([]);
  const [detail, setDetail] = useState<Profile | null>(null);
  
  // Filtres
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [locationShared, setLocationShared] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);

  const navigate = useNavigate();
  const { superLikesLeft, consumeSuperLike, features } = useSubscription();
  const [quotas, setQuotas] = useState<Quotas | null>(null);
  const refreshQuotas = () => fetchQuotas().then(setQuotas);
  useEffect(() => { refreshQuotas(); }, []);
  const [boostStatus, setBoostStatus] = useState<BoostStatus | null>(null);
  const [boostPicker, setBoostPicker] = useState<"plan" | "quota" | null>(null);
  useEffect(() => { fetchBoostStatus().then(setBoostStatus); }, []);
  const boostsLeft = boostStatus?.left ?? 0;
  const [showMessageModal, setShowMessageModal] = useState<Profile | null>(null);
  // Invitations envoyées pendant la session : le bouton doit refléter
  // ce qui vient d'être fait, sans relire la base à chaque carte.
  const [invites, setInvites] = useState<Set<string>>(new Set());
  const [limite, setLimite] = useState<{ max: number; prochain: string | null } | null>(null);
  const [messageText, setMessageText] = useState("");

  const upsell = (message: string) => {
    toast.error(message, {
      action: { label: "Voir les formules", onClick: () => navigate({ to: "/abonnement" }) },
    });
  };

  const current = deck[index];
  const next = deck[index + 1];

  useEffect(() => {
    async function loadProfiles() {
      try {
        const user = await getCurrentUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const { data: currentUserData } = await supabase
          .from('profiles')
          .select('seeking_gender, visibility, birth_date, city, country, denomination, ' +
                  'practice_level, church_attendance, marriage_intent, wants_children, share_location')
          .eq('id', user.id)
          .single();

        if (currentUserData) {
          setUserProfile(currentUserData);
          setLocationShared(Boolean(currentUserData.share_location));
        }

        // Tout est filtré EN BASE : visibilité, blocages, profils déjà vus,
        // sexe recherché, pays, âge et critères avancés. L'ancienne version
        // chargeait 100 profils puis filtrait dans le navigateur — filtrer
        // sur un pays ne cherchait donc pas dans la base, mais seulement
        // parmi les 100 déjà tirés.
        const { rows, error } = await fetchDeck(filters, 100);
        if (error) throw error;

        {
          const formatted: Profile[] = rows.map((p: any) => ({
            id: p.id,
            firstName: p.first_name || "Membre",
            lastName: p.last_name || "",
            maritalStatus: p.marital_status || "",
            marriageVisionText: p.marriage_vision || "",
            lookingFor: p.looking_for || "",
            educationLevel: p.education || "",
            heightCm: p.height_cm ?? null,
            qualities: p.qualities || [],
            flaws: p.flaws || [],
            dealbreakers: p.dealbreakers || [],
            age: p.birth_date ? new Date().getFullYear() - new Date(p.birth_date).getFullYear() : 25,
            city: p.city || "Ville inconnue",
            country: p.country || "",
            denomination: p.denomination || "Non précisé",
            // Score réel, calculé sur la confession, la pratique, la vision
            // du mariage, les enfants, la proximité et l'écart d'âge
            compatibility: compatibilityScore(currentUserData ?? {}, p),
            boostedUntil: p.boosted_until ?? null,
            verified: p.is_verified || false,
            plan: p.public_plan ?? null,
            planUntil: p.premium_until ?? null,
            isFounder: Boolean(p.is_founder),
            premium: false,
            lastActive: "Récemment",
            photo: p.photos && p.photos.length > 0 ? p.photos[0] : '',
            photos: p.photos || [],
            bio: p.bio || "Pas de bio.",
            profession: "Profession non précisée",
            education: "Études",
            height: "1m70",
            languages: ["Français"],
            interests: p.interests || [],
            passions: [],
            marriageVision: p.marriage_intent || "",
            favoriteVerse: "",
            church: p.church_attendance || "",
            faithImportance: p.practice_level || "",
            // Renvoyé par la base quand les deux personnes partagent leur
            // position ; NULL sinon.
            distanceKm: p.distance_km ?? null,
            online: false
          }));

          // Boostés d'abord, puis par compatibilité décroissante
          setDeck(rankProfiles(formatted));
          setIndex(0);
        }
      } catch (err) {
        console.error("Erreur chargement profils:", err);
        toast.error("Impossible de charger les profils");
      } finally {
        setLoading(false);
      }
    }
    loadProfiles();
    // Un changement de filtre relance la requête : c'est le serveur qui
    // sélectionne, pas un tri local sur un lot déjà chargé.
  }, [filters]);

  // Un boost peut expirer pendant que l'utilisateur swipe : ce tick fait
  // retomber l'étiquette et le classement à la seconde près, sans refetch.
  const [boostTick, setBoostTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setBoostTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Le deck arrive déjà filtré par la base. Il ne reste qu'à reclasser
  // localement à l'expiration d'un Boost, sans repasser par le réseau.
  const filteredDeck = useMemo(
    () => rankProfiles(deck, boostTick),
    [deck, boostTick],
  );

  const currentFiltered = filteredDeck[index];
  const nextFiltered = filteredDeck[index + 1];
  const activeFilters = countActiveFilters(filters);

  useEffect(() => {
    async function logVisit() {
      if (!currentFiltered) return;
      const user = await getCurrentUser();
      if (user && user.id !== currentFiltered.id) {
        await supabase.from('profile_visits').upsert({
          visitor_id: user.id,
          visited_id: currentFiltered.id,
          created_at: new Date().toISOString()
        }, { onConflict: 'visitor_id,visited_id' });
      }
    }
    const timer = setTimeout(logVisit, 1500); // Only log if they look at it for 1.5s
    return () => clearTimeout(timer);
  }, [currentFiltered?.id]);

  const swipe = async (action: "left" | "right" | "super") => {
    if (!currentFiltered) return;

    // Vérifications d'usage avant de consommer la carte : rien de pire que
    // de voir un profil disparaître pour un refus arrivé après coup.
    if (action === "super") {
      const wait = daysUntilSuperLike(quotas?.superLikeAvailableAt ?? null);
      if (wait > 0) {
        upsell(`Prochain Super Like dans ${wait} jour${wait > 1 ? "s" : ""}`);
        return;
      }
      if (!consumeSuperLike()) {
        upsell("Plus de Super Likes disponibles");
        return;
      }
    }

    if (action === "right" && quotas && quotas.likesLeft === 0) {
      upsell("Vous avez atteint vos 25 likes du jour");
      return;
    }

    const target = currentFiltered;
    setHistory((h) => [...h, { id: target.id, action }]);
    if (action === "right") toast.success(`Vous aimez ${target.firstName}`);
    if (action === "super") toast.success(`Super Like envoyé à ${target.firstName} ⭐`);
    setIndex((i) => i + 1);

    try {
      const user = await getCurrentUser();
      if (user) {
        const dbAction = action === "left" ? "pass" : action === "right" ? "like" : "superlike";
        const { error: swipeError } = await supabase.from('swipes').insert({
          swiper_id: user.id,
          target_id: target.id,
          action: dbAction
        });

        // La base a le dernier mot : elle peut refuser même si l'interface
        // pensait le quota disponible (deuxième onglet ouvert, par exemple).
        if (swipeError) {
          const message = quotaErrorMessage(swipeError);
          if (message) {
            upsell(message);
            setIndex(i => Math.max(0, i - 1));
            setHistory(h => h.slice(0, -1));
            refreshQuotas();
            return;
          }
          throw swipeError;
        }

        refreshQuotas();

        if (dbAction === 'like' || dbAction === 'superlike') {
          // Le like est ECRIT en base a ce stade : l evenement decrit un
          // fait, pas une intention.
          import("@/lib/meta").then(m => m.suivreMeta("Like"));

          const { data: matchCheck } = await supabase
            .from('swipes')
            .select('id')
            .eq('swiper_id', currentFiltered.id)
            .eq('target_id', user.id)
            .in('action', ['like', 'superlike'])
            .maybeSingle();

          if (matchCheck) {
            toast.success(`C'est un match avec ${currentFiltered.firstName} ! 🎉`, { duration: 5000 });
            // Reciprocite confirmee par la base : le match existe.
            import("@/lib/meta").then(m => m.suivreMeta("Match"));
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  /* Un refus n'est plus une notification rouge qui s'efface.
     « Réservé aux membres Premium » énonce une interdiction sans dire ce
     qu'on y gagnerait, et ne laisse rien à faire d'autre que renoncer.
     Le panneau, lui, explique l'apport et propose une suite. */
  const [refus, setRefus] = useState<null | {
    titre: string;
    texte: string;
    avantages?: string[];
    alternative?: { label: string; invite: string; onClick: () => void };
  }>(null);

  const rewind = () => {
    if (!features.rewind) {
      setRefus({
        titre: "Revenez sur vos pas",
        texte: "Un profil passé trop vite ? Premium vous laisse revenir en arrière autant de fois que vous le voulez.",
        avantages: [
          "Rattrapez un profil écarté par erreur",
          "Découvrez qui a aimé votre profil",
          "Likes illimités, au lieu de 25 par jour",
        ],
      });
      return;
    }
    doRewind();
  };

  const doRewind = () => {
    if (history.length === 0) {
      toast.info("Rien à annuler");
      return;
    }
    setHistory((h) => h.slice(0, -1));
    setIndex((i) => Math.max(0, i - 1));
    toast.info("Action annulée");
  };

  // Le quota et la mise en avant sont décidés en base : rien n'est
  // contournable depuis le navigateur.
  const boost = async () => {
    const res = await startBoost();

    if (res.ok) {
      toast.success(`Boost activé pour ${BOOST_DURATION_MIN} minutes 🚀`, {
        description: "Votre profil passe en tête des découvertes.",
      });
      setBoostStatus(await fetchBoostStatus());
      return;
    }

    // Un refus faute de formule ou de quota OUVRE LE PANNEAU d'achat,
    // il ne déclenche pas une notification.
    //
    // Le composant était déjà monté plus bas dans cette page, mais rien
    // ne l'ouvrait : le refus partait en bandeau rouge en haut de
    // l'écran, par-dessus l'en-tête, et disparaissait tout seul. Le même
    // refus depuis le bouton de l'en-tête ouvrait pourtant le panneau —
    // deux réponses différentes au même geste, dans la même application.
    //
    // Un panneau centré vaut mieux ici : on vient de demander quelque
    // chose, la réponse doit rester à l'écran le temps de la lire et
    // proposer la suite, plutôt que de s'évanouir en trois secondes.
    if (res.reason === "plan" || res.reason === "quota") {
      setBoostPicker(res.reason);
    } else {
      toast.info(boostErrorMessage(res.reason, res.expiresAt));
    }
  };

  // ── Message pré-match ──
  const sendPreMatchMessage = async () => {
    if (!showMessageModal || !messageText.trim()) return;
    try {
      const user = await getCurrentUser();
      if (!user) return;
      // Enregistrer le like + message dans la table swipes
      await supabase.from('swipes').insert({
        swiper_id: user.id,
        target_id: showMessageModal.id,
        action: 'like',
        message: messageText.trim()
      }).select();
      toast.success(`Message envoyé à ${showMessageModal.firstName} ! 💌`);
      setHistory(h => [...h, { id: showMessageModal.id, action: 'right' }]);
      setIndex(i => i + 1);
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'envoi");
    } finally {
      setShowMessageModal(null);
      setMessageText("");
    }
  };

  /**
   * « Ajouter » — envoi d'une invitation.
   *
   * CE BOUTON INSÉRAIT UN LIKE. Il écrivait dans `swipes` avec
   * `action: 'like'`, donc la personne se retrouvait dans « M'ont aimé »
   * et jamais dans ses demandes reçues — tout en lui annonçant qu'elle
   * avait été « ajoutée à vos contacts ». Trois erreurs d'un coup : la
   * mauvaise table, la mauvaise rubrique, et un message faux.
   *
   * Un LIKE est un signal silencieux issu du balayage. « Ajouter » est
   * une invitation nominative qui appelle une réponse. Les deux gestes
   * coexistent sur cette carte sans se confondre.
   *
   * Le paquet n'avance PAS. Avancer sans écrire de swipe ferait
   * réapparaître le profil à la session suivante — le paquet exclut les
   * profils déjà swipés, pas ceux qu'on a invités.
   */
  const addContact = async () => {
    if (!currentFiltered) return;

    const res = await envoyerDemande(currentFiltered.id);

    if (!res.ok) {
      // Le quota ouvre le panneau d'abonnement, jamais une notification :
      // on refuse quelque chose, la réponse doit rester lisible.
      if (res.raison === "quota_atteint") {
        setLimite({ max: res.max ?? 5, prochain: res.prochain ?? null });
        return;
      }
      toast.error(RAISONS[res.raison] ?? "Envoi impossible");
      if (res.raison === "deja_envoyee") {
        setInvites(s => new Set(s).add(currentFiltered.id));
      }
      return;
    }

    setInvites(s => new Set(s).add(currentFiltered.id));
    toast.success(
      res.croisee
        ? `Vous étiez déjà sollicité : vous voilà en contact avec ${currentFiltered.firstName}`
        : `Invitation envoyée à ${currentFiltered.firstName}`,
      { description: res.croisee ? undefined : "Elle apparaît dans vos demandes envoyées." },
    );
  };

  return (
    <div className="px-4 pt-4 relative">
      <div className="flex items-center justify-between mb-4">
        <div className="text-left">
          <h1 className="font-serif text-2xl font-semibold">Découvrir</h1>
          <p className="text-xs text-muted-foreground">Trouvez votre âme sœur</p>
        </div>
        {/* La pastille indique combien de critères sont actifs : sans elle,
            un deck vide fait croire à une panne alors qu'un filtre oublié
            en est la cause. */}
        <button
          onClick={() => setShowFilters(true)}
          className="relative w-10 h-10 rounded-full bg-secondary text-foreground flex items-center justify-center hover:bg-secondary/80 transition-colors shadow-sm"
          aria-label="Filtres"
        >
          <SlidersHorizontal className="w-5 h-5" />
          {activeFilters > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {activeFilters}
            </span>
          )}
        </button>
      </div>
      
      <div className="text-center mb-4">
        <div className="inline-flex items-center gap-3 px-3 py-1 rounded-full bg-secondary/60 border border-border/60 text-[11px] font-medium">
          <span className="inline-flex items-center gap-1">
            <Star className="w-3 h-3 text-primary" fill="currentColor" />
            {superLikesLeft === -1 ? "∞" : superLikesLeft} Super Likes
          </span>
          <span className="w-px h-3 bg-border" />
          <span className="inline-flex items-center gap-1">
            <Zap className="w-3 h-3 text-gold" />
            {boostsLeft === -1 ? "∞" : boostsLeft} Boosts
          </span>
        </div>
      </div>

      <div className="relative h-[560px] max-h-[70vh] w-full mx-auto max-w-md">
        {loading ? (
          <div className="absolute inset-0 rounded-3xl bg-secondary animate-pulse flex items-center justify-center border border-border">
            <span className="text-muted-foreground font-medium">Recherche de profils...</span>
          </div>
        ) : filteredDeck.length === 0 || !currentFiltered ? (
          <div className="absolute inset-0 rounded-3xl bg-card border-2 border-dashed border-border flex flex-col items-center justify-center p-8 text-center shadow-soft">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-serif text-xl font-semibold mb-2">Plus aucun profil</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Vous avez vu tous les profils correspondant à vos critères pour le moment.
            </p>
            <button
              onClick={() => setIndex(0)}
              className="px-6 py-2 rounded-full bg-primary text-primary-foreground font-semibold text-sm shadow-elegant"
            >
              Revoir depuis le début
            </button>
          </div>
        ) : (
          <AnimatePresence>
            {nextFiltered && (
              <SwipeCard
                key={nextFiltered.id}
                profile={nextFiltered}
                active={false}
                onSwipe={() => {}}
                onDetail={() => setDetail(nextFiltered)}
              />
            )}
            {currentFiltered && (
              <SwipeCard
                key={currentFiltered.id}
                profile={currentFiltered}
                active={true}
                onSwipe={swipe}
                onDetail={() => setDetail(currentFiltered)}
              />
            )}
          </AnimatePresence>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 mt-8 mb-4 max-w-[400px] mx-auto">
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={rewind}
            className={`relative w-12 h-12 rounded-full border-2 flex items-center justify-center transition-transform active:scale-95 shadow-sm ${
              features.rewind
                ? "border-gold bg-background text-gold hover:bg-gold/10"
                : "border-border bg-secondary/60 text-muted-foreground"
            }`}
          >
            <Undo2 className="w-5 h-5" />
            {!features.rewind && (
              <Lock className="absolute -top-1 -right-1 w-3 h-3 text-gold bg-background rounded-full p-[1px]" />
            )}
          </button>
          <span className="text-[10px] text-muted-foreground font-medium">Retour</span>
        </div>

        <div className="flex flex-col items-center gap-1">
          <button
            onClick={() => swipe("left")}
            className="w-14 h-14 rounded-full border-2 border-muted-foreground/50 bg-background flex items-center justify-center text-muted-foreground hover:bg-muted/50 transition-transform active:scale-95 shadow-sm"
          >
            <X className="w-6 h-6" />
          </button>
          <span className="text-[10px] text-muted-foreground font-medium">Passer</span>
        </div>

        {/* « Super like » et « J'adore » retirés de la barre.

            Le LIKE reste accessible : faire glisser la carte vers la
            droite appelle `swipe("right")`, exactement comme le bouton.

            ⚠️ LE SUPER LIKE, LUI, N'A PLUS AUCUN ACCÈS. La carte ne
            glisse qu'horizontalement (`drag="x"`) : il n'existe pas de
            geste vertical pour le déclencher. C'est pourtant un droit
            payant — 5 par jour en Premium, illimités en VIP — et les
            compteurs continuent de l'afficher au-dessus des cartes. */}

        <div className="flex flex-col items-center gap-1">
          <button
            onClick={() => {
              if (!features.preMatchMessage) {
                /* L'alternative gratuite compte autant que l'offre :
                   celui qui ne paiera pas aujourd'hui repart avec un
                   geste accompli plutôt qu'avec un refus. */
                setRefus({
                  titre: "Faites le premier pas",
                  texte: "Écrire avant le match permet de vous présenter en quelques mots — bien plus fort qu'un simple like.",
                  avantages: [
                    "Écrivez sans attendre la réciprocité",
                    "Découvrez qui a aimé votre profil",
                    "Messages illimités avec vos matchs",
                  ],
                  alternative: currentFiltered ? {
                    invite: "En attendant, vous pouvez lui envoyer une invitation à entrer en contact.",
                    label: `Inviter ${currentFiltered.firstName}`,
                    onClick: addContact,
                  } : undefined,
                });
                return;
              }
              if (currentFiltered) setShowMessageModal(currentFiltered);
              else toast.info("Chargement…");
            }}
            className={`relative w-14 h-14 rounded-full border-2 flex items-center justify-center transition-transform active:scale-95 shadow-sm ${
              features.preMatchMessage
                ? "border-primary/60 bg-background text-primary/80 hover:bg-primary/10"
                : "border-border bg-secondary/60 text-muted-foreground"
            }`}
          >
            <MessageCircle className="w-5 h-5" />
            {!features.preMatchMessage && (
              <Lock className="absolute -top-1 -right-1 w-3 h-3 text-gold bg-background rounded-full p-[1px]" />
            )}
          </button>
          <span className="text-[10px] text-muted-foreground font-medium">Message</span>
        </div>

        {/* L'état est montré sur le bouton : sans cela, rien ne distingue
            une invitation envoyée d'une invitation à envoyer, et on la
            renvoie — pour se voir refuser par la contrainte d'unicité. */}
        {/* Pastille pleine, icône ET libellé sur la même ligne — plutôt
            qu'un rond de plus dans une rangée de ronds.

            C'est le geste qui crée le lien, désormais le seul : lui
            donner la même forme qu'aux trois autres le noyait dans la
            barre. Le bleu plein, réservé à ce bouton, le désigne comme
            l'action principale sans avoir à lire.

            Une fois envoyée, il passe au vert et devient inerte : rien
            ne distinguerait autrement une invitation partie d'une
            invitation à envoyer. */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={addContact}
            disabled={invites.has(currentFiltered?.id ?? "")}
            className={`h-14 px-5 rounded-2xl flex items-center gap-2 font-semibold text-sm shadow-elegant transition-transform active:scale-95 ${
              invites.has(currentFiltered?.id ?? "")
                ? "bg-emerald-600 text-white"
                : "bg-primary text-primary-foreground hover:opacity-90"
            }`}
          >
            {invites.has(currentFiltered?.id ?? "")
              ? <CheckCircle2 className="w-5 h-5" />
              : <UserPlus className="w-5 h-5" />}
            {invites.has(currentFiltered?.id ?? "") ? "Invité" : "Ajouter"}
          </button>
        </div>
      </div>

      {/* Profile details below buttons */}
      {currentFiltered && (
        <motion.div
          key={currentFiltered.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 mb-24 rounded-3xl border border-border/60 bg-card shadow-soft overflow-hidden max-w-md mx-auto"
        >
          {/* Header */}
          <div className="px-5 pt-5 pb-4 border-b border-border/40">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-serif text-xl font-semibold">
                  {displayName(currentFiltered.firstName, currentFiltered.lastName)}, {currentFiltered.age}
                </h2>
                <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{currentFiltered.city}{currentFiltered.country ? `, ${currentFiltered.country}` : ""}</span>
                  {typeof currentFiltered.distanceKm === "number" && (
                    <span className="text-primary font-medium">
                      · à {Math.round(currentFiltered.distanceKm)} km
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                {currentFiltered.verified && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
                    <CheckCircle2 className="w-3 h-3" /> Vérifié
                  </span>
                )}
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gold/15 text-gold text-[10px] font-semibold">
                  {currentFiltered.compatibility}% compat.
                </span>
              </div>
            </div>
          </div>

          {/* Bio */}
          {currentFiltered.bio && currentFiltered.bio !== "Pas de bio." && (
            <div className="px-5 py-4 border-b border-border/40">
              <p className="text-sm text-foreground/85 leading-relaxed line-clamp-3">{currentFiltered.bio}</p>
            </div>
          )}

          {/* Key details grid */}
          <div className="grid grid-cols-2 gap-px bg-border/30">
            <div className="bg-card px-4 py-3 flex items-center gap-2.5">
              <Church className="w-4 h-4 text-primary shrink-0" />
              <div>
                <div className="text-[10px] text-muted-foreground">Dénomination</div>
                <div className="text-xs font-medium truncate max-w-[110px]">{currentFiltered.denomination || "Non précisé"}</div>
              </div>
            </div>
            <div className="bg-card px-4 py-3 flex items-center gap-2.5">
              <BookOpen className="w-4 h-4 text-primary shrink-0" />
              <div>
                <div className="text-[10px] text-muted-foreground">Vision du mariage</div>
                <div className="text-xs font-medium truncate max-w-[110px]">{currentFiltered.marriageVision || "Sérieux"}</div>
              </div>
            </div>
            <div className="bg-card px-4 py-3 flex items-center gap-2.5">
              <HeartIcon className="w-4 h-4 text-primary shrink-0" />
              <div>
                <div className="text-[10px] text-muted-foreground">Foi</div>
                <div className="text-xs font-medium truncate max-w-[110px]">{currentFiltered.faithImportance || "Importante"}</div>
              </div>
            </div>
            <div className="bg-card px-4 py-3 flex items-center gap-2.5">
              <Crown className="w-4 h-4 text-gold shrink-0" />
              <div>
                <div className="text-[10px] text-muted-foreground">Église</div>
                <div className="text-xs font-medium truncate max-w-[110px]">{currentFiltered.church || "Non précisé"}</div>
              </div>
            </div>
          </div>

          {/* Champs complémentaires, regroupés en trois blocs.
              Ils remplacent l'ancienne ligne « Intérêts », qui n'affichait
              qu'un des huit champs désormais renseignables. */}
          <div className="border-t border-border/40">
            <ProfileExtrasBlocks
              p={{
                marital_status: currentFiltered.maritalStatus,
                marriage_vision: currentFiltered.marriageVisionText,
                looking_for: currentFiltered.lookingFor,
                education: currentFiltered.educationLevel,
                height_cm: currentFiltered.heightCm,
                interests: currentFiltered.interests,
                qualities: currentFiltered.qualities,
                flaws: currentFiltered.flaws,
                dealbreakers: currentFiltered.dealbreakers,
              }}
            />
          </div>

          {/* View full profile */}
          <div className="px-5 pb-5 pt-3">
            <button
              onClick={() => setDetail(currentFiltered)}
              className="w-full py-2.5 rounded-full border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/5 transition-colors"
            >
              Voir le profil complet
            </button>
          </div>
        </motion.div>
      )}

      {/* Modal message pré-match */}
      <AnimatePresence>
        {showMessageModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
              onClick={() => { setShowMessageModal(null); setMessageText(""); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed inset-x-4 bottom-24 z-50 bg-card border border-border rounded-3xl p-5 shadow-elegant"
            >
              <div className="flex items-center gap-3 mb-4">
                <img src={showMessageModal.photo} className="w-12 h-12 rounded-full object-cover" alt="" />
                <div>
                  <div className="font-semibold">{showMessageModal.firstName}, {showMessageModal.age}</div>
                  <div className="text-xs text-muted-foreground">Envoyer un message pour briser la glace ✨</div>
                </div>
              </div>
              <textarea
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                placeholder={`Dites bonjour à ${showMessageModal.firstName}…`}
                rows={3}
                className="w-full px-4 py-3 rounded-2xl bg-secondary border border-border resize-none text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => { setShowMessageModal(null); setMessageText(""); }}
                  className="flex-1 py-2.5 rounded-full border border-border text-sm font-medium hover:bg-secondary"
                >
                  Annuler
                </button>
                <button
                  onClick={sendPreMatchMessage}
                  disabled={!messageText.trim()}
                  className="flex-1 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold shadow-elegant disabled:opacity-40"
                >
                  Envoyer 💌
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {detail && <ProfileDetailModal profile={detail} onClose={() => setDetail(null)} />}
      </AnimatePresence>

      {/* Guide des gestes : une fois, a la premiere visite. Sans lui,
          rien n indique comment aimer un profil. */}
      <GuideGestes />

      {refus && (
        <PanneauPremium
          titre={refus.titre}
          texte={refus.texte}
          avantages={refus.avantages}
          alternative={refus.alternative}
          onClose={() => setRefus(null)}
        />
      )}

      {limite && (
        <LimiteDemandes
          max={limite.max}
          prochain={limite.prochain}
          onClose={() => setLimite(null)}
        />
      )}

      {boostPicker && (
        <BoostPicker
          reason={boostPicker}
          onClose={() => {
            setBoostPicker(null);
            fetchBoostStatus().then(setBoostStatus);
          }}
        />
      )}

      {/* FILTRES DRAWER */}
      <AnimatePresence>
        {showFilters && (
          <FilterSheet
            filters={filters}
            onApply={setFilters}
            onClose={() => setShowFilters(false)}
            canUseAdvanced={features.advancedFilters}
            locationShared={locationShared}
            onLocationChange={setLocationShared}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function SwipeCard({
  profile,
  active,
  onSwipe,
  onDetail,
}: {
  profile: Profile;
  active: boolean;
  onSwipe: (dir: "left" | "right" | "super") => void;
  onDetail: () => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-10, 10]);
  const opacity = useTransform(x, [-200, -150, 0, 150, 200], [0, 1, 1, 1, 0]);

  const swipeLeftOpacity = useTransform(x, [-50, -150], [0, 1]);
  const swipeRightOpacity = useTransform(x, [50, 150], [0, 1]);

  return (
    <motion.div
      style={active ? { x, rotate, opacity } : {}}
      drag={active ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={(e, { offset, velocity }) => {
        const swipeThreshold = 100;
        if (offset.x > swipeThreshold) onSwipe("right");
        else if (offset.x < -swipeThreshold) onSwipe("left");
      }}
      className={`absolute inset-0 rounded-3xl overflow-hidden bg-card shadow-elegant border border-border/40 ${
        active ? "z-20 cursor-grab active:cursor-grabbing" : "z-10 scale-[0.98] opacity-80"
      }`}
    >
      <img src={profile.photo} alt={profile.firstName} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/10" />

      {active && (
        <>
          <motion.div style={{ opacity: swipeLeftOpacity }} className="absolute top-12 right-8 z-30">
            <div className="border-4 border-destructive text-destructive font-black text-4xl px-4 py-2 rounded-xl rotate-12 bg-black/40 backdrop-blur-sm">
              NOPE
            </div>
          </motion.div>
          <motion.div style={{ opacity: swipeRightOpacity }} className="absolute top-12 left-8 z-30">
            <div className="border-4 border-primary text-primary font-black text-4xl px-4 py-2 rounded-xl -rotate-12 bg-black/40 backdrop-blur-sm">
              LIKE
            </div>
          </motion.div>
        </>
      )}

      <div className="absolute inset-x-0 bottom-0 p-6 text-white pointer-events-none">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-semibold">
            {profile.compatibility}% Compatible
          </span>
          {profile.verified && (
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white shadow-soft">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </span>
          )}
          {(profile as any).online && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/80 backdrop-blur-md text-[10px] font-bold shadow-soft">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> En ligne
            </span>
          )}
        </div>
        <h2 className="font-serif text-3xl font-bold flex items-baseline gap-2 text-shadow-sm">
          <span className="truncate min-w-0">{displayName(profile.firstName, profile.lastName)}</span>
          <span className="shrink-0">, {profile.age}</span>
        </h2>
        <div className="flex flex-col gap-1 mt-2 text-sm opacity-90 text-shadow-sm">
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 shrink-0" /> 
            <span className="truncate max-w-[200px]">
              {profile.city}{profile.country ? `, ${profile.country}` : ""}
            </span>
            <Drapeau pays={profile.country} className="w-4 h-4 ml-0.5" />
          </div>
          <div className="flex items-center gap-1.5"><Church className="w-3.5 h-3.5" /> {profile.denomination}</div>
          <div className="flex items-center gap-1.5 opacity-80"><BookOpen className="w-3.5 h-3.5" /> {profile.bio.substring(0, 50)}...</div>
        </div>
      </div>

    </motion.div>
  );
}

function ProfileDetailModal({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto"
    >
      <div className="min-h-full max-w-md mx-auto bg-background relative pb-24 shadow-2xl">
        <div className="relative aspect-[3/4] md:aspect-[4/5]">
          <img src={profile.photo} alt={profile.firstName} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="absolute bottom-0 inset-x-0 p-6 pb-2">
            <h2 className="font-serif text-4xl font-bold flex items-center gap-2">
              <span className="truncate min-w-0">
                {displayName(profile.firstName, profile.lastName)}, {profile.age}
              </span>
              {profile.verified && <CheckCircle2 className="w-6 h-6 text-blue-500 shrink-0" />}
            </h2>
            <div className="flex items-center gap-2 text-muted-foreground mt-1 text-sm font-medium">
              <span>{profile.city}</span>
              <span>•</span>
              <span className="text-primary">{profile.compatibility}% Compatible</span>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-8">
          <section>
            <h3 className="font-serif text-lg font-semibold mb-3 flex items-center gap-2">
              <Church className="w-5 h-5 text-primary" /> Foi & Vision
            </h3>
            <div className="space-y-3 bg-secondary/30 p-4 rounded-2xl border border-border/50">
              <div><span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Dénomination</span><p className="font-medium">{profile.denomination}</p></div>
              <div><span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Vision du mariage</span><p className="font-medium text-sm leading-relaxed">{profile.marriageVision}</p></div>
            </div>
          </section>
          <section>
            <h3 className="font-serif text-lg font-semibold mb-2">À propos</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{profile.bio}</p>
          </section>
          {profile.photos.length > 1 && (
            <section>
              <h3 className="font-serif text-lg font-semibold mb-3">Photos</h3>
              <div className="grid grid-cols-2 gap-3">
                {profile.photos.slice(1).map((photo, i) => (
                  <img key={i} src={photo} alt="" className="w-full aspect-[3/4] object-cover rounded-2xl shadow-sm" />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </motion.div>
  );
}

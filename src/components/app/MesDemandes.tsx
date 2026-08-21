import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Heart, Star, Eye, Check, X, Flag, Ban, Lock, ChevronDown, ChevronUp, Rocket } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { useSubscription } from "@/lib/subscription";
import { displayName } from "@/lib/utils";
import { ReportDialog } from "@/components/app/ReportDialog";
import { ApercuProfil } from "@/components/app/ApercuProfil";
import { BoostPicker } from "@/components/app/BoostPicker";
import {
  blockUser, dismissLike, fetchBlockedIds, fetchDismissedIds,
} from "@/lib/moderation";

/**
 * M'ont aimé · Super Likes · Visiteurs — sur l'accueil.
 *
 * Ces trois blocs vivaient dans /demandes, derrière des onglets. Un
 * onglet ne se visite que si l'on sait déjà ce qu'il contient : sur une
 * application de rencontre, savoir qu'on plaît est justement ce qui
 * donne envie de revenir, et cette information n'avait rien à faire à
 * deux clics de l'écran d'ouverture.
 *
 * LES TROIS RUBRIQUES SONT TOUJOURS VISIBLES, même à zéro — une ligne
 * discrète suffit alors. Les masquer quand elles sont vides ne laissait
 * aucune trace d'elles sur un compte neuf : impossible de savoir que ces
 * listes existent, ni où les retrouver une fois remplies.
 *
 * Chacune montre d'abord des VISAGES, pas des cartes : le nombre seul
 * est abstrait, la carte complète encombrante. « Voir plus » déplie le
 * détail et ses actions.
 */

type Profil = {
  id: string;
  first_name: string;
  last_name: string | null;
  birth_date: string | null;
  city: string | null;
  photos: string[] | null;
  bio?: string | null;
};

type LikeEntry = {
  id: string;
  swiper_id: string;
  action: "like" | "superlike";
  created_at: string;
  profile: Profil;
};

type VisitEntry = { id: string; created_at: string; visitor: Profil | null };


function age(d: string | null) {
  if (!d) return 0;
  const b = new Date(d);
  if (Number.isNaN(b.getTime())) return 0;
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  const m = n.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a--;
  return a > 0 && a < 120 ? a : 0;
}

function ilYA(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j < 7) return `il y a ${j} j`;
  return `le ${new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}`;
}

/** Repli sur l'initiale : une photo cassée ne doit pas laisser un trou gris. */
function Photo({ src, name }: { src: string | null | undefined; name: string }) {
  const [rate, setRate] = useState(false);
  if (!src || rate) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-primary/25 to-gold/25 flex items-center justify-center font-serif text-4xl font-semibold text-primary">
        {(name || "?").charAt(0).toUpperCase()}
      </div>
    );
  }
  return <img src={src} alt={name} className="w-full h-full object-cover"
              loading="lazy" onError={() => setRate(true)} />;
}

export function MesDemandes() {
  const [likes, setLikes] = useState<LikeEntry[]>([]);
  const [superlikes, setSuperlikes] = useState<LikeEntry[]>([]);
  const [visites, setVisites] = useState<VisitEntry[]>([]);
  const [chargement, setChargement] = useState(true);
  const [signaler, setSignaler] = useState<{ id: string; name?: string } | null>(null);
  const [apercu, setApercu] = useState<Profil | null>(null);
  const [boostOuvert, setBoostOuvert] = useState(false);
  const { features } = useSubscription();

  useEffect(() => {
    let annule = false;

    (async () => {
      try {
        const user = await getCurrentUser();
        if (!user) { setChargement(false); return; }

        // Une seule ronde : les trois requêtes ne dépendent pas les unes
        // des autres, les enchaîner tripleraient l'attente.
        const [{ data: swipes }, bloques, ecartes, { data: visits }] = await Promise.all([
          supabase
            .from("swipes")
            .select("id, swiper_id, action, created_at, profiles!swipes_swiper_id_fkey(id, first_name, last_name, birth_date, city, photos, bio)")
            .eq("target_id", user.id)
            .in("action", ["like", "superlike"])
            .order("created_at", { ascending: false }),
          fetchBlockedIds(),
          fetchDismissedIds(),
          supabase
            .from("profile_visits")
            .select("id, visitor_id, created_at")
            .eq("visited_id", user.id)
            .order("created_at", { ascending: false })
            .limit(50),
        ]);

        if (annule) return;
        const masques = new Set([...bloques, ...ecartes]);

        const tous = (swipes ?? [])
          .filter((s: any) => !masques.has(s.swiper_id))
          .map((s: any) => ({
            id: s.id, swiper_id: s.swiper_id, action: s.action,
            created_at: s.created_at, profile: s.profiles,
          }));

        setLikes(tous.filter((s: any) => s.action === "like"));
        setSuperlikes(tous.filter((s: any) => s.action === "superlike"));

        const vus = (visits ?? []).filter((v: any) => !masques.has(v.visitor_id));
        if (vus.length > 0) {
          const { data: profils } = await supabase
            .from("profiles")
            .select("id, first_name, last_name, birth_date, city, photos, bio")
            .in("id", vus.map((v: any) => v.visitor_id));

          if (annule) return;
          const carte = new Map((profils ?? []).map((p: any) => [p.id, p]));
          setVisites(vus.map((v: any) => ({
            id: v.id, created_at: v.created_at, visitor: carte.get(v.visitor_id) ?? null,
          })));
        }
      } catch (e) {
        console.error("[accueil/demandes]", e);
      } finally {
        if (!annule) setChargement(false);
      }
    })();

    return () => { annule = true; };
  }, []);

  const retirer = (id: string) => {
    setLikes(p => p.filter(l => l.id !== id));
    setSuperlikes(p => p.filter(l => l.id !== id));
  };

  const accepter = async (e: LikeEntry) => {
    const user = await getCurrentUser();
    if (!user) return;

    // `upsert` : si cette personne avait déjà été swipée, une contrainte
    // d'unicité ferait échouer un simple insert, sans rien dire.
    const { error } = await supabase.from("swipes").upsert(
      { swiper_id: user.id, target_id: e.swiper_id, action: "like" },
      { onConflict: "swiper_id,target_id" },
    );

    if (error) {
      console.error("[accueil/demandes] acceptation:", error);
      toast.error("Erreur lors de l'action");
      return;
    }

    toast.success(`C'est un match avec ${e.profile?.first_name} ! 🎉`);
    retirer(e.id);
  };

  const refuser = async (e: LikeEntry) => {
    retirer(e.id);
    const ok = await dismissLike(e.swiper_id);
    toast.info(ok ? "Refusé" : "Refusé (non enregistré)");
  };

  const bloquer = async (e: LikeEntry) => {
    retirer(e.id);
    const ok = await blockUser(e.swiper_id);
    if (ok) toast.success(`${e.profile?.first_name} a été bloqué`);
    else toast.error("Le blocage n'a pas pu être enregistré");
  };

  if (chargement) {
    return <div className="px-4"><div className="h-40 rounded-3xl bg-secondary animate-pulse" /></div>;
  }

  const superVerrouille = !features.seeAdmirers;
  const visitesVerrouillees = !features.visitors;

  /* Les trois rubriques sont TOUJOURS affichées, même à zéro.
     Les masquer quand elles sont vides — ce que je faisais — laissait
     l'accueil sans aucune trace d'elles sur un compte neuf : impossible
     de savoir que ces listes existent, ni où les retrouver quand elles
     se rempliront. Une ligne « Personne pour l'instant » occupe deux
     centimètres et répond à la question. */

  return (
    <div className="px-4 space-y-6">
      {/* Aucun bouton d'action ici, volontairement : cette rubrique se
          regarde. Décider — accepter, refuser — se fait après avoir
          ouvert le profil, pas au survol d'une vignette de seize pixels
          où la moitié des gestes seraient accidentels. */}
      <BlocAvatars
        titre="M'ont aimé"
        icone={Heart}
        verrouille={superVerrouille}
        vide="Personne ne vous a encore aimé."
        cta="Voir qui vous a aimé"
        onClic={(p) => {
          const l = likes.find(x => x.id === p.cle);
          if (l?.profile) setApercu(l.profile);
        }}
        personnes={likes.map(l => ({
          cle: l.id,
          photo: l.profile?.photos?.[0],
          prenom: l.profile?.first_name,
        }))}
      />

      {/* La rubrique « Super Likes » a été retirée de l'accueil.
          Le Super Like n'a plus AUCUN moyen d'être envoyé : son bouton a
          quitté la barre d'action de /decouvrir, et le balayage de la
          carte a été supprimé à son tour. Annoncer « Aucun Super Like
          reçu pour l'instant » entretenait donc l'attente d'une chose
          qui ne peut plus arriver.

          Les données restent intactes : `superlikes` continue d'être
          chargé, et les Super Likes déjà reçus sont toujours en base. Le
          jour où l'envoi revient, il suffira de remettre ce bloc. */}

      <BlocAvatars
        titre="Visiteurs"
        icone={Eye}
        verrouille={visitesVerrouillees}
        vide="Personne n'a encore regardé votre profil."
        cta="Voir vos visiteurs"
        personnes={visites.map(v => ({
          cle: v.id,
          photo: v.visitor?.photos?.[0],
          prenom: v.visitor?.first_name,
        }))}
      >
        <Grille>
          {visites.map((v, i) => (
            <motion.div
              key={v.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="rounded-2xl overflow-hidden bg-card border border-border/50 shadow-soft"
            >
              <div className="relative aspect-[3/4]">
                <Photo src={v.visitor?.photos?.[0]} name={v.visitor?.first_name || "Membre"} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-background/90 text-foreground text-[10px] font-semibold">
                  <Eye className="w-3 h-3" /> {ilYA(v.created_at)}
                </span>
                <div className="absolute inset-x-0 bottom-0 p-2.5 text-white">
                  <div className="font-serif text-base font-semibold leading-tight truncate">
                    {displayName(v.visitor?.first_name, v.visitor?.last_name)}
                    {age(v.visitor?.birth_date || null) > 0 && `, ${age(v.visitor?.birth_date || null)}`}
                  </div>
                  <div className="text-[10px] opacity-90 mt-0.5">{v.visitor?.city}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </Grille>
      </BlocAvatars>

      {/* Placé JUSTE APRÈS les visiteurs, et c'est tout l'intérêt.
          Un membre qui vient de lire « personne n'a encore regardé votre
          profil » ressent exactement le manque que le Boost comble. La
          même proposition ailleurs sur la page n'aurait aucune prise. */}
      <button
        onClick={() => setBoostOuvert(true)}
        className="w-full flex items-center gap-3 rounded-2xl bg-gold text-gold-foreground p-4 text-left shadow-elegant hover:opacity-95 active:scale-[0.99] transition-all"
      >
        <span className="w-10 h-10 rounded-xl bg-black/10 grid place-items-center shrink-0">
          <Rocket className="w-5 h-5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold">Augmente tes chances ✨</span>
          <span className="block text-xs opacity-80 mt-0.5 leading-snug">
            Boost ton profil pour apparaître en premier
          </span>
        </span>
        <span className="text-xs font-semibold shrink-0 underline underline-offset-2">
          Voir les offres
        </span>
      </button>

      {boostOuvert && <BoostPicker onClose={() => setBoostOuvert(false)} />}

      {/* Clic sur un visage : la fiche s'ouvre. C'est là, photos et
          présentation sous les yeux, qu'on se fait une idée. */}
      {apercu && (
        <ApercuProfil
          profil={{
            prenom: apercu.first_name,
            nom: apercu.last_name,
            ville: apercu.city,
            naissance: apercu.birth_date,
            photos: apercu.photos,
            bio: apercu.bio,
          }}
          onClose={() => setApercu(null)}
        />
      )}

      <ReportDialog
        open={!!signaler}
        onOpenChange={o => !o && setSignaler(null)}
        reportedId={signaler?.id ?? ""}
        reportedName={signaler?.name}
        context="profile"
      />
    </div>
  );
}

function Grille({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

type Personne = { cle: string; photo?: string | null; prenom?: string | null };

/**
 * Une rubrique : compteur, rangée de visages, puis « Voir plus ».
 *
 * POURQUOI DES AVATARS ET NON DES CARTES. Le nombre seul est abstrait,
 * la carte complète est encombrante. Une rangée de visages dit en un
 * coup d'œil combien de personnes s'intéressent à vous, sans occuper un
 * écran entier. « Voir plus » déplie le détail et ses actions.
 *
 * SOUS VERROU : LES VISAGES SONT FLOUTÉS, PAS MASQUÉS.
 *
 * Un carré vide ne donne envie de rien ; un flou dit qu'il y a réellement
 * quelqu'un derrière. C'est toute la différence entre une invitation et
 * une frustration.
 *
 * Et le compteur reste EXACT, jamais gonflé. Cacher le nombre
 * n'inciterait à rien — c'est de savoir qu'ils sont douze à attendre que
 * naît l'envie de s'abonner. Un chiffre inventé se retournerait contre
 * vous le jour où l'abonné n'en trouverait que trois.
 */
function BlocAvatars({
  titre, icone: Icone, verrouille, personnes, vide, cta, onClic, children,
}: {
  titre: string;
  icone: typeof Heart;
  verrouille: boolean;
  personnes: Personne[];
  vide: string;
  cta: string;
  /** Clic sur un visage. Sans cette fonction, l'avatar reste inerte. */
  onClic?: (p: Personne) => void;
  /**
   * Détail déplié par « Voir plus ».
   *
   * Absent, « Voir plus » se contente de dérouler TOUS les visages au
   * lieu des douze premiers. C'est le cas de « M'ont aimé » : la
   * rubrique doit rester contemplative, sans bouton d'action posé sous
   * chaque personne.
   */
  children?: React.ReactNode;
}) {
  const [deplie, setDeplie] = useState(false);
  const n = personnes.length;
  const APERCU = 12;

  // Sans détail à déplier, il n'y a rien de plus à montrer une fois tous
  // les visages affichés : le bouton disparaît.
  const peutDeplier = children ? true : n > APERCU;
  const visibles = deplie && !verrouille ? personnes : personnes.slice(0, APERCU);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-serif text-lg font-semibold flex items-center gap-2">
          <Icone className="w-4 h-4 text-primary" />
          {titre}
          {n > 0 && (
            <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full tabular-nums">
              {n}
            </span>
          )}
        </h3>
        {verrouille && n > 0 && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
      </div>

      {n === 0 ? (
        <Rien texte={vide} />
      ) : deplie && !verrouille && children ? (
        <>
          {children}
          <button
            onClick={() => setDeplie(false)}
            className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-sm font-medium transition-colors">
            Réduire <ChevronUp className="w-3.5 h-3.5" />
          </button>
        </>
      ) : (
        <>
          {/* Replié : une rangée qui défile. Déplié : une grille, pour
              voir tout le monde d'un coup sans faire glisser. */}
          <div className={deplie && !verrouille && !children
            ? "grid grid-cols-4 sm:grid-cols-6 gap-3"
            : "flex gap-2.5 overflow-x-auto scrollbar-none pb-1"}>
            {visibles.map(p => {
              const cliquable = !!onClic && !verrouille;
              const Balise = cliquable ? "button" : "div";
              return (
                <Balise
                  key={p.cle}
                  onClick={cliquable ? () => onClic!(p) : undefined}
                  className={`shrink-0 ${cliquable ? "text-left transition-transform hover:scale-105" : ""}`}
                  aria-label={cliquable ? `Voir le profil de ${p.prenom ?? "ce membre"}` : undefined}
                >
                  <span className="block w-16 h-16 rounded-full p-[2px] bg-gradient-to-br from-primary to-gold">
                    <span className="block w-full h-full rounded-full overflow-hidden bg-background">
                      <span className={verrouille ? "block w-full h-full blur-md scale-110" : "block w-full h-full"}>
                        <Photo src={p.photo} name={p.prenom || "Membre"} />
                      </span>
                    </span>
                  </span>
                  {/* Le prénom est caché avec le visage : livrer la moitié
                      de l'information reviendrait à ne rien verrouiller. */}
                  <p className="text-[10px] text-center mt-1 truncate w-16 text-muted-foreground">
                    {verrouille ? "•••" : p.prenom}
                  </p>
                </Balise>
              );
            })}
          </div>

          {verrouille ? (
            <Link
              to="/abonnement"
              className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gold text-gold-foreground text-sm font-semibold shadow-elegant hover:opacity-90 transition-opacity">
              <Lock className="w-4 h-4" /> {cta} — Premium
            </Link>
          ) : deplie && !children ? (
            <button
              onClick={() => setDeplie(false)}
              className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-sm font-medium transition-colors">
              Réduire <ChevronUp className="w-3.5 h-3.5" />
            </button>
          ) : peutDeplier ? (
            <button
              onClick={() => setDeplie(true)}
              className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-sm font-medium transition-colors">
              Voir plus <ChevronDown className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * Rubrique vide — une ligne, pas un grand cadre.
 *
 * Trois encarts vides empilés donneraient un accueil désert. Une phrase
 * discrète suffit à dire que la rubrique existe et attend.
 */
function Rien({ texte }: { texte: string }) {
  return (
    <p className="rounded-xl bg-secondary/50 px-3.5 py-3 text-xs text-muted-foreground">
      {texte}
    </p>
  );
}

function CarteLike({
  entry, delai, onAccepter, onRefuser, onBloquer, onSignaler,
}: {
  entry: LikeEntry;
  delai: number;
  onAccepter: (e: LikeEntry) => void;
  onRefuser: (e: LikeEntry) => void;
  onBloquer: (e: LikeEntry) => void;
  onSignaler: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delai }}
      className="rounded-2xl overflow-hidden bg-card border border-border/50 shadow-soft"
    >
      <div className="relative aspect-[3/4]">
        <Photo src={entry.profile?.photos?.[0]} name={entry.profile?.first_name || "Membre"} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />

        {entry.action === "superlike" && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold shadow-soft">
            <Star className="w-3 h-3" fill="currentColor" /> Super Like
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 p-2.5 text-white">
          <div className="font-serif text-base font-semibold leading-tight truncate">
            {displayName(entry.profile?.first_name, entry.profile?.last_name)}
            {age(entry.profile?.birth_date || null) > 0 && `, ${age(entry.profile?.birth_date || null)}`}
          </div>
          <div className="text-[10px] opacity-90 mt-0.5">{entry.profile?.city}</div>
        </div>
      </div>

      <div className="grid grid-cols-4 divide-x divide-border/60 border-t border-border/60">
        <button aria-label="Accepter" onClick={() => onAccepter(entry)}
                className="py-2.5 flex items-center justify-center hover:bg-secondary/60 transition-colors text-emerald-500">
          <Check className="w-4 h-4" />
        </button>
        <button aria-label="Refuser" onClick={() => onRefuser(entry)}
                className="py-2.5 flex items-center justify-center hover:bg-secondary/60 transition-colors text-destructive">
          <X className="w-4 h-4" />
        </button>
        <button aria-label="Signaler" onClick={onSignaler}
                className="py-2.5 flex items-center justify-center hover:bg-secondary/60 transition-colors text-muted-foreground">
          <Flag className="w-4 h-4" />
        </button>
        <button aria-label="Bloquer" onClick={() => onBloquer(entry)}
                className="py-2.5 flex items-center justify-center hover:bg-secondary/60 transition-colors text-muted-foreground">
          <Ban className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}

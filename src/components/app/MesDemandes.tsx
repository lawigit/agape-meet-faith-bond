import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Heart, Star, Eye, Check, X, Flag, Ban, Lock, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { useSubscription } from "@/lib/subscription";
import { displayName } from "@/lib/utils";
import { ReportDialog } from "@/components/app/ReportDialog";
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
 * CHAQUE BLOC N'APPARAÎT QUE S'IL A QUELQUE CHOSE À DIRE. Trois cadres
 * vides empilés en haut de l'accueil donneraient l'impression d'une
 * application déserte — exactement l'inverse de l'effet recherché.
 *
 * Seule exception : un bloc verrouillé s'affiche même sans contenu
 * visible, puisque le compteur chiffré EST son intérêt.
 */

type Profil = {
  id: string;
  first_name: string;
  last_name: string | null;
  birth_date: string | null;
  city: string | null;
  photos: string[] | null;
};

type LikeEntry = {
  id: string;
  swiper_id: string;
  action: "like" | "superlike";
  created_at: string;
  profile: Profil;
};

type VisitEntry = { id: string; created_at: string; visitor: Profil | null };

/** Combien d'éléments avant de replier. Deux lignes de deux. */
const APERCU = 4;

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
            .select("id, swiper_id, action, created_at, profiles!swipes_swiper_id_fkey(id, first_name, last_name, birth_date, city, photos)")
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
            .select("id, first_name, last_name, birth_date, city, photos")
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

  const rienAMontrer =
    likes.length === 0 &&
    (superlikes.length === 0 && !superVerrouille) &&
    (visites.length === 0 && !visitesVerrouillees);

  if (rienAMontrer) return null;

  return (
    <div className="px-4 space-y-6">
      {/* « M'ont aimé » est ouvert à tous : voir qu'on plaît est ce qui
          fait revenir, et le verrouiller sur un compte neuf ne laisserait
          qu'un cadenas devant une liste vide. */}
      {likes.length > 0 && (
        <Bloc titre="M'ont aimé" icone={Heart} n={likes.length}>
          {(visibles) => (
            <Grille>
              {likes.slice(0, visibles).map((l, i) => (
                <CarteLike key={l.id} entry={l} delai={i * 0.03}
                           onAccepter={accepter} onRefuser={refuser}
                           onBloquer={bloquer}
                           onSignaler={() => setSignaler({ id: l.swiper_id, name: l.profile?.first_name })} />
              ))}
            </Grille>
          )}
        </Bloc>
      )}

      {(superlikes.length > 0 || superVerrouille) && (
        <Bloc titre="Super Likes" icone={Star} n={superlikes.length}>
          {(visibles) => (
            superVerrouille
              ? <Verrou n={superlikes.length} type="superlike" />
              : <Grille>
                  {superlikes.slice(0, visibles).map((l, i) => (
                    <CarteLike key={l.id} entry={l} delai={i * 0.03}
                               onAccepter={accepter} onRefuser={refuser}
                               onBloquer={bloquer}
                               onSignaler={() => setSignaler({ id: l.swiper_id, name: l.profile?.first_name })} />
                  ))}
                </Grille>
          )}
        </Bloc>
      )}

      {(visites.length > 0 || visitesVerrouillees) && (
        <Bloc titre="Visiteurs" icone={Eye} n={visites.length}
              verrouille={visitesVerrouillees}>
          {(visibles) => (
            visitesVerrouillees
              ? <Verrou n={visites.length} type="visit" />
              : <Grille>
                  {visites.slice(0, visibles).map((v, i) => (
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
          )}
        </Bloc>
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

/**
 * Un bloc replié à quatre éléments.
 *
 * Ces listes atteignent vite plusieurs dizaines de profils. Tout dérouler
 * repousserait le reste de l'accueil — le contenu du jour, les
 * suggestions — sous plusieurs écrans de défilement.
 */
function Bloc({
  titre, icone: Icone, n, verrouille, children,
}: {
  titre: string;
  icone: typeof Heart;
  n: number;
  verrouille?: boolean;
  children: (visibles: number) => React.ReactNode;
}) {
  const [tout, setTout] = useState(false);
  const visibles = tout ? n : APERCU;

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
      </div>

      {children(visibles)}

      {!verrouille && n > APERCU && !tout && (
        <button
          onClick={() => setTout(true)}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-sm font-medium transition-colors">
          Voir les {n - APERCU} autres <ChevronDown className="w-3.5 h-3.5" />
        </button>
      )}
    </section>
  );
}

function Grille({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
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

/** On dit COMBIEN, jamais QUI. C'est ce qui donne envie, et c'est honnête. */
function Verrou({ n, type }: { n: number; type: "superlike" | "visit" }) {
  const vide = type === "visit"
    ? "personne n'a encore regardé votre profil"
    : "aucun Super Like reçu pour l'instant";

  const teaser = type === "visit"
    ? `${n} membre${n > 1 ? "s ont" : " a"} récemment regardé votre profil`
    : `${n} Super Like${n > 1 ? "s" : ""} vous attend${n > 1 ? "ent" : ""}`;

  return (
    <div className="rounded-3xl overflow-hidden relative">
      <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/85 to-primary/70" />
      <div className="relative p-6 text-center text-primary-foreground">
        <div className="w-12 h-12 rounded-full bg-gold text-gold-foreground mx-auto flex items-center justify-center shadow-elegant">
          <Lock className="w-5 h-5" />
        </div>
        <div className="font-serif text-3xl font-semibold mt-3">{n > 0 ? n : "—"}</div>
        <p className="text-sm opacity-95 mt-1">{n > 0 ? teaser : vide}</p>
        <Link
          to="/abonnement"
          className="mt-4 inline-flex px-5 py-2 rounded-full bg-gold text-gold-foreground text-sm font-semibold shadow-elegant">
          Devenir Premium
        </Link>
      </div>
    </div>
  );
}

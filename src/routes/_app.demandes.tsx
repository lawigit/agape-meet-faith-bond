import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { GuideEcran } from "@/components/app/GuideEcran";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  Heart, Inbox, Send, UserCheck, Hourglass, CheckCircle2, XCircle,
  Search, MapPin, Clock, X, ArrowRight, MessageCircle, Check, Ban, Flag,
  Quote,
} from "lucide-react";
import { toast } from "sonner";
import { displayName } from "@/lib/utils";
import { ReportDialog } from "@/components/app/ReportDialog";
import { ApercuProfil } from "@/components/app/ApercuProfil";
import { blockUser } from "@/lib/moderation";
import {
  fetchDemandes, repondreDemande, annulerDemande, RAISONS,
  type Demande, type StatutDemande, type MesDemandes,
} from "@/lib/contacts";

export const Route = createFileRoute("/_app/demandes")({
  head: () => ({
    meta: [
      { title: "Demandes — AgapeMeet" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RequestsPage,
});

/**
 * Demandes de contact — reçues, envoyées, contacts.
 *
 * RIEN À VOIR AVEC LES LIKES. Un like part d'un balayage, reste
 * silencieux, et n'apparaît que s'il est réciproque : il se consulte
 * dans « M'ont aimé », sur l'accueil. Une demande de contact est
 * explicite — on sollicite quelqu'un nommément, et l'autre répond.
 *
 * C'est pourquoi cette page peut proposer « Annuler » et « Refusée » :
 * ces deux notions n'ont aucun sens pour un like.
 */

type Onglet = "recues" | "envoyees" | "contacts";
type Filtre = "toutes" | "pending" | "accepted" | "refused";

const ONGLETS = [
  { id: "recues" as const, label: "Reçues", icone: Inbox },
  { id: "envoyees" as const, label: "Envoyées", icone: Send },
  { id: "contacts" as const, label: "Contacts", icone: UserCheck },
];

const FILTRES: { id: Filtre; label: string; icone: any }[] = [
  { id: "toutes", label: "Toutes", icone: Send },
  { id: "pending", label: "En attente", icone: Hourglass },
  { id: "accepted", label: "Acceptées", icone: CheckCircle2 },
  { id: "refused", label: "Refusées", icone: XCircle },
];

function age(d: string | null | undefined) {
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
  if (min < 60) return `Il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j < 7) return `Il y a ${j} jour${j > 1 ? "s" : ""}`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function RequestsPage() {
  const [onglet, setOnglet] = useState<Onglet>("recues");
  const [filtre, setFiltre] = useState<Filtre>("toutes");
  const [d, setD] = useState<MesDemandes | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [apercu, setApercu] = useState<Demande | null>(null);
  const [signaler, setSignaler] = useState<{ id: string; name?: string } | null>(null);
  const navigate = useNavigate();

  async function charger() {
    setD(await fetchDemandes());
  }

  useEffect(() => { charger(); }, []);

  /* ── Actions ── */

  const repondre = async (dem: Demande, accepte: boolean) => {
    setBusy(dem.id);
    const res = await repondreDemande(dem.id, accepte);
    setBusy(null);

    if (!res.ok) { toast.error(RAISONS[(res as any).raison] ?? "Action impossible"); return; }
    toast.success(accepte ? `${dem.prenom} fait partie de vos contacts` : "Demande refusée");
    charger();
  };

  const annuler = async (dem: Demande) => {
    setBusy(dem.id);
    const res = await annulerDemande(dem.id);
    setBusy(null);

    if (!res.ok) { toast.error(RAISONS[(res as any).raison] ?? "Annulation impossible"); return; }
    toast.success("Demande annulée");
    charger();
  };

  const bloquer = async (dem: Demande) => {
    if (!confirm(`Bloquer ${dem.prenom} ?`)) return;
    const ok = await blockUser(dem.autre_id);
    if (!ok) { toast.error("Le blocage n'a pas pu être enregistré"); return; }
    toast.success(`${dem.prenom} a été bloqué`);
    charger();
  };

  /* ── Affichage ── */

  const liste = !d ? [] : onglet === "recues" ? d.recues
                        : onglet === "envoyees" ? d.envoyees : d.contacts;

  // Un contact n'a qu'un état : le filtrer par statut n'aurait aucun sens.
  const filtresVisibles = onglet === "contacts" ? [] : FILTRES;

  const visibles = filtre === "toutes" || filtresVisibles.length === 0
    ? liste
    : liste.filter(x => x.statut === filtre);

  return (
    <div className="px-4 pt-4 pb-8">
      <GuideEcran ecran="demandes" />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold flex items-center gap-2">
            Demandes <Heart className="w-5 h-5 text-primary" />
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gérez vos demandes et vos contacts
          </p>
        </div>
        <Link
          to="/decouvrir"
          className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/15 transition-colors"
        >
          <Search className="w-4 h-4" /> Découvrir
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-1 p-1 rounded-2xl bg-secondary/60">
        {ONGLETS.map(o => {
          const n = !d ? 0
            : o.id === "recues" ? d.recues.length
            : o.id === "envoyees" ? d.envoyees.length : d.contacts.length;
          const actif = onglet === o.id;
          return (
            /* Sur mobile : icône et compteur sur une ligne, libellé en
               dessous. Sur 360 px de large, trois onglets sur une seule
               ligne ne laissaient qu'une soixantaine de pixels au texte
               — « Envoyées » y était coupé. Deux lignes coûtent quinze
               pixels de hauteur et rendent tout lisible. */
            <button
              key={o.id}
              onClick={() => { setOnglet(o.id); setFiltre("toutes"); }}
              className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 px-1 py-2 rounded-xl font-semibold transition-colors ${
                actif ? "bg-primary text-primary-foreground shadow-soft"
                      : "text-muted-foreground hover:text-foreground"}`}
            >
              <span className="flex items-center gap-1.5">
                <o.icone className="w-4 h-4 shrink-0" />
                <span className={`text-[10px] rounded-full px-1.5 py-0.5 tabular-nums ${
                  actif ? "bg-primary-foreground/20" : "bg-background"}`}>
                  {n}
                </span>
              </span>
              {/* Pas de `truncate` : le libellé doit se lire en entier. */}
              <span className="text-xs sm:text-sm leading-tight">{o.label}</span>
            </button>
          );
        })}
      </div>

      {/* Quatre filtres en 2 × 2 sur mobile, sur une ligne à partir du
          format tablette.

          Le défilement horizontal a été retiré : il cachait « Acceptées »
          et « Refusées » hors écran, sans rien pour le signaler. Un
          filtre qu'on ne voit pas est un filtre qui n'existe pas. */}
      {filtresVisibles.length > 0 && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 rounded-2xl bg-secondary/60">
          {filtresVisibles.map(f => (
            <button
              key={f.id}
              onClick={() => setFiltre(f.id)}
              className={`inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors ${
                filtre === f.id ? "bg-primary text-primary-foreground shadow-soft"
                                : "text-muted-foreground hover:text-foreground"}`}
            >
              <f.icone className="w-3.5 h-3.5 shrink-0" />
              <span className="leading-tight">{f.label}</span>
            </button>
          ))}
        </div>
      )}

      {!d ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[0, 1].map(i => <div key={i} className="h-36 rounded-2xl bg-secondary animate-pulse" />)}
        </div>
      ) : visibles.length === 0 ? (
        <Vide onglet={onglet} filtre={filtre} />
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {visibles.map((x, i) => (
            <Carte
              key={x.id}
              d={x}
              delai={i * 0.03}
              onglet={onglet}
              busy={busy === x.id}
              onAccepter={() => repondre(x, true)}
              onRefuser={() => repondre(x, false)}
              onAnnuler={() => annuler(x)}
              onBloquer={() => bloquer(x)}
              onSignaler={() => setSignaler({ id: x.autre_id, name: x.prenom })}
              onVoir={() => setApercu(x)}
              /* `?c=` ouvre directement la conversation. Sans lui, on
                 déposait le membre sur la liste, à charge pour lui d'y
                 retrouver le nom qu'il venait d'accepter. */
              onMessage={() => navigate({
                to: "/messages",
                search: x.match_id ? { c: x.match_id } : {},
              })}
            />
          ))}
        </div>
      )}

      {apercu && (
        <ApercuProfil
          profil={{
            prenom: apercu.prenom, nom: apercu.nom,
            ville: apercu.ville, naissance: apercu.naissance,
            photos: apercu.photos, bio: apercu.bio, verifie: apercu.verifie,
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

/* ─────────────── Carte ─────────────── */

const CHIPS: Record<StatutDemande, { label: string; classe: string; icone: any }> = {
  pending:  { label: "En attente", classe: "bg-gold/15 text-gold-foreground", icone: Hourglass },
  accepted: { label: "Acceptée",   classe: "bg-emerald-500/15 text-emerald-600", icone: CheckCircle2 },
  refused:  { label: "Refusée",    classe: "bg-destructive/10 text-destructive", icone: XCircle },
};

function Carte({
  d, delai, onglet, busy,
  onAccepter, onRefuser, onAnnuler, onBloquer, onSignaler, onVoir, onMessage,
}: {
  d: Demande;
  delai: number;
  onglet: Onglet;
  busy: boolean;
  onAccepter: () => void;
  onRefuser: () => void;
  onAnnuler: () => void;
  onBloquer: () => void;
  onSignaler: () => void;
  onVoir: () => void;
  onMessage: () => void;
}) {
  const chip = CHIPS[d.statut];
  const a = age(d.naissance);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delai }}
      className="rounded-2xl bg-card border border-border/60 shadow-soft overflow-hidden"
    >
      <div className="p-3.5 flex items-start gap-3">
        <button onClick={onVoir} className="shrink-0" aria-label="Voir le profil">
          <span className="block w-14 h-14 rounded-full p-[2px] bg-gradient-to-br from-primary to-gold">
            <span className="block w-full h-full rounded-full overflow-hidden bg-background">
              {d.photos?.[0]
                ? <img src={d.photos[0]} alt={d.prenom} className="w-full h-full object-cover" loading="lazy" />
                : <span className="w-full h-full flex items-center justify-center font-serif text-xl font-semibold text-primary">
                    {(d.prenom || "?").charAt(0).toUpperCase()}
                  </span>}
            </span>
          </span>
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="font-semibold truncate flex items-center gap-1">
              <span className="truncate">
                {displayName(d.prenom, d.nom)}{a > 0 && <span className="font-normal">, {a}</span>}
              </span>
              {d.verifie && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
            </div>
            {onglet !== "contacts" && (
              <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${chip.classe}`}>
                <chip.icone className="w-3 h-3" /> {chip.label}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
            {d.ville && (
              <span className="inline-flex items-center gap-1 min-w-0">
                <MapPin className="w-3 h-3 shrink-0" /> <span className="truncate">{d.ville}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1 shrink-0">
              <Clock className="w-3 h-3" /> {ilYA(d.created_at)}
            </span>
          </div>

          {/* Le mot joint pèse plus que tout le reste dans la décision.
              Il ne devait pas rester caché derrière « Voir profil ». */}
          {d.message && (
            <p className="mt-2 text-[11px] text-muted-foreground bg-secondary/60 rounded-lg px-2.5 py-1.5 flex gap-1.5">
              <Quote className="w-3 h-3 shrink-0 mt-0.5 opacity-50" />
              <span className="line-clamp-2 italic">{d.message}</span>
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 px-3.5 pb-3.5">
        {onglet === "recues" && d.statut === "pending" && (
          <>
            <Bouton onClick={onRefuser} busy={busy} ton="rouge" icone={X} label="Refuser" />
            <Bouton onClick={onAccepter} busy={busy} ton="vert" icone={Check} label="Accepter" />
          </>
        )}

        {onglet === "envoyees" && d.statut === "pending" && (
          <>
            <Bouton onClick={onAnnuler} busy={busy} ton="rouge" icone={X} label="Annuler" />
            <Bouton onClick={onVoir} ton="doux" icone={ArrowRight} label="Voir profil" />
          </>
        )}

        {(onglet === "contacts" || d.statut === "accepted") && (
          <>
            <Bouton onClick={onVoir} ton="doux" icone={ArrowRight} label="Voir profil" />
            <Bouton onClick={onMessage} ton="plein" icone={MessageCircle} label="Message" />
          </>
        )}

        {onglet === "recues" && d.statut === "refused" && (
          <>
            <Bouton onClick={onSignaler} ton="neutre" icone={Flag} label="Signaler" />
            <Bouton onClick={onBloquer} ton="neutre" icone={Ban} label="Bloquer" />
          </>
        )}

        {onglet === "envoyees" && d.statut === "refused" && (
          <div className="col-span-2 text-[11px] text-muted-foreground text-center py-2">
            Cette personne n'a pas donné suite.
          </div>
        )}
      </div>
    </motion.div>
  );
}

function Bouton({
  onClick, ton, icone: Icone, label, busy,
}: {
  onClick: () => void;
  ton: "rouge" | "vert" | "doux" | "plein" | "neutre";
  icone: any;
  label: string;
  busy?: boolean;
}) {
  const classes = {
    rouge:  "bg-destructive/10 text-destructive hover:bg-destructive/15",
    vert:   "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15",
    doux:   "bg-primary/10 text-primary hover:bg-primary/15",
    plein:  "bg-primary text-primary-foreground hover:opacity-90",
    neutre: "bg-secondary text-muted-foreground hover:bg-secondary/70",
  }[ton];

  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 ${classes}`}
    >
      <Icone className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

/* ─────────────── États vides ─────────────── */

function Vide({ onglet, filtre }: { onglet: Onglet; filtre: Filtre }) {
  const textes: Record<Onglet, { titre: string; sous: string }> = {
    recues:   { titre: "Aucune demande reçue", sous: "Les nouvelles demandes apparaîtront ici" },
    envoyees: { titre: "Aucune demande envoyée", sous: "Ajoutez un membre depuis son profil" },
    contacts: { titre: "Aucun contact", sous: "Vos demandes acceptées apparaîtront ici" },
  };

  const t = filtre !== "toutes"
    ? { titre: "Rien dans ce filtre", sous: "Essayez « Toutes » pour voir l'ensemble" }
    : textes[onglet];

  const Icone = onglet === "recues" ? Inbox : onglet === "envoyees" ? Send : UserCheck;

  return (
    <div className="mt-4 rounded-2xl bg-card border border-border/60 py-14 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-primary/10 mx-auto flex items-center justify-center">
        <Icone className="w-7 h-7 text-primary" />
      </div>
      <h3 className="font-semibold mt-4">{t.titre}</h3>
      <p className="text-sm text-muted-foreground mt-1">{t.sous}</p>
      <Link
        to="/decouvrir"
        className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/15 transition-colors"
      >
        <Search className="w-4 h-4" /> Découvrir des profils
      </Link>
    </div>
  );
}

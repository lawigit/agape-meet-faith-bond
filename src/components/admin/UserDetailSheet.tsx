import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  X, Loader2, CheckCircle2, Crown, Gem, Wallet, Activity, ShieldAlert,
  LifeBuoy, User, Gift, AlertTriangle, MapPin, Eye, Ban, Heart, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Avatar } from "@/components/app/Avatar";
import {
  fetchUserDetail, grantDays, suspendUser, unsuspendUser, certifyUser,
  OFFER_LABELS, type UserDetail,
} from "@/lib/adminUsers";
import { formatPrice } from "@/lib/plans";
import { displayName } from "@/lib/utils";
import { REPORT_LABELS } from "@/lib/motifs";
import { MARITAL_LABELS, formatHeight } from "@/lib/profilChamps";

/**
 * Fiche membre complète.
 *
 * Instruire un cas obligeait à passer par quatre pages : Utilisateurs pour
 * le profil, Abonnements pour les paiements, Modération pour les
 * signalements, Support pour les tickets. Tout est réuni ici.
 */

const TABS = [
  { key: "profil", label: "Profil", icon: User },
  { key: "abonnement", label: "Abonnement", icon: Wallet },
  { key: "activite", label: "Activité", icon: Activity },
  { key: "moderation", label: "Modération", icon: ShieldAlert },
  { key: "support", label: "Support", icon: LifeBuoy },
] as const;

export function UserDetailSheet({ userId, onClose, onChanged }: {
  userId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [tab, setTab] = useState<string>("profil");
  const [loading, setLoading] = useState(true);
  const [grantOpen, setGrantOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setDetail(await fetchUserDetail(userId));
    setLoading(false);
  };

  useEffect(() => { load(); }, [userId]);

  const p = detail?.profil;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
      />
      <motion.aside
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-background border-l border-border shadow-2xl overflow-y-auto"
      >
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : !detail || !p ? (
          <div className="p-8 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive mx-auto" />
            <p className="mt-3 text-sm">Fiche introuvable. La migration 44 a-t-elle été exécutée ?</p>
            <button onClick={onClose} className="mt-4 px-4 py-2 rounded-xl border border-border text-sm">
              Fermer
            </button>
          </div>
        ) : (
          <>
            {/* En-tête */}
            <div className="sticky top-0 bg-background/95 backdrop-blur border-b border-border z-10">
              <div className="p-5 flex items-start gap-4">
                <Avatar
                  src={p.photos?.[0]}
                  name={p.first_name}
                  rounded="rounded-2xl"
                  className="w-16 h-16 text-xl shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-serif text-xl font-bold truncate">
                      {displayName(p.first_name, p.last_name)}
                    </h2>
                    {p.is_verified && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                    <PlanTag profil={p} />
                  </div>

                  {/* Certifier DEPUIS la fiche, et non depuis la liste.
                      C'est ici qu'on vient de regarder les photos, la
                      cohérence du profil et les signalements reçus :
                      décider ailleurs obligeait à refermer la fiche pour
                      retrouver la ligne, et donc à trancher de mémoire. */}
                  <BoutonCertification
                    verifie={!!p.is_verified}
                    onBascule={async (v) => {
                      const res = await certifyUser(userId, v);
                      if (!res.ok) { toast.error("L'opération a échoué"); return; }
                      toast.success(v ? "Profil certifié" : "Certification retirée");
                      load(); onChanged();
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                    <MapPin className="w-3 h-3" />
                    {[p.city, p.country].filter(Boolean).join(", ") || "Localisation non précisée"}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden max-w-[140px]">
                      <div
                        className={`h-full rounded-full ${p.completion >= 80 ? "bg-emerald-500" : "bg-primary"}`}
                        style={{ width: `${p.completion}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      Profil {p.completion} %
                    </span>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex gap-1 px-5 pb-2 overflow-x-auto scrollbar-none">
                {TABS.map(t => {
                  const alerte =
                    (t.key === "moderation" && detail.moderation.recus.length > 0) ||
                    (t.key === "support" && detail.support.some((s: any) =>
                      s.status === "open" || s.status === "pending"));
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                        tab === t.key
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      <t.icon className="w-3.5 h-3.5" />
                      {t.label}
                      {alerte && <span className="w-1.5 h-1.5 rounded-full bg-destructive" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-5 space-y-5">
              {tab === "profil" && <ProfilTab p={p} />}
              {tab === "abonnement" && (
                <AbonnementTab
                  detail={detail}
                  onGrant={() => setGrantOpen(true)}
                />
              )}
              {tab === "activite" && <ActiviteTab a={detail.activite} />}
              {tab === "moderation" && (
                <ModerationTab
                  m={detail.moderation}
                  suspendedUntil={p.suspended_until}
                  suspensionReason={p.suspension_reason}
                  onSuspend={() => setSuspendOpen(true)}
                  onLift={async () => {
                    if (!confirm("Lever la suspension de ce compte ?")) return;
                    const res = await unsuspendUser(userId);
                    if (!res.ok) { toast.error("L'opération a échoué"); return; }
                    toast.success("Suspension levée");
                    load(); onChanged();
                  }}
                />
              )}
              {tab === "support" && <SupportTab tickets={detail.support} />}
            </div>
          </>
        )}

        {grantOpen && p && (
          <GrantDialog
            userId={userId}
            nom={displayName(p.first_name, p.last_name)}
            onClose={() => setGrantOpen(false)}
            onDone={() => { setGrantOpen(false); load(); onChanged(); }}
          />
        )}

        {suspendOpen && p && (
          <SuspendDialog
            userId={userId}
            nom={displayName(p.first_name, p.last_name)}
            onClose={() => setSuspendOpen(false)}
            onDone={() => { setSuspendOpen(false); load(); onChanged(); }}
          />
        )}
      </motion.aside>
    </>
  );
}

/**
 * Certifier, ou retirer une certification.
 *
 * LE RETRAIT COMPTE AUTANT QUE L'ATTRIBUTION. Sans lui, une certification
 * donnée par erreur — ou un membre honnête devenu problématique — reste
 * affichée pour toujours, et le badge finit par ne plus rien garantir.
 *
 * Le retrait demande confirmation, l'attribution non : l'un enlève une
 * garantie déjà montrée aux autres membres, l'autre s'annule d'un clic.
 */
function BoutonCertification({
  verifie, onBascule,
}: { verifie: boolean; onBascule: (v: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false);

  const agir = async (v: boolean) => {
    if (!v && !confirm(
      "Retirer la certification de ce profil ?\n\n" +
      "Le badge disparaîtra immédiatement pour tous les membres.",
    )) return;

    setBusy(true);
    await onBascule(v);
    setBusy(false);
  };

  if (verifie) {
    return (
      <button
        onClick={() => agir(false)}
        disabled={busy}
        className="mt-2 inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition disabled:opacity-50">
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
        Profil certifié · retirer
      </button>
    );
  }

  return (
    <button
      onClick={() => agir(true)}
      disabled={busy}
      className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-600 text-white hover:opacity-90 transition disabled:opacity-50">
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
      Certifier ce profil
    </button>
  );
}

// ─── Onglets ─────────────────────────────────────────────────────────────────

function ProfilTab({ p }: { p: any }) {
  const age = p.birth_date
    ? new Date().getFullYear() - new Date(p.birth_date).getFullYear()
    : null;

  return (
    <div className="space-y-5">
      {p.photos?.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {p.photos.map((ph: string, i: number) => (
            <img key={i} src={ph} alt="" className="w-20 h-28 rounded-xl object-cover shrink-0" />
          ))}
        </div>
      )}

      {p.bio && (
        <Block title="Bio">
          <p className="text-sm leading-relaxed whitespace-pre-line">{p.bio}</p>
        </Block>
      )}

      <Block title="Identité">
        <Grid rows={[
          ["Âge", age ? `${age} ans` : "—"],
          ["Genre", p.gender === "female" ? "Femme" : p.gender === "male" ? "Homme" : "—"],
          ["Situation", MARITAL_LABELS[p.marital_status] ?? "—"],
          ["Taille", formatHeight(p.height_cm) || "—"],
          ["Études", p.education || "—"],
          ["Inscrit le", new Date(p.created_at).toLocaleDateString("fr-FR")],
        ]} />
      </Block>

      <Block title="Foi">
        <Grid rows={[
          ["Dénomination", p.denomination || "—"],
          ["Pratique", p.practice_level || "—"],
          ["Église", p.church_attendance || "—"],
          ["Intention", p.marriage_intent || "—"],
        ]} />
      </Block>

      {(p.marriage_vision || p.looking_for) && (
        <Block title="Son projet">
          {p.marriage_vision && (
            <div className="mb-3">
              <p className="text-[11px] text-muted-foreground mb-1">Vision du mariage</p>
              <p className="text-sm leading-relaxed">{p.marriage_vision}</p>
            </div>
          )}
          {p.looking_for && (
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Ce qu'il/elle recherche</p>
              <p className="text-sm leading-relaxed">{p.looking_for}</p>
            </div>
          )}
        </Block>
      )}

      {[
        ["Centres d'intérêt", p.interests],
        ["Qualités", p.qualities],
        ["Défauts", p.flaws],
        ["N'accepte pas", p.dealbreakers],
      ].filter(([, v]) => (v as string[])?.length > 0).map(([label, items]) => (
        <Block key={label as string} title={label as string}>
          <div className="flex flex-wrap gap-1.5">
            {(items as string[]).map(t => (
              <span key={t} className="px-2.5 py-1 rounded-full bg-secondary text-xs">{t}</span>
            ))}
          </div>
        </Block>
      ))}

      <Block title="Réglages">
        <Grid rows={[
          ["Visibilité", p.visibility === "pause" ? "En pause"
            : p.visibility === "demande" ? "Sur demande" : "Visible par tous"],
          ["Partage la position", p.share_location ? "Oui" : "Non"],
          ["Dernière activité", p.last_seen
            ? new Date(p.last_seen).toLocaleString("fr-FR") : "Jamais"],
        ]} />
      </Block>
    </div>
  );
}

function AbonnementTab({ detail, onGrant }: { detail: UserDetail; onGrant: () => void }) {
  const p = detail.profil;
  const actif = p.premium_until && new Date(p.premium_until).getTime() > Date.now();

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Offre en cours</p>
            <p className="font-serif text-lg font-bold mt-0.5">
              {p.is_founder ? "VIP — fondateur"
                : actif ? (p.public_plan === "vip" ? "VIP" : "Premium")
                : "Gratuit"}
            </p>
            {actif && !p.is_founder && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Jusqu'au {new Date(p.premium_until).toLocaleDateString("fr-FR")}
              </p>
            )}
          </div>
          <button
            onClick={onGrant}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gold text-gold-foreground text-xs font-semibold"
          >
            <Gift className="w-4 h-4" /> Offrir des jours
          </button>
        </div>
      </div>

      <Block title={`Paiements (${detail.paiements.length})`}>
        {detail.paiements.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun paiement.</p>
        ) : (
          <div className="space-y-2">
            {detail.paiements.map((pay: any) => (
              <div key={pay.id} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {OFFER_LABELS[pay.offer_id] ?? pay.offer_id}
                  </span>
                  <span className="font-semibold tabular-nums">{formatPrice(pay.amount_xof)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-1.5">
                  <PaymentStatus status={pay.status} />
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(pay.completed_at ?? pay.created_at).toLocaleString("fr-FR")}
                  </span>
                </div>
                {pay.sale_id && (
                  <p className="text-[10px] text-muted-foreground mt-1 font-mono">{pay.sale_id}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Block>

      {detail.gestes.length > 0 && (
        <Block title="Jours offerts">
          <div className="space-y-2">
            {detail.gestes.map((g: any, i: number) => (
              <div key={i} className="rounded-xl bg-secondary/50 p-3">
                <p className="text-sm font-medium">{g.days} jour(s)</p>
                <p className="text-xs text-muted-foreground mt-0.5">{g.reason}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {new Date(g.created_at).toLocaleDateString("fr-FR")}
                </p>
              </div>
            ))}
          </div>
        </Block>
      )}
    </div>
  );
}

function ActiviteTab({ a }: { a: Record<string, number> }) {
  const items = [
    { label: "Matchs", value: a.matchs, icon: Heart },
    { label: "Messages envoyés", value: a.messages_envoyes, icon: Activity },
    { label: "Likes donnés", value: a.likes_donnes, icon: Heart },
    { label: "Likes reçus", value: a.likes_recus, icon: Heart },
    { label: "Passes", value: a.passes, icon: X },
    { label: "Publications", value: a.publications, icon: Activity },
    { label: "Visites reçues", value: a.visites_recues, icon: Eye },
    { label: "Boosts utilisés", value: a.boosts, icon: Activity },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map(i => (
        <div key={i.label} className="rounded-xl border border-border p-3.5">
          <i.icon className="w-4 h-4 text-primary" />
          <div className="text-xl font-serif font-bold mt-1.5">{i.value ?? 0}</div>
          <div className="text-[11px] text-muted-foreground">{i.label}</div>
        </div>
      ))}
    </div>
  );
}

function ModerationTab({
  m, suspendedUntil, suspensionReason, onSuspend, onLift,
}: {
  m: UserDetail["moderation"];
  suspendedUntil?: string | null;
  suspensionReason?: string | null;
  onSuspend?: () => void;
  onLift?: () => void;
}) {
  const suspendu = Boolean(suspendedUntil) && new Date(suspendedUntil!).getTime() > Date.now();
  const permanent = suspendu &&
    new Date(suspendedUntil!).getTime() > Date.now() + 10 * 365 * 86400000;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Mini label="Signalé" value={m.recus.length} warn={m.recus.length > 0} />
        <Mini label="A signalé" value={m.emis_n} />
        <Mini label="Bloqué par" value={m.bloque_par_n} warn={m.bloque_par_n >= 3} />
      </div>

      {/* Le blocage est le signal le plus discret : on bloque sans
          signaler. Plusieurs blocages sans aucun signalement révèlent un
          comportement qui n'est jamais remonté. */}
      {m.bloque_par_n >= 3 && m.recus.length === 0 && (
        <div className="rounded-xl border border-gold/50 bg-gold/10 p-3 flex gap-2.5">
          <Ban className="w-4 h-4 text-gold shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed">
            Bloqué par {m.bloque_par_n} membres sans aucun signalement. Un comportement
            problématique passe souvent par là avant d'être formellement signalé.
          </p>
        </div>
      )}

      {onSuspend && (
        <div className="rounded-2xl border border-border p-4">
          {suspendu ? (
            <>
              <p className="text-sm font-semibold text-destructive">Compte suspendu</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {permanent
                  ? "Durée indéterminée."
                  : `Jusqu'au ${new Date(suspendedUntil!).toLocaleDateString("fr-FR")}.`}
                {suspensionReason && ` Motif : ${suspensionReason}`}
              </p>
              <button
                onClick={onLift}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-secondary"
              >
                <ShieldCheck className="w-4 h-4" /> Lever la suspension
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">Sanction</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                La suspension gèle l'accès sans rien détruire : conversations,
                profil et abonnement sont conservés, et elle se lève.
              </p>
              <button
                onClick={onSuspend}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-destructive text-destructive-foreground text-xs font-semibold"
              >
                <ShieldAlert className="w-4 h-4" /> Suspendre ce compte
              </button>
            </>
          )}
        </div>
      )}

      <Block title={`Signalements reçus (${m.recus.length})`}>
        {m.recus.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun signalement.</p>
        ) : (
          <div className="space-y-2">
            {m.recus.map((r: any) => (
              <div key={r.id} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    r.reason === "mineur" || r.reason === "arnaque"
                      ? "bg-destructive/15 text-destructive"
                      : "bg-primary/10 text-primary"
                  }`}>
                    {REPORT_LABELS[r.reason] ?? r.reason ?? "Sans motif"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("fr-FR")}
                  </span>
                </div>
                {r.details && (
                  <p className="text-sm mt-2 rounded-lg bg-secondary/50 p-2 leading-relaxed">
                    « {r.details} »
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground mt-1.5">Statut : {r.status}</p>
              </div>
            ))}
          </div>
        )}
      </Block>
    </div>
  );
}

function SupportTab({ tickets }: { tickets: any[] }) {
  if (tickets.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune demande de support.</p>;
  }
  return (
    <div className="space-y-2">
      {tickets.map(t => (
        <div key={t.id} className="rounded-xl border border-border p-3">
          <p className="text-sm font-medium">{t.subject}</p>
          <div className="flex items-center justify-between gap-2 mt-1.5">
            <span className="text-[11px] text-muted-foreground">{t.category}</span>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
              t.status === "open" ? "bg-destructive/10 text-destructive"
                : t.status === "pending" ? "bg-gold/20 text-gold"
                : "bg-secondary text-muted-foreground"
            }`}>
              {t.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Offrir des jours ────────────────────────────────────────────────────────

function GrantDialog({ userId, nom, onClose, onDone }: {
  userId: string; nom: string; onClose: () => void; onDone: () => void;
}) {
  const [days, setDays] = useState(7);
  const [plan, setPlan] = useState<"premium" | "vip">("premium");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (reason.trim().length < 5) {
      toast.error("Indiquez un motif — il restera au dossier.");
      return;
    }
    setBusy(true);
    const res = await grantDays(userId, days, reason.trim(), plan);
    setBusy(false);

    if (!res.ok) {
      toast.error(
        res.reason === "forbidden" ? "Réservé aux administrateurs"
          : res.reason === "motif" ? "Motif trop court"
          : "L'opération a échoué",
      );
      return;
    }
    toast.success(`${days} jour(s) offerts à ${nom}`);
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-card rounded-2xl p-5 shadow-elegant" onClick={e => e.stopPropagation()}>
        <h3 className="font-serif text-lg font-semibold">Offrir des jours d'accès</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Prolonge la période en cours au lieu de l'écraser : offrir 7 jours à
          quelqu'un qui en a 60 ne lui en retire pas 53.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Offre
            </label>
            <div className="flex gap-2 mt-1.5">
              {(["premium", "vip"] as const).map(pl => (
                <button
                  key={pl}
                  onClick={() => setPlan(pl)}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border ${
                    plan === pl ? "border-primary bg-primary/10 text-primary" : "border-border"
                  }`}
                >
                  {pl === "vip" ? "VIP" : "Premium"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Durée
            </label>
            <div className="flex gap-2 mt-1.5">
              {[7, 15, 30, 90].map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border ${
                    days === d ? "border-primary bg-primary/10 text-primary" : "border-border"
                  }`}
                >
                  {d} j
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Motif
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              placeholder="Paiement débité sans activation, incident du 12/03…"
              className="mt-1.5 w-full px-3 py-2 rounded-xl bg-background border border-border text-sm resize-y"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Conservé au dossier : un accès offert sans trace devient
              indistinguable d'un bug de facturation.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-sm">
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Suspendre ───────────────────────────────────────────────────────────────

function SuspendDialog({ userId, nom, onClose, onDone }: {
  userId: string; nom: string; onClose: () => void; onDone: () => void;
}) {
  const [days, setDays] = useState<number | null>(7);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (reason.trim().length < 10) {
      toast.error("Le motif est communiqué au membre — soyez explicite.");
      return;
    }
    setBusy(true);
    const res = await suspendUser(userId, reason.trim(), days);
    setBusy(false);

    if (!res.ok) {
      toast.error(
        res.reason === "admin_cible" ? "Un administrateur ne peut pas être suspendu"
          : res.reason === "self" ? "Vous ne pouvez pas vous suspendre vous-même"
          : res.reason === "motif" ? "Motif trop court"
          : "L'opération a échoué",
      );
      return;
    }
    toast.success(`${nom} a été suspendu`);
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-card rounded-2xl p-5 shadow-elegant" onClick={e => e.stopPropagation()}>
        <h3 className="font-serif text-lg font-semibold flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-destructive" /> Suspendre {nom}
        </h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          L'accès est gelé, rien n'est détruit. Le profil sort de la découverte
          et le membre ne peut plus écrire, swiper ni publier.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Durée
            </label>
            <div className="grid grid-cols-4 gap-2 mt-1.5">
              {[3, 7, 30].map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`py-2 rounded-xl text-sm font-semibold border ${
                    days === d ? "border-primary bg-primary/10 text-primary" : "border-border"
                  }`}
                >
                  {d} j
                </button>
              ))}
              <button
                onClick={() => setDays(null)}
                className={`py-2 rounded-xl text-xs font-semibold border ${
                  days === null ? "border-destructive bg-destructive/10 text-destructive" : "border-border"
                }`}
              >
                Illimité
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Motif
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="Propos déplacés signalés par plusieurs membres le 12/03…"
              className="mt-1.5 w-full px-3 py-2 rounded-xl bg-background border border-border text-sm resize-y"
            />
            {/* Ce texte s'affiche tel quel au membre suspendu : il doit
                pouvoir comprendre, et le cas échéant contester. */}
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              Ce motif est <strong>affiché au membre</strong>. Une suspension
              muette produit un ticket furieux ; expliquée, une partie des cas
              se règle d'elle-même.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-sm">
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
            Suspendre
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Petits blocs ────────────────────────────────────────────────────────────

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Grid({ rows }: { rows: (string | null)[][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
      {rows.map(([k, v]) => (
        <div key={k as string}>
          <dt className="text-[11px] text-muted-foreground">{k}</dt>
          <dd className="text-sm font-medium">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function Mini({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 text-center ${
      warn ? "border-destructive/40 bg-destructive/5" : "border-border"
    }`}>
      <div className={`text-xl font-serif font-bold ${warn ? "text-destructive" : ""}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function PlanTag({ profil }: { profil: any }) {
  const actif = profil.premium_until && new Date(profil.premium_until).getTime() > Date.now();
  if (profil.is_founder || (actif && profil.public_plan === "vip")) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gold/20 text-gold border border-gold/30 text-[10px] font-bold">
        <Gem className="w-3 h-3" /> VIP
      </span>
    );
  }
  if (actif) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25 text-[10px] font-bold">
        <Crown className="w-3 h-3" /> Premium
      </span>
    );
  }
  return null;
}

function PaymentStatus({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    completed: { label: "Encaissé", cls: "bg-emerald-500/15 text-emerald-600" },
    pending: { label: "En attente", cls: "bg-gold/20 text-gold" },
    failed: { label: "Échoué", cls: "bg-destructive/10 text-destructive" },
    refunded: { label: "Remboursé", cls: "bg-secondary text-muted-foreground" },
  };
  const s = map[status] ?? { label: status, cls: "bg-secondary text-muted-foreground" };
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.cls}`}>{s.label}</span>;
}

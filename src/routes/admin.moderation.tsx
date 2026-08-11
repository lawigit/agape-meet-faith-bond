import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ShieldCheck, ShieldX, AlertTriangle, RefreshCw, Ban, Inbox,
  LogOut, ChevronRight, ArrowLeft, Heart, Wallet, CalendarClock,
} from "lucide-react";
import { toast } from "sonner";
import { REPORT_LABELS, DELETION_LABELS } from "@/lib/motifs";
import { FileVerification } from "@/components/admin/FileVerification";

export const Route = createFileRoute("/admin/moderation")({
  component: AdminModeration,
});

/**
 * Signalements réels, lus dans `reports` (migration 16).
 *
 * Cette page affichait quatre signalements inventés — « Marie L. a signalé
 * Paul K. » — pendant que les vrais s'accumulaient sans être vus. Une file
 * de modération fictive est pire qu'absente : elle donne le sentiment que
 * la surveillance est assurée.
 */

type Report = {
  id: string;
  reporter_id: string;
  reported_id: string;
  context: string;
  reason: string | null;
  details: string | null;
  status: string;
  created_at: string;
};

type Departure = {
  id: string;
  motif: string;
  details: string | null;
  jours_actif: number | null;
  avait_paye: boolean;
  pays: string | null;
  genre: string | null;
  nb_matchs: number;
  nb_messages: number;
  created_at: string;
};

type Departures = {
  total: number;
  total_30d: number;
  succes: number;
  payants_perdus: number;
  jours_actif_median: number | null;
  par_motif: { motif: string; n: number; payants: number; jours_moyen: number | null }[];
  recents: Departure[];
};

const CONTEXT_LABELS: Record<string, string> = {
  profile: "Profil",
  message: "Conversation",
  community_post: "Publication",
  call: "Appel",
};

function AdminModeration() {
  const [reports, setReports] = useState<Report[]>([]);
  const [names, setNames] = useState<Map<string, { name: string; photo: string | null }>>(new Map());
  const [blockCount, setBlockCount] = useState<number | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [view, setView] = useState<"signalements" | "departs" | "verification">("signalements");
  // Compté à part : ce nombre décide si la file mérite qu'on l'ouvre.
  const [aVerifier, setAVerifier] = useState<number | null>(null);
  const [departures, setDepartures] = useState<Departures | null>(null);
  const [loadingDepartures, setLoadingDepartures] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from("reports")
      .select("id, reporter_id, reported_id, context, reason, details, status, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (err) {
      console.error("[admin/moderation]", err);
      setError("Lecture impossible. La migration 31 a-t-elle été exécutée, et votre compte a-t-il le rôle admin ?");
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as Report[];
    setReports(rows);

    const ids = [...new Set(rows.flatMap(r => [r.reporter_id, r.reported_id]))];
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles").select("id, first_name, photos").in("id", ids);
      setNames(new Map((profiles ?? []).map((p: any) => [
        p.id, { name: p.first_name || "Membre", photo: p.photos?.[0] ?? null },
      ])));
    }

    // Les blocages entre membres complètent le tableau : un profil beaucoup
    // bloqué mérite l'attention même sans signalement formel.
    const { count } = await supabase
      .from("blocks").select("id", { count: "exact", head: true });
    setBlockCount(count ?? 0);

    // `head: true` : on ne veut que le nombre, aucune ligne ne remonte.
    const { count: nonVerifies } = await supabase
      .from("profiles").select("id", { count: "exact", head: true })
      .eq("is_verified", false);
    setAVerifier(nonVerifies ?? 0);

    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setStatus = async (id: string, status: "reviewed" | "dismissed" | "actioned") => {
    const previous = reports;
    setReports(prev => prev.map(r => (r.id === id ? { ...r, status } : r)));

    const { error: err } = await supabase.from("reports").update({ status }).eq("id", id);

    if (err) {
      console.error("[admin/moderation] mise à jour:", err);
      setReports(previous);
      toast.error("Le statut n'a pas pu être enregistré");
      return;
    }
    toast.success(
      status === "actioned" ? "Signalement traité — sanction appliquée"
      : status === "dismissed" ? "Signalement écarté"
      : "Signalement marqué comme examiné",
    );
  };

  const loadDepartures = async () => {
    setLoadingDepartures(true);
    const { data, error: err } = await supabase.rpc("admin_departures", { p_limit: 100 });
    if (err || (data as any)?.error) {
      console.error("[admin/départs]", err ?? data);
      toast.error("Lecture impossible. La migration 38 a-t-elle été exécutée ?");
    } else {
      setDepartures(data as Departures);
    }
    setLoadingDepartures(false);
  };

  const visible = filter === "pending" ? reports.filter(r => r.status === "pending") : reports;
  const pendingCount = reports.filter(r => r.status === "pending").length;

  // ── Vue « Vérification » ────────────────────────────────────
  if (view === "verification") {
    // `load()` au retour : le compteur doit refléter les profils
    // certifiés pendant la session, sinon le bandeau ment.
    return <FileVerification onBack={() => { setView("signalements"); load(); }} />;
  }

  // ── Vue « Départs » ─────────────────────────────────────────
  if (view === "departs") {
    return (
      <DeparturesView
        data={departures}
        loading={loadingDepartures}
        onBack={() => setView("signalements")}
        onRefresh={loadDepartures}
      />
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold">Modération</h1>
          <p className="text-muted-foreground mt-1">
            Signalements envoyés par les membres depuis l'application.
          </p>
        </div>
        <button
          onClick={load}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card text-sm hover:bg-secondary"
        >
          <RefreshCw className="w-4 h-4" /> Actualiser
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={AlertTriangle} label="En attente de traitement" value={String(pendingCount)}
              warn={pendingCount > 0} />
        <Stat icon={Inbox} label="Signalements reçus" value={String(reports.length)} />
        <Stat icon={Ban} label="Blocages entre membres" value={blockCount === null ? "…" : String(blockCount)} />
      </div>

      {/* La vérification est un acte de modération, pas d'administration :
          on regarde des photos, on juge une déclaration, et l'on accorde
          un badge que les autres membres liront comme une garantie. */}
      <button
        onClick={() => setView("verification")}
        className="w-full rounded-2xl border border-border bg-card p-4 flex items-center justify-between gap-3 hover:bg-secondary/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
          <div>
            <p className="font-semibold text-sm">Vérification des profils</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {aVerifier === null
                ? "Chargement…"
                : aVerifier === 0
                  ? "Aucun profil en attente."
                  : `${aVerifier} profil${aVerifier > 1 ? "s" : ""} en attente de certification.`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!!aVerifier && (
            <span className="text-[11px] font-semibold bg-primary text-primary-foreground rounded-full px-2 py-0.5 tabular-nums">
              {aVerifier}
            </span>
          )}
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </div>
      </button>

      {/* Les départs relèvent de la même page : un membre qui part après une
          mauvaise expérience est le prolongement d'un signalement mal traité. */}
      <button
        onClick={() => { setView("departs"); loadDepartures(); }}
        className="w-full rounded-2xl border border-border bg-card p-4 flex items-center justify-between gap-3 hover:bg-secondary/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <LogOut className="w-5 h-5 text-primary shrink-0" />
          <div>
            <p className="font-semibold text-sm">Comptes supprimés et motifs de départ</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pourquoi vos membres s'en vont — et ce qui peut se corriger.
            </p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
      </button>

      <div className="flex gap-2">
        {([["pending", "À traiter"], ["all", "Tous"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filter === k ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-secondary/70"
            }`}
          >
            {label}{k === "pending" && pendingCount > 0 && ` · ${pendingCount}`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-secondary animate-pulse" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center">
          <ShieldCheck className="w-10 h-10 text-emerald-500 mx-auto" />
          <p className="text-sm text-muted-foreground mt-3">
            {filter === "pending"
              ? "Aucun signalement en attente. Tout est traité."
              : "Aucun signalement à ce jour."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(r => {
            const reported = names.get(r.reported_id);
            const reporter = names.get(r.reporter_id);

            return (
              <div key={r.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  {reported?.photo ? (
                    <img src={reported.photo} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center font-serif font-semibold shrink-0">
                      {(reported?.name ?? "?").charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{reported?.name ?? "Membre supprimé"}</span>
                      <span className="px-2 py-0.5 rounded-full bg-secondary text-[10px] font-semibold">
                        {CONTEXT_LABELS[r.context] ?? r.context}
                      </span>
                      <StatusPill status={r.status} />
                    </div>

                    {/* Le motif codé se lit en clair, et le texte libre du
                        signalant apparaît sous lui : c'est là que se trouve
                        le détail qui permet de trancher. */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {r.reason ? (
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          r.reason === "mineur" || r.reason === "arnaque"
                            ? "bg-destructive/15 text-destructive"
                            : "bg-primary/10 text-primary"
                        }`}>
                          {REPORT_LABELS[r.reason] ?? r.reason}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">
                          Aucun motif — signalement antérieur à la mise à jour
                        </span>
                      )}
                    </div>

                    {r.details && (
                      <p className="text-sm mt-2 rounded-xl bg-secondary/50 p-2.5 leading-relaxed">
                        « {r.details} »
                      </p>
                    )}

                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      Signalé par {reporter?.name ?? "un membre"} ·{" "}
                      {new Date(r.created_at).toLocaleDateString("fr-FR", {
                        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>

                {r.status === "pending" && (
                  <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/60">
                    <button
                      onClick={() => setStatus(r.id, "actioned")}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20"
                    >
                      <ShieldX className="w-3.5 h-3.5" /> Sanctionner
                    </button>
                    <button
                      onClick={() => setStatus(r.id, "reviewed")}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-xs font-semibold hover:bg-secondary/70"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" /> Examiné
                    </button>
                    <button
                      onClick={() => setStatus(r.id, "dismissed")}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-xs font-semibold hover:bg-secondary/70"
                    >
                      Écarter
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground leading-relaxed">
        « Sanctionner » marque le signalement comme traité. La suspension effective
        du compte se fait depuis la page Utilisateurs — les deux actions sont
        volontairement séparées, pour qu'aucune sanction ne soit appliquée par
        simple réflexe depuis cette file.
      </p>
    </div>
  );
}

/**
 * Motifs de départ.
 *
 * Un départ « j'ai rencontré quelqu'un » est un succès, pas une perte. Les
 * additionner dans un taux d'attrition unique donnerait une lecture fausse
 * de la santé de la plateforme — c'est pourquoi ils sont comptés à part.
 */
function DeparturesView({ data, loading, onBack, onRefresh }: {
  data: Departures | null; loading: boolean; onBack: () => void; onRefresh: () => void;
}) {
  const maxMotif = Math.max(...(data?.par_motif ?? []).map(m => m.n), 1);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="w-4 h-4" /> Modération
          </button>
          <h1 className="text-3xl font-serif font-bold">Départs</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Le motif est recueilli au moment de la suppression. Il n'existe
            nulle part ailleurs : le compte, lui, a disparu.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card text-sm hover:bg-secondary"
        >
          <RefreshCw className="w-4 h-4" /> Actualiser
        </button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-secondary animate-pulse" />)}
        </div>
      ) : !data || data.total === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center">
          <ShieldCheck className="w-10 h-10 text-emerald-500 mx-auto" />
          <p className="text-sm text-muted-foreground mt-3">
            Aucun compte supprimé à ce jour.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={LogOut} label="Départs (30 jours)" value={String(data.total_30d)} />
            <Stat icon={Heart} label="Ont rencontré quelqu'un" value={String(data.succes)} />
            <Stat icon={Wallet} label="Abonnés perdus" value={String(data.payants_perdus)}
                  warn={data.payants_perdus > 0} />
            <Stat icon={CalendarClock} label="Durée de vie médiane"
                  value={data.jours_actif_median != null ? `${data.jours_actif_median} j` : "—"} />
          </div>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-serif text-lg font-semibold">Motifs</h2>
            <p className="text-xs text-muted-foreground mt-1">
              La colonne « abonnés » compte ceux qui avaient payé : ce sont
              les départs les plus coûteux, et souvent les plus évitables.
            </p>

            <div className="mt-5 space-y-3">
              {data.par_motif.map(m => (
                <div key={m.motif}>
                  <div className="flex items-baseline justify-between text-sm gap-3">
                    <span className={m.motif === "trouve_partenaire" ? "text-emerald-600 font-medium" : ""}>
                      {DELETION_LABELS[m.motif] ?? m.motif}
                    </span>
                    <span className="tabular-nums shrink-0">
                      <strong>{m.n}</strong>
                      {m.payants > 0 && (
                        <span className="text-muted-foreground text-xs ml-2">
                          dont {m.payants} abonné{m.payants > 1 ? "s" : ""}
                        </span>
                      )}
                      {m.jours_moyen != null && (
                        <span className="text-muted-foreground text-xs ml-2">· {m.jours_moyen} j</span>
                      )}
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        m.motif === "trouve_partenaire" ? "bg-emerald-500" : "bg-primary"
                      }`}
                      style={{ width: `${(m.n / maxMotif) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-serif text-lg font-semibold">Départs récents</h2>
            </div>
            <div className="divide-y divide-border">
              {data.recents.map(d => (
                <div key={d.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      d.motif === "trouve_partenaire"
                        ? "bg-emerald-500/15 text-emerald-600"
                        : d.motif === "mauvaise_experience"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-secondary text-muted-foreground"
                    }`}>
                      {DELETION_LABELS[d.motif] ?? d.motif}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(d.created_at).toLocaleDateString("fr-FR", {
                        day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  </div>

                  {d.details && (
                    <p className="text-sm mt-2 rounded-xl bg-secondary/50 p-2.5 leading-relaxed">
                      « {d.details} »
                    </p>
                  )}

                  <p className="text-[11px] text-muted-foreground mt-2">
                    {d.jours_actif != null && `${d.jours_actif} jour(s) sur la plateforme`}
                    {d.avait_paye && " · avait payé"}
                    {d.pays && ` · ${d.pays}`}
                    {` · ${d.nb_matchs} match(s), ${d.nb_messages} message(s)`}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, warn }: {
  icon: any; label: string; value: string; warn?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${warn ? "border-gold/50 bg-gold/5" : "border-border bg-card"}`}>
      <Icon className={`w-5 h-5 ${warn ? "text-gold" : "text-primary"}`} />
      <div className="text-2xl font-serif font-bold mt-2">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "À traiter", cls: "bg-gold/20 text-gold-foreground" },
    reviewed: { label: "Examiné", cls: "bg-secondary text-muted-foreground" },
    dismissed: { label: "Écarté", cls: "bg-secondary text-muted-foreground" },
    actioned: { label: "Sanctionné", cls: "bg-destructive/10 text-destructive" },
  };
  const s = map[status] ?? { label: status, cls: "bg-secondary text-muted-foreground" };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.cls}`}>{s.label}</span>;
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { OngletsEquipe } from "@/components/admin/OngletsEquipe";
import {
  LifeBuoy, Send, AlertTriangle, Loader2, RefreshCw, Clock,
  CheckCircle2, Inbox, ArrowLeft, Timer,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth";

export const Route = createFileRoute("/admin/support")({
  component: AdminSupport,
});

type Ticket = {
  id: string;
  user_id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  first_reply_at: string | null;
};

type Msg = {
  id: string;
  author_id: string | null;
  is_staff: boolean;
  body: string;
  created_at: string;
};

type Stats = {
  open: number; pending: number; resolved: number; closed: number; total: number;
  avg_first_reply_hours: number | null;
  unanswered_over_24h: number;
  by_category: Record<string, number>;
};

const STATUS = {
  open: { label: "À traiter", cls: "bg-destructive/10 text-destructive" },
  pending: { label: "En attente du membre", cls: "bg-gold/20 text-gold" },
  resolved: { label: "Résolu", cls: "bg-emerald-500/15 text-emerald-600" },
  closed: { label: "Clos", cls: "bg-secondary text-muted-foreground" },
} as const;

const FILTERS = [
  { key: "open", label: "À traiter" },
  { key: "pending", label: "En attente" },
  { key: "resolved", label: "Résolus" },
  { key: "closed", label: "Clos" },
  { key: "all", label: "Tous" },
] as const;

function AdminSupport() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<string>("open");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);

    let query = supabase
      .from("support_tickets")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(100);

    if (filter !== "all") query = query.eq("status", filter);

    const [{ data: s, error: sErr }, { data: t, error: tErr }] = await Promise.all([
      supabase.rpc("admin_support_stats"),
      query,
    ]);

    if (sErr || tErr || (s as any)?.error) {
      console.error("[admin/support]", sErr ?? tErr ?? s);
      setError("Lecture impossible. La migration 34 a-t-elle été exécutée ?");
      setLoading(false);
      return;
    }

    setStats(s as Stats);
    const rows = (t ?? []) as Ticket[];
    setTickets(rows);

    // Les prénoms sont chargés à part : `support_tickets` n'a pas de clé
    // étrangère exploitable par PostgREST vers `profiles` dans ce sens.
    const ids = [...new Set(rows.map(r => r.user_id))];
    if (ids.length) {
      const { data: p } = await supabase.from("profiles").select("id, first_name").in("id", ids);
      const map: Record<string, string> = {};
      (p ?? []).forEach((x: any) => { map[x.id] = x.first_name ?? "Membre"; });
      setNames(map);
    }

    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const openTicket = async (t: Ticket) => {
    setSelected(t);
    setMessages([]);
    const { data, error: err } = await supabase
      .from("support_messages")
      .select("*")
      .eq("ticket_id", t.id)
      .order("created_at", { ascending: true });

    if (err) {
      toast.error("Impossible de charger la conversation");
      return;
    }
    setMessages((data ?? []) as Msg[]);
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    setSending(true);
    try {
      const userId = await getCurrentUserId();
      const { error: err } = await supabase.from("support_messages").insert({
        ticket_id: selected.id,
        author_id: userId,
        body: reply.trim(),
        // `is_staff` est écrasé par un trigger : la valeur envoyée ici
        // n'a aucune autorité, et c'est voulu.
      });
      if (err) throw err;

      setReply("");
      await openTicket(selected);
      await load();
      toast.success("Réponse envoyée");
    } catch (e: any) {
      console.error(e);
      toast.error("L'envoi a échoué");
    } finally {
      setSending(false);
    }
  };

  const setStatus = async (status: string) => {
    if (!selected) return;
    const patch: any = { status, updated_at: new Date().toISOString() };
    if (status === "closed") patch.closed_at = new Date().toISOString();

    const { error: err } = await supabase
      .from("support_tickets").update(patch).eq("id", selected.id);

    if (err) {
      toast.error("Changement de statut impossible");
      return;
    }
    setSelected({ ...selected, status });
    load();
    toast.success(`Ticket marqué « ${STATUS[status as keyof typeof STATUS]?.label ?? status} »`);
  };

  const setPriority = async (priority: string) => {
    if (!selected) return;
    const { error: err } = await supabase
      .from("support_tickets").update({ priority }).eq("id", selected.id);
    if (err) { toast.error("Changement impossible"); return; }
    setSelected({ ...selected, priority });
    load();
  };

  // ── Vue conversation ───────────────────────────────────────
  if (selected) {
    return (
      <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
        <button
          onClick={() => { setSelected(null); setReply(""); }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Retour à la liste
        </button>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-serif font-bold">{selected.subject}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {names[selected.user_id] ?? "Membre"} · {selected.category} ·
                ouvert le {new Date(selected.created_at).toLocaleDateString("fr-FR", {
                  day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit",
                })}
              </p>
            </div>
            <StatusPill status={selected.status} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <select
              value={selected.priority}
              onChange={e => setPriority(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-background border border-border text-sm"
            >
              <option value="basse">Priorité basse</option>
              <option value="normal">Priorité normale</option>
              <option value="haute">Priorité haute</option>
            </select>

            {selected.status !== "resolved" && (
              <button
                onClick={() => setStatus("resolved")}
                className="px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-secondary transition-colors"
              >
                Marquer résolu
              </button>
            )}
            {selected.status !== "closed" && (
              <button
                onClick={() => setStatus("closed")}
                className="px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-secondary transition-colors"
              >
                Clore
              </button>
            )}
            {selected.status === "closed" && (
              <button
                onClick={() => setStatus("open")}
                className="px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-secondary transition-colors"
              >
                Rouvrir
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.is_staff ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                m.is_staff
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-card border border-border rounded-bl-md"
              }`}>
                <p className="text-[11px] font-semibold opacity-70 mb-1">
                  {m.is_staff ? "AgapeMeet" : names[selected.user_id] ?? "Membre"}
                </p>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.body}</p>
                <p className="text-[10px] opacity-60 mt-1.5">
                  {new Date(m.created_at).toLocaleString("fr-FR", {
                    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>

        {selected.status === "closed" ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Ce ticket est clos. Rouvrez-le pour pouvoir répondre.
          </p>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-4 sticky bottom-4">
            <textarea
              value={reply}
              onChange={e => setReply(e.target.value)}
              rows={3}
              placeholder="Votre réponse…"
              className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={sendReply}
                disabled={sending || !reply.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-soft disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Répondre
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Vue liste ──────────────────────────────────────────────
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <OngletsEquipe />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-serif font-bold">Support</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Les demandes ouvertes par vos membres depuis la page d'aide.
          </p>
        </div>
        <button
          onClick={load}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card text-sm hover:bg-secondary transition-colors"
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

      {stats && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={Inbox} label="À traiter" value={String(stats.open)} warn={stats.open > 0} />
            <Stat icon={Clock} label="En attente du membre" value={String(stats.pending)} />
            <Stat
              icon={Timer} label="Délai moyen de 1ʳᵉ réponse"
              value={stats.avg_first_reply_hours != null ? `${stats.avg_first_reply_hours} h` : "—"}
            />
            <Stat icon={CheckCircle2} label="Résolus" value={String(stats.resolved)}
                  hint={`${stats.total} au total`} />
          </div>

          {stats.unanswered_over_24h > 0 && (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm leading-relaxed">
                <strong>{stats.unanswered_over_24h}</strong> demande(s) attendent une première
                réponse depuis plus de 24 heures. Sur une application payante, c'est le
                délai au-delà duquel un membre demande le remboursement plutôt qu'une aide.
              </p>
            </div>
          )}
        </>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border hover:bg-secondary"
            }`}
          >
            {f.label}
            {f.key === "open" && stats && stats.open > 0 && (
              <span className="ml-1.5 text-xs opacity-80">({stats.open})</span>
            )}
          </button>
        ))}
      </div>

      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-secondary animate-pulse" />)}
          </div>
        ) : tickets.length === 0 ? (
          <div className="p-10 text-center">
            <LifeBuoy className="w-10 h-10 text-muted-foreground/40 mx-auto" />
            <p className="mt-3 text-sm text-muted-foreground">
              Aucune demande dans cette catégorie.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tickets.map(t => (
              <button
                key={t.id}
                onClick={() => openTicket(t)}
                className="w-full text-left px-5 py-3.5 hover:bg-secondary/50 transition-colors flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {t.priority === "haute" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                    )}
                    <span className="font-medium text-sm truncate">{t.subject}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {names[t.user_id] ?? "Membre"} · {t.category} ·{" "}
                    {new Date(t.updated_at).toLocaleDateString("fr-FR", {
                      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                    })}
                  </div>
                </div>
                <StatusPill status={t.status} />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = STATUS[status as keyof typeof STATUS] ?? { label: status, cls: "bg-secondary text-muted-foreground" };
  return (
    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${s.cls}`}>
      {s.label}
    </span>
  );
}

function Stat({ icon: Icon, label, value, hint, warn }: {
  icon: any; label: string; value: string; hint?: string; warn?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${warn ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"}`}>
      <Icon className={`w-5 h-5 ${warn ? "text-destructive" : "text-primary"}`} />
      <div className="text-2xl font-serif font-bold mt-2">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

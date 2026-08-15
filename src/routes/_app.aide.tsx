import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LifeBuoy, Send, Loader2, ArrowLeft, Plus, MessageCircle, HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth";
import { SupportContactBlock } from "@/components/SupportContact";

export const Route = createFileRoute("/_app/aide")({
  component: AidePage,
});

type Ticket = {
  id: string;
  subject: string;
  category: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type Msg = {
  id: string;
  is_staff: boolean;
  body: string;
  created_at: string;
};

const CATEGORIES = [
  { key: "compte", label: "Mon compte" },
  { key: "paiement", label: "Paiement et abonnement" },
  { key: "technique", label: "Problème technique" },
  { key: "signalement", label: "Signaler un comportement" },
  { key: "suggestion", label: "Suggestion" },
  { key: "autre", label: "Autre" },
];

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  open: { label: "En cours de traitement", cls: "bg-gold/20 text-gold" },
  pending: { label: "Réponse reçue", cls: "bg-primary/15 text-primary" },
  resolved: { label: "Résolu", cls: "bg-emerald-500/15 text-emerald-600" },
  closed: { label: "Clos", cls: "bg-secondary text-muted-foreground" },
};

function AidePage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("autre");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data, error } = await supabase
      .from("support_tickets")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("[aide]", error);
      toast.error("Impossible de charger vos demandes");
    }
    setTickets((data ?? []) as Ticket[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openTicket = async (t: Ticket) => {
    setSelected(t);
    setComposing(false);
    const { data } = await supabase
      .from("support_messages")
      .select("id, is_staff, body, created_at")
      .eq("ticket_id", t.id)
      .order("created_at", { ascending: true });
    setMessages((data ?? []) as Msg[]);
  };

  const create = async () => {
    if (subject.trim().length < 3 || body.trim().length < 10) {
      toast.error("Précisez un objet et décrivez votre demande");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("open_support_ticket", {
        p_subject: subject.trim(),
        p_body: body.trim(),
        p_category: category,
      });
      if (error) throw error;

      toast.success("Votre demande a été envoyée", {
        description: "Nous vous répondons dans les meilleurs délais.",
      });
      setSubject(""); setBody(""); setCategory("autre");
      setComposing(false);
      await load();

      if (data) {
        const fresh = await supabase.from("support_tickets").select("*").eq("id", data).single();
        if (fresh.data) openTicket(fresh.data as Ticket);
      }
    } catch (e: any) {
      const hint = e?.hint || e?.message || "";
      toast.error(
        hint.includes("5 demandes")
          ? "Vous avez déjà 5 demandes en cours. Poursuivez dans l'une d'elles."
          : "L'envoi a échoué. Réessayez dans un instant.",
      );
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!selected || !reply.trim()) return;
    setBusy(true);
    try {
      const userId = await getCurrentUserId();
      const { error } = await supabase.from("support_messages").insert({
        ticket_id: selected.id,
        author_id: userId,
        body: reply.trim(),
      });
      if (error) throw error;
      setReply("");
      await openTicket(selected);
      await load();
    } catch {
      toast.error("Impossible d'envoyer votre message");
    } finally {
      setBusy(false);
    }
  };

  // ── Conversation ───────────────────────────────────────────
  if (selected) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <button
          onClick={() => setSelected(null)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Mes demandes
        </button>

        <div>
          <h1 className="text-xl font-serif font-bold">{selected.subject}</h1>
          <div className="flex items-center gap-2 mt-2">
            <StatusPill status={selected.status} />
            <span className="text-xs text-muted-foreground">
              {new Date(selected.created_at).toLocaleDateString("fr-FR", {
                day: "2-digit", month: "long",
              })}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.is_staff ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                m.is_staff
                  ? "bg-card border border-border rounded-bl-md"
                  : "bg-primary text-primary-foreground rounded-br-md"
              }`}>
                {m.is_staff && (
                  <p className="text-[11px] font-semibold text-primary mb-1">Équipe AgapeMeet</p>
                )}
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
            Cette demande est close. Ouvrez-en une nouvelle si besoin.
          </p>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-3">
            <textarea
              value={reply}
              onChange={e => setReply(e.target.value)}
              rows={3}
              placeholder="Votre message…"
              className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={send}
                disabled={busy || !reply.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Envoyer
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Liste et création ──────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold flex items-center gap-2">
          <LifeBuoy className="w-6 h-6 text-primary" /> Aide et support
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Une question, un souci de paiement, un comportement à signaler ?
          Écrivez-nous, une personne vous répondra.
        </p>
      </div>

      <Link
        to="/faq"
        className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:bg-secondary/50 transition-colors"
      >
        <HelpCircle className="w-5 h-5 text-primary shrink-0" />
        <div className="min-w-0">
          <p className="font-medium text-sm">Questions fréquentes</p>
          <p className="text-xs text-muted-foreground">
            La réponse s'y trouve souvent, et immédiatement.
          </p>
        </div>
      </Link>

      <SupportContactBlock
        title="Nous joindre directement"
        description="Pour une réponse rapide, WhatsApp est le canal le plus direct."
        message="Bonjour, j'ai besoin d'aide sur AgapeMeet."
        subject="Demande d'aide — AgapeMeet"
        compact
      />

      {composing ? (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <h2 className="font-serif font-semibold">Nouvelle demande</h2>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sujet
            </label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm"
            >
              {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Objet
            </label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              maxLength={120}
              placeholder="En quelques mots"
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Votre message
            </label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={6}
              placeholder="Décrivez votre situation. Plus vous êtes précis, plus notre réponse sera utile."
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setComposing(false)}
              className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary"
            >
              Annuler
            </button>
            <button
              onClick={create}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Envoyer
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setComposing(true)}
          className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold shadow-soft"
        >
          <Plus className="w-4 h-4" /> Nouvelle demande
        </button>
      )}

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Mes demandes
        </h2>

        {loading ? (
          <div className="mt-3 space-y-2">
            {[...Array(2)].map((_, i) => <div key={i} className="h-16 rounded-2xl bg-secondary animate-pulse" />)}
          </div>
        ) : tickets.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-border p-8 text-center">
            <MessageCircle className="w-8 h-8 text-muted-foreground/40 mx-auto" />
            <p className="mt-2 text-sm text-muted-foreground">
              Vous n'avez encore ouvert aucune demande.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {tickets.map(t => (
              <button
                key={t.id}
                onClick={() => openTicket(t)}
                className="w-full text-left rounded-2xl border border-border bg-card p-4 hover:bg-secondary/50 transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{t.subject}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(t.updated_at).toLocaleDateString("fr-FR", {
                      day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                </div>
                <StatusPill status={t.status} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? { label: status, cls: "bg-secondary text-muted-foreground" };
  return (
    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap shrink-0 ${s.cls}`}>
      {s.label}
    </span>
  );
}

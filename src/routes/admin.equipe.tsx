import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { OngletsEquipe } from "@/components/admin/OngletsEquipe";
import {
  UsersRound, Search, Shield, Loader2, AlertTriangle, RefreshCw,
  Check, UserPlus, X, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/app/Avatar";
import { supabase } from "@/lib/supabase";
import {
  ROLE_LABELS, ROLE_DESCRIPTIONS, PERMISSION_LABELS,
  type Role, type Permission,
} from "@/lib/permissions";

export const Route = createFileRoute("/admin/equipe")({
  component: AdminEquipe,
});

/**
 * Composition de l'équipe.
 *
 * Jusqu'ici il n'existait que deux états : membre, ou administrateur
 * tout-puissant. Confier la modération à quelqu'un revenait à lui donner
 * les réglages, les revenus, et le pouvoir de nommer d'autres
 * administrateurs.
 */

const ROLES: Exclude<Role, "member">[] = ["redacteur", "support", "moderator", "admin"];

type Membre = {
  id: string; nom: string; role: Role; photo: string | null;
  created_at: string; last_seen: string | null;
  permissions: Permission[]; consultations: number;
};

function AdminEquipe() {
  const [equipe, setEquipe] = useState<Membre[]>([]);
  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data, error: err } = await supabase.rpc("admin_team");
    if (err || (data as any)?.error) {
      setError("Lecture impossible. La migration 51 a-t-elle été exécutée, et avez-vous le rôle administrateur ?");
      setLoading(false);
      return;
    }
    setEquipe(((data as any).membres ?? []) as Membre[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Recherche temporisée : sans cela, chaque frappe interrogerait toute
  // la base des membres.
  useEffect(() => {
    if (recherche.trim().length < 2) { setResultats([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("admin_search_member", { p_query: recherche.trim() });
      setResultats((data ?? []) as any[]);
    }, 350);
    return () => clearTimeout(t);
  }, [recherche]);

  const attribuer = async (userId: string, role: Role, nom: string) => {
    if (role === "admin" && !confirm(
      `Nommer ${nom} administrateur ?\n\n` +
      `Il aura accès à TOUT : réglages, revenus, conversations, et pourra ` +
      `nommer d'autres administrateurs.`,
    )) return;

    setBusy(userId);
    const { data, error: err } = await supabase.rpc("admin_set_role", {
      p_user_id: userId, p_role: role,
    });
    setBusy(null);

    const res = data as any;
    if (err || !res?.ok) {
      toast.error(
        res?.reason === "soi_meme" ? "Vous ne pouvez pas modifier votre propre rôle"
          : res?.reason === "dernier_admin" ? "Impossible : c'est le dernier administrateur"
          : res?.reason === "forbidden" ? "Réservé aux administrateurs"
          : "L'opération a échoué",
      );
      return;
    }

    toast.success(
      role === "member"
        ? `${nom} a été retiré de l'équipe`
        : `${nom} est désormais ${ROLE_LABELS[role].toLowerCase()}`,
    );
    setRecherche("");
    setResultats([]);
    load();
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <OngletsEquipe />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-serif font-bold">Équipe</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Qui accède à quoi. Les droits sont vérifiés en base, pas seulement
            dans le menu.
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

      {/* ── Ajouter quelqu'un ─────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-serif text-lg font-semibold flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-primary" /> Ajouter à l'équipe
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Cherchez un membre existant. On ne crée pas de compte d'équipe :
          la personne doit d'abord s'être inscrite normalement.
        </p>

        <div className="relative mt-3">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            placeholder="Prénom, nom ou ville…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {resultats.length > 0 && (
          <div className="mt-3 space-y-2">
            {resultats.map(m => (
              <div key={m.id} className="rounded-xl border border-border p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar src={m.photo} name={m.nom} className="w-9 h-9 text-sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{m.nom}</p>
                    <p className="text-[11px] text-muted-foreground">{m.ville || "—"}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ROLES.filter(r => r !== "admin").map(r => (
                    <button
                      key={r}
                      onClick={() => attribuer(m.id, r, m.nom)}
                      disabled={busy === m.id}
                      className="px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold hover:border-primary/50 hover:text-primary disabled:opacity-50"
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {recherche.trim().length >= 2 && resultats.length === 0 && (
          <p className="text-xs text-muted-foreground mt-3">
            Aucun membre trouvé — ou il fait déjà partie de l'équipe.
          </p>
        )}
      </section>

      {/* ── L'équipe ──────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Membres de l'équipe ({equipe.length})
        </h2>

        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-secondary animate-pulse" />)}
          </div>
        ) : equipe.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-14 text-center">
            <UsersRound className="w-10 h-10 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground mt-3">
              Vous êtes seul aux commandes.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {equipe.map(m => (
              <div key={m.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar src={m.photo} name={m.nom} className="w-11 h-11 text-base" />
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{m.nom}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {m.last_seen
                          ? `Vu ${new Date(m.last_seen).toLocaleDateString("fr-FR")}`
                          : "Jamais connecté"}
                        {/* Une équipe se pilote sur ce qui est fait, pas sur
                            les rôles attribués. */}
                        {m.consultations > 0 && ` · ${m.consultations} consultation(s)`}
                      </p>
                    </div>
                  </div>

                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 ${
                    m.role === "admin" ? "bg-gold/20 text-gold"
                      : m.role === "moderator" ? "bg-destructive/10 text-destructive"
                      : m.role === "support" ? "bg-primary/15 text-primary"
                      : "bg-secondary text-muted-foreground"
                  }`}>
                    <Shield className="w-3 h-3" /> {ROLE_LABELS[m.role]}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-3">
                  {m.permissions.map(p => (
                    <span key={p} className="px-2 py-0.5 rounded-full bg-secondary text-[10px] font-medium">
                      {PERMISSION_LABELS[p] ?? p}
                    </span>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-border/60">
                  <span className="text-[11px] text-muted-foreground mr-1">Changer :</span>
                  {ROLES.filter(r => r !== m.role).map(r => (
                    <button
                      key={r}
                      onClick={() => attribuer(m.id, r, m.nom)}
                      disabled={busy === m.id}
                      className="px-2.5 py-1 rounded-lg border border-border text-[11px] font-semibold hover:border-primary/50 hover:text-primary disabled:opacity-50"
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      if (confirm(`Retirer ${m.nom} de l'équipe ? Il redevient un membre ordinaire.`)) {
                        attribuer(m.id, "member", m.nom);
                      }
                    }}
                    disabled={busy === m.id}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    {busy === m.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                    Retirer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Ce que chaque rôle permet ─────────────────────────── */}
      <section className="rounded-2xl border border-border bg-secondary/40 p-5">
        <h2 className="font-serif text-lg font-semibold">Ce que chaque rôle permet</h2>
        <div className="mt-4 space-y-3">
          {ROLES.map(r => (
            <div key={r}>
              <p className="text-sm font-semibold">{ROLE_LABELS[r]}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {ROLE_DESCRIPTIONS[r]}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-border/60 flex gap-2.5">
          <Eye className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Chaque changement de rôle est inscrit au journal, comme les
            consultations de conversations. Vous ne pouvez pas modifier votre
            propre rôle, ni retirer le dernier administrateur — sans quoi
            plus personne ne pourrait rétablir la situation.
          </p>
        </div>
      </section>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { supabase } from "@/lib/supabase";
import {
  Search, CheckCircle2, Trash2, Shield, MoreVertical, Crown, User,
  Filter, Gem, Users, AlertTriangle, RefreshCw, Clock, Download,
  Eye, Ban, Activity, Wallet, Percent, UserCheck, X, LifeBuoy, Pause, ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/app/Avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatPrice } from "@/lib/plans";
import { displayName } from "@/lib/utils";
import {
  DEFAULT_FILTERS, PAGE_SIZE, SEGMENTS, OFFER_LABELS,
  fetchCounts, fetchUsers, downloadCsv, isSuspended, unsuspendUser, certifyUser,
  type Counts, type Filters, type UserRow,
} from "@/lib/adminUsers";
import { UserDetailSheet } from "@/components/admin/UserDetailSheet";

export const Route = createFileRoute("/admin/utilisateurs")({
  component: AdminUtilisateurs,
});

/**
 * Membres, répartis par offre et par segment.
 *
 * Cette page affichait des effectifs INVENTÉS — `premium: 1840`,
 * `vip: 350`, puis `Math.floor(total * 0.15)` — et attribuait les badges
 * selon la position dans la liste : `i % 7 === 0` pour Premium. Le nombre
 * de matchs venait d'un `Math.random()`.
 *
 * Tout vient désormais de la base, et le filtrage s'y fait aussi : filtrer
 * les 50 lignes chargées reproduirait le défaut corrigé sur la découverte.
 */

const PLANS = [
  { key: "all", label: "Tous", icon: Users },
  { key: "gratuit", label: "Gratuit", icon: User },
  { key: "premium", label: "Premium", icon: Crown },
  { key: "vip", label: "VIP", icon: Gem },
] as const;

function AdminUtilisateurs() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [f, setF] = useState<Filters>(DEFAULT_FILTERS);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    const [c, { rows, error: err }] = await Promise.all([fetchCounts(), fetchUsers(f)]);

    if (err || !c) {
      setError("Lecture impossible. Les migrations 43 et 44 ont-elles été exécutées ?");
      setLoading(false);
      return;
    }

    setCounts(c);
    setUsers(rows);
    setLoading(false);
  };

  // La recherche est temporisée : sans cela, chaque frappe déclencherait
  // une requête et la liste sauterait à chaque lettre.
  useEffect(() => {
    const t = setTimeout(load, f.search ? 350 : 0);
    return () => clearTimeout(t);
  }, [f]);

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    // Toute modification de critère ramène à la première page : rester en
    // page 4 d'un filtre qui n'en compte qu'une afficherait un vide trompeur.
    setF(prev => ({ ...prev, [key]: value, ...(key === "page" ? {} : { page: 0 }) }));

  const total = Number(users[0]?.total_count ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const actifs = [f.segment, f.gender, f.country, f.verified].filter(v => v !== null).length;

  const verifyUser = async (id: string) => {
    // L'état local n'est mis à jour QU'APRÈS confirmation par la base.
    // L'inverse affichait un badge sur un profil resté non certifié.
    const res = await certifyUser(id, true);
    if (!res.ok) { toast.error("La certification a échoué"); return; }
    setUsers(prev => prev.map(u => (u.id === id ? { ...u, is_verified: true } : u)));
    toast.success("Profil certifié");
  };

  const deleteUser = async (id: string, name: string) => {
    if (!confirm(`Supprimer définitivement le profil de ${name} ? Ses messages, matchs et publications disparaîtront avec lui.`)) return;
    const { error: err } = await supabase.from("profiles").delete().eq("id", id);
    if (err) { toast.error("La suppression a échoué"); return; }
    setUsers(prev => prev.filter(u => u.id !== id));
    toast.success("Profil supprimé");
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold">Utilisateurs</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Composition de la base, économie et signaux de modération.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (users.length === 0) { toast.error("Rien à exporter"); return; }
              downloadCsv(users, `agapemeet-${f.plan}${f.segment ? `-${f.segment}` : ""}`);
              toast.success(`${users.length} ligne(s) exportée(s)`);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card text-sm hover:bg-secondary transition-colors"
          >
            <Download className="w-4 h-4" /> Exporter
          </button>
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card text-sm hover:bg-secondary transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Actualiser
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* ── Composition ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Users} label="Membres inscrits" value={counts?.total}
             hint={counts ? `+${counts.nouveaux_7j} sur 7 jours` : undefined} />
        <GenderKpi counts={counts} />
        <Kpi icon={Activity} label="Actifs sur 7 jours" value={counts?.actifs_7j} tone="primary"
             hint={counts && counts.total > 0
               ? `${Math.round((counts.actifs_7j / counts.total) * 100)} % · ${counts.actifs_30j} sur 30 j`
               : undefined} />
        <Kpi icon={UserCheck} label="Profils vérifiés" value={counts?.verifies}
             hint={counts ? `${counts.non_verifies} en attente` : undefined} />
      </div>

      {/* ── Économie ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Percent} label="Taux de conversion"
             valueText={counts ? `${counts.taux_conversion} %` : undefined}
             hint={counts ? `${counts.payants} membre(s) ont payé` : undefined} tone="primary" />
        <Kpi icon={Wallet} label="Revenu par payant"
             valueText={counts ? formatPrice(counts.revenu_par_payant) : undefined}
             hint={counts ? `${formatPrice(counts.ca_total)} encaissés` : undefined} tone="gold" />
        <Kpi icon={Clock} label="Expire sous 7 jours" value={counts?.expire_7j}
             tone={counts && counts.expire_7j > 0 ? "gold" : undefined} />
        <Kpi icon={Ban} label="Abonnements expirés" value={counts?.expires}
             hint="Ont déjà payé une fois" />
      </div>

      {/* ── Onglets par offre ─────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {PLANS.map(p => {
          const n = !counts ? null
            : p.key === "all" ? counts.total
            : p.key === "gratuit" ? counts.gratuit
            : p.key === "premium" ? counts.premium
            : counts.vip;
          return (
            <button
              key={p.key}
              onClick={() => set("plan", p.key)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                f.plan === p.key
                  ? "bg-primary text-primary-foreground shadow-soft"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <p.icon className="w-4 h-4" />
              {p.label}
              {n !== null && <span className="opacity-75">({n})</span>}
            </button>
          );
        })}
      </div>

      {/* ── Segments transversaux ─────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Segments
          </span>
          {actifs > 0 && (
            <button
              onClick={() => setF(prev => ({
                ...prev, segment: null, gender: null, country: null, verified: null, page: 0,
              }))}
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <X className="w-3 h-3" /> Tout effacer
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {SEGMENTS.map(s => {
            const n = s.countKey && counts ? (counts as any)[s.countKey] : null;
            const on = f.segment === s.key;
            return (
              <button
                key={s.key}
                onClick={() => set("segment", on ? null : s.key)}
                title={s.hint}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  on
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                {s.label}
                {n !== null && <span className="ml-1 opacity-75">({n})</span>}
              </button>
            );
          })}

          <span className="w-px bg-border mx-1" />

          {([["female", "Femmes"], ["male", "Hommes"]] as const).map(([g, label]) => (
            <button
              key={g}
              onClick={() => set("gender", f.gender === g ? null : g)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                f.gender === g
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {label}
            </button>
          ))}

          <button
            onClick={() => set("verified", f.verified === false ? null : false)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              f.verified === false
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            Non vérifiés
          </button>
        </div>
      </div>

      {/* ── Recherche ─────────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Rechercher par prénom, nom, ville ou pays…"
          value={f.search}
          onChange={e => set("search", e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* ── Tableau ───────────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[1080px]">
            <thead className="bg-secondary/40 border-b border-border/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="px-5 py-4">Membre</th>
                <th className="px-5 py-4">Profil</th>
                <th className="px-5 py-4">Offre</th>
                <th className="px-5 py-4">Paiements</th>
                <th className="px-5 py-4">Engagement</th>
                <th className="px-5 py-4">Signaux</th>
                <th className="px-5 py-4">Activité</th>
                <th className="px-5 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {loading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-5 py-5"><div className="h-5 bg-secondary animate-pulse rounded-md" /></td>
                    ))}
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16">
                    <Filter className="w-10 h-10 mb-3 opacity-20 mx-auto" />
                    <p className="text-base font-medium">Aucun membre</p>
                    <p className="text-xs mt-1 text-muted-foreground">
                      {f.search || actifs > 0
                        ? "Aucun résultat pour ces critères."
                        : "Cette offre ne compte aucun membre."}
                    </p>
                  </td>
                </tr>
              ) : (
                users.map(u => (
                  <tr
                    key={u.id}
                    onClick={() => setDetailId(u.id)}
                    className="hover:bg-secondary/30 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          <Avatar
                            src={u.photos?.[0]}
                            name={u.first_name}
                            className="w-11 h-11 text-sm border-2 border-background shadow-sm"
                          />
                          {u.is_verified && (
                            <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-background rounded-full flex items-center justify-center">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold truncate">
                            {displayName(u.first_name, u.last_name)}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {[u.city, u.country].filter(Boolean).join(", ") || "—"}
                            {u.gender && ` · ${u.gender === "female" ? "F" : "H"}`}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <CompletionCell pct={u.completion} />
                      {u.visibility !== "tous" && (
                        <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full bg-secondary text-[10px] font-semibold">
                          {u.visibility === "pause" ? <Pause className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                          {u.visibility === "pause" ? "En pause" : "Sur demande"}
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-4"><PlanCell user={u} /></td>

                    <td className="px-5 py-4">
                      {u.nb_paiements > 0 ? (
                        <>
                          <div className="font-semibold tabular-nums">{formatPrice(u.total_paye)}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {u.derniere_offre ? OFFER_LABELS[u.derniere_offre] ?? u.derniere_offre : ""}
                            {u.dernier_paiement && ` · ${depuis(u.dernier_paiement)}`}
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">Jamais payé</span>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <div className="text-xs space-y-0.5 tabular-nums">
                        <div><strong>{u.nb_matchs}</strong> <span className="text-muted-foreground">matchs</span></div>
                        <div><strong>{u.nb_messages}</strong> <span className="text-muted-foreground">messages</span></div>
                        <div className="text-muted-foreground">
                          {u.nb_likes_donnes} donnés · {u.nb_likes_recus} reçus
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {u.nb_signalements > 0 && (
                          <Signal icon={AlertTriangle} n={u.nb_signalements} label="signalement" danger />
                        )}
                        {/* Le blocage est le signal le plus discret : on
                            bloque sans signaler. */}
                        {u.nb_blocages > 0 && (
                          <Signal icon={Ban} n={u.nb_blocages} label="blocage" danger={u.nb_blocages >= 3} />
                        )}
                        {u.nb_tickets > 0 && (
                          <Signal icon={LifeBuoy} n={u.nb_tickets} label="ticket" />
                        )}
                        {isSuspended(u) && (
                          <span
                            title={u.suspension_reason ?? "Compte suspendu"}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold"
                          >
                            <ShieldAlert className="w-3 h-3" /> Suspendu
                          </span>
                        )}
                        {u.nb_signalements === 0 && u.nb_blocages === 0 && u.nb_tickets === 0
                          && !isSuspended(u) && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="text-sm">{u.last_seen ? depuis(u.last_seen) : "Jamais vu"}</div>
                      <div className="text-[11px] text-muted-foreground">
                        Inscrit {depuis(u.created_at)}
                      </div>
                    </td>

                    <td className="px-5 py-4 text-right" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-2 rounded-xl hover:bg-secondary text-muted-foreground transition-colors">
                            <MoreVertical className="w-5 h-5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52 rounded-xl p-1">
                          <DropdownMenuLabel className="text-xs text-muted-foreground">
                            Actions sur le profil
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDetailId(u.id)}
                            className="cursor-pointer gap-2 py-2 rounded-lg"
                          >
                            <Eye className="w-4 h-4" /> Ouvrir la fiche
                          </DropdownMenuItem>
                          {!u.is_verified && (
                            <DropdownMenuItem
                              onClick={() => verifyUser(u.id)}
                              className="cursor-pointer gap-2 py-2 rounded-lg text-emerald-600 focus:bg-emerald-500/10 focus:text-emerald-600"
                            >
                              <CheckCircle2 className="w-4 h-4" /> Certifier le profil
                            </DropdownMenuItem>
                          )}
                          {/* La suspension passe par la fiche : elle exige un
                              motif, affiché au membre. Un raccourci sans
                              explication produirait des sanctions muettes. */}
                          {isSuspended(u) ? (
                            <DropdownMenuItem
                              onClick={async () => {
                                if (!confirm(`Lever la suspension de ${u.first_name} ?`)) return;
                                const res = await unsuspendUser(u.id);
                                if (!res.ok) { toast.error("L'opération a échoué"); return; }
                                toast.success("Suspension levée");
                                load();
                              }}
                              className="cursor-pointer gap-2 py-2 rounded-lg"
                            >
                              <Shield className="w-4 h-4" /> Lever la suspension
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => setDetailId(u.id)}
                              className="cursor-pointer gap-2 py-2 rounded-lg text-amber-600 focus:bg-amber-500/10 focus:text-amber-600"
                            >
                              <ShieldAlert className="w-4 h-4" /> Suspendre…
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => deleteUser(u.id, u.first_name)}
                            className="cursor-pointer gap-2 py-2 rounded-lg text-destructive focus:bg-destructive/10 focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" /> Supprimer définitivement
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-border/50 bg-secondary/20 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            {total > 0
              ? `${f.page * PAGE_SIZE + 1}–${Math.min((f.page + 1) * PAGE_SIZE, total)} sur ${total}`
              : "Aucun résultat"}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => set("page", Math.max(0, f.page - 1))}
              disabled={f.page === 0}
              className="px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-secondary disabled:opacity-40"
            >
              Précédent
            </button>
            <span>Page {f.page + 1} / {pages}</span>
            <button
              onClick={() => set("page", f.page + 1)}
              disabled={f.page + 1 >= pages}
              className="px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-secondary disabled:opacity-40"
            >
              Suivant
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {detailId && (
          <UserDetailSheet
            userId={detailId}
            onClose={() => setDetailId(null)}
            onChanged={load}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Cellules ────────────────────────────────────────────────────────────────

function depuis(d: string): string {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 30) return `il y a ${days} j`;
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`;
  return `il y a ${Math.floor(days / 365)} an(s)`;
}

function CompletionCell({ pct }: { pct: number }) {
  const couleur = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-primary" : "bg-destructive";
  return (
    <div className="flex items-center gap-2">
      <div className="w-14 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full rounded-full ${couleur}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${pct < 50 ? "text-destructive" : ""}`}>
        {pct} %
      </span>
    </div>
  );
}

function Signal({ icon: Icon, n, label, danger }: {
  icon: any; n: number; label: string; danger?: boolean;
}) {
  return (
    <span
      title={`${n} ${label}${n > 1 ? "s" : ""}`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
        danger ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"
      }`}
    >
      <Icon className="w-3 h-3" /> {n}
    </span>
  );
}

function PlanCell({ user }: { user: UserRow }) {
  const actif = user.premium_until ? new Date(user.premium_until).getTime() > Date.now() : false;

  if (user.is_founder) {
    return (
      <div>
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gold/20 text-gold border border-gold/30 text-[10px] font-bold">
          <Gem className="w-3 h-3" /> VIP
        </span>
        <div className="text-[11px] text-muted-foreground mt-1">Fondateur · à vie</div>
      </div>
    );
  }

  if (!actif) {
    return (
      <div>
        <span className="text-xs text-muted-foreground">Gratuit</span>
        {user.premium_until && (
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Expiré {depuis(user.premium_until)}
          </div>
        )}
      </div>
    );
  }

  const vip = user.public_plan === "vip";
  const jours = Math.ceil((new Date(user.premium_until!).getTime() - Date.now()) / 86400000);
  return (
    <div>
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-bold ${
        vip ? "bg-gold/20 text-gold border-gold/30" : "bg-primary/15 text-primary border-primary/25"
      }`}>
        {vip ? <Gem className="w-3 h-3" /> : <Crown className="w-3 h-3" />}
        {vip ? "VIP" : "Premium"}
      </span>
      <div className={`text-[11px] mt-1 ${jours <= 7 ? "text-gold font-medium" : "text-muted-foreground"}`}>
        {jours} jour{jours > 1 ? "s" : ""} restant{jours > 1 ? "s" : ""}
      </div>
    </div>
  );
}

// ─── Cartes ──────────────────────────────────────────────────────────────────

/**
 * Ratio femmes / hommes.
 *
 * C'est l'indicateur le plus déterminant d'une application de rencontre :
 * un déséquilibre ruine l'expérience du côté majoritaire — plus personne
 * ne reçoit de réponse, donc plus personne ne reste — bien avant que le
 * chiffre d'affaires ne bouge.
 */
function GenderKpi({ counts }: { counts: Counts | null }) {
  const connus = counts ? counts.femmes + counts.hommes : 0;
  const pctF = connus > 0 ? Math.round((counts!.femmes / connus) * 100) : 0;
  const pctH = 100 - pctF;
  // Au-delà de 70/30, l'expérience se dégrade nettement du côté majoritaire.
  const desequilibre = connus > 0 && (pctF >= 70 || pctH >= 70);

  return (
    <div className={`p-5 rounded-2xl shadow-sm border ${
      desequilibre ? "border-gold/50 bg-gold/5" : "border-border/50 bg-card"
    }`}>
      <div className="flex items-center gap-2">
        <Users className={`w-5 h-5 ${desequilibre ? "text-gold" : "text-primary"}`} />
        <span className="text-xs text-muted-foreground">Femmes / Hommes</span>
      </div>

      {!counts ? (
        <div className="text-2xl font-bold font-serif mt-2">—</div>
      ) : connus === 0 ? (
        <div className="text-sm text-muted-foreground mt-2">Genre non renseigné</div>
      ) : (
        <>
          <div className="text-2xl font-bold font-serif mt-2 tabular-nums">
            {pctF} % / {pctH} %
          </div>
          <div className="mt-2 h-2 rounded-full overflow-hidden flex">
            <div className="bg-primary" style={{ width: `${pctF}%` }} />
            <div className="bg-gold" style={{ width: `${pctH}%` }} />
          </div>
          <div className="text-[11px] text-muted-foreground mt-1.5">
            {counts.femmes} femmes · {counts.hommes} hommes
            {counts.genre_absent > 0 && ` · ${counts.genre_absent} non précisé`}
          </div>
          {desequilibre && (
            <p className="text-[11px] text-gold mt-1.5 leading-snug">
              Déséquilibre marqué : le côté majoritaire reçoit peu de réponses.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, valueText, hint, tone }: {
  icon: any; label: string; value?: number; valueText?: string;
  hint?: string; tone?: "primary" | "gold";
}) {
  const cls = tone === "gold" ? "bg-gold/10 text-gold"
    : tone === "primary" ? "bg-primary/10 text-primary"
    : "bg-secondary text-muted-foreground";
  return (
    <div className="bg-card border border-border/50 p-5 rounded-2xl shadow-sm flex items-center gap-4">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${cls}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold font-serif truncate">
          {valueText ?? value ?? "—"}
        </div>
        <div className="text-xs text-muted-foreground">{label}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{hint}</div>}
      </div>
    </div>
  );
}

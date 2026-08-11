import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Gift, AlertTriangle, Users, Wallet, Check, X,
  Power, Search, Copy, Ban,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { invalidateSettings } from "@/lib/appSettings";
import { formatPrice } from "@/lib/plans";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/parrainage")({
  head: () => ({ meta: [{ title: "Parrainage — Administration" }] }),
  component: AdminAffiliation,
});

type Parrain = {
  user_id: string; nom: string; code: string;
  active: boolean; filleuls: number; gains: number; du: number;
};
type Retrait = {
  id: string; nom: string; montant: number; numero: string;
  statut: string; demande_le: string; paye_le: string | null;
};
type Donnees = {
  actif: boolean; mode: string; taux: number; seuil: number;
  maturation_jours: number;
  nb_parrains: number; nb_filleuls: number;
  du_total: number; paye_total: number;
  parrains: Parrain[]; retraits: Retrait[];
};

function AdminAffiliation() {
  const [d, setD] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<any[]>([]);

  async function charger() {
    const { data, error } = await supabase.rpc("admin_affiliation");
    if (error || (data as any)?.error) {
      console.error("[admin/parrainage]", error ?? data);
      setErreur(true);
      return;
    }
    setErreur(false);
    setD(data as Donnees);
  }

  useEffect(() => { charger(); }, []);

  /** Écrit un réglage puis vide le cache, sinon l'application continue
   *  de servir l'ancienne valeur jusqu'au prochain rechargement. */
  async function reglage(key: string, value: any) {
    const { error } = await supabase
      .from("app_settings")
      .update({ value, updated_at: new Date().toISOString() })
      .eq("key", key);

    if (error) { toast.error("Enregistrement impossible"); return; }
    invalidateSettings();
    toast.success("Enregistré");
    charger();
  }

  async function chercher(q: string) {
    setRecherche(q);
    if (q.trim().length < 2) { setResultats([]); return; }

    const { data } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
      .limit(8);

    setResultats(data ?? []);
  }

  async function definirParrain(userId: string, active: boolean) {
    const { data, error } = await supabase.rpc("admin_definir_parrain", {
      p_user: userId, p_active: active,
    });
    if (error || (data as any)?.error) { toast.error("Action impossible"); return; }
    toast.success(active ? `Code ${(data as any).code} attribué` : "Code désactivé");
    setRecherche(""); setResultats([]);
    charger();
  }

  async function traiterRetrait(id: string, statut: "payee" | "refusee") {
    const libelle = statut === "payee"
      ? "Confirmez-vous avoir ENVOYÉ l'argent par Mobile Money ?"
      : "Refuser cette demande ? Les gains redeviendront disponibles.";
    if (!confirm(libelle)) return;

    const { data, error } = await supabase.rpc("admin_payer_retrait", {
      p_payout: id, p_statut: statut, p_note: null,
    });
    if (error || !(data as any)?.ok) { toast.error("Action impossible"); return; }
    toast.success(statut === "payee" ? "Marqué comme payé" : "Demande refusée");
    charger();
  }

  if (erreur) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-gold shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          Module indisponible. La migration <code>67_parrainage.sql</code> a-t-elle été exécutée ?
        </p>
      </div>
    );
  }

  if (!d) return <div className="h-64 rounded-2xl bg-secondary animate-pulse" />;

  const enAttente = d.retraits.filter(r => r.statut === "demande");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-serif font-bold flex items-center gap-2">
          <Gift className="w-5 h-5 text-gold" /> Parrainage
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          {d.taux} % versés à vie sur les abonnements des filleuls.
        </p>
      </div>

      {/* ── L'interrupteur ── */}
      <section className={`rounded-2xl border p-5 ${d.actif ? "border-emerald-500/40 bg-emerald-500/5" : "border-border bg-card"}`}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Power className={`w-5 h-5 ${d.actif ? "text-emerald-600" : "text-muted-foreground"}`} />
            <div>
              <div className="font-semibold">
                {d.actif ? "Programme actif" : "Programme désactivé"}
              </div>
              <div className="text-xs text-muted-foreground">
                {d.actif
                  ? "Les commissions sont générées à chaque abonnement encaissé."
                  : "Rien ne s'affiche côté membre, aucune commission n'est créée."}
              </div>
            </div>
          </div>
          <button
            onClick={() => reglage("affiliation_active", !d.actif)}
            className={`rounded-xl px-5 py-2.5 font-semibold text-sm transition ${
              d.actif ? "bg-secondary hover:bg-secondary/70"
                      : "bg-emerald-600 text-white hover:opacity-90"}`}>
            {d.actif ? "Désactiver" : "Activer"}
          </button>
        </div>
      </section>

      {/* ── Réglages ── */}
      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-semibold text-sm">Réglages</h2>

        <div>
          <label className="text-xs text-muted-foreground">Mode d'accès</label>
          <div className="mt-2 grid sm:grid-cols-2 gap-2">
            {[
              { v: "invitation", t: "Sur invitation", d: "Vous désignez chaque parrain" },
              { v: "tous", t: "Ouvert à tous", d: "Chaque membre obtient son lien" },
            ].map(o => (
              <button key={o.v}
                onClick={() => reglage("affiliation_mode", o.v)}
                className={`text-left rounded-xl border p-3 transition ${
                  d.mode === o.v ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"}`}>
                <div className="text-sm font-medium">{o.t}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{o.d}</div>
              </button>
            ))}
          </div>
          {/* Le risque du mode ouvert n'est pas théorique : il est écrit
              là où la décision se prend. */}
          {d.mode === "tous" && (
            <p className="text-[11px] text-gold mt-2 leading-relaxed">
              En mode ouvert, un membre peut créer un second compte et
              s'inscrire par son propre lien pour toucher {d.taux} % à vie
              sur un abonnement qu'il aurait payé de toute façon. Le mode
              sur invitation est la seule protection réelle.
            </p>
          )}
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <Champ label="Taux (%)" value={d.taux}
                 onSave={v => reglage("affiliation_taux", v)} />
          <Champ label="Seuil de retrait (F)" value={d.seuil}
                 onSave={v => reglage("affiliation_seuil", v)} />
          <Champ label="Maturation (jours)" value={d.maturation_jours}
                 onSave={v => reglage("affiliation_maturation_jours", v)} />
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Changer le taux n'affecte que les commissions <strong>futures</strong> :
          celles déjà générées conservent le taux appliqué au moment de
          l'encaissement.
        </p>
      </section>

      {/* ── Chiffres ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Petite v={String(d.nb_parrains)} l="Parrains actifs" />
        <Petite v={String(d.nb_filleuls)} l="Filleuls rattachés" />
        <Petite v={formatPrice(d.du_total)} l="Restant dû" alerte={d.du_total > 0} />
        <Petite v={formatPrice(d.paye_total)} l="Déjà versé" />
      </div>

      {/* ── Retraits à traiter ── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Wallet className="w-4 h-4 text-primary" />
          Demandes de retrait
          {enAttente.length > 0 && (
            <span className="text-[11px] bg-gold text-background rounded-full px-2 py-0.5">
              {enAttente.length}
            </span>
          )}
        </h2>

        {d.retraits.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-3">Aucune demande.</p>
        ) : (
          <div className="mt-3 divide-y divide-border/60">
            {d.retraits.map(r => (
              <div key={r.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm font-medium">{r.nom}</div>
                  <div className="text-[11px] text-muted-foreground">
                    <button
                      onClick={() => { navigator.clipboard.writeText(r.numero); toast.success("Numéro copié"); }}
                      className="inline-flex items-center gap-1 hover:text-foreground transition">
                      {r.numero} <Copy className="w-3 h-3" />
                    </button>
                    {" · "}{new Date(r.demande_le).toLocaleDateString("fr-FR")}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums">{formatPrice(r.montant)}</span>
                  {r.statut === "demande" ? (
                    <>
                      <button onClick={() => traiterRetrait(r.id, "payee")}
                              className="p-2 rounded-lg bg-emerald-600 text-white hover:opacity-90 transition"
                              title="Marquer comme payé">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => traiterRetrait(r.id, "refusee")}
                              className="p-2 rounded-lg bg-secondary hover:bg-secondary/70 transition"
                              title="Refuser">
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <span className={`text-[11px] px-2 py-1 rounded-full ${
                      r.statut === "payee" ? "bg-emerald-500/10 text-emerald-600"
                                           : "bg-secondary text-muted-foreground"}`}>
                      {r.statut === "payee" ? "Payé" : "Refusé"}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
          Les versements sont manuels : envoyez l'argent par Mobile Money,
          puis cochez ici. Rien n'est payé automatiquement — un calcul
          erroné qui verse tout seul coûterait bien plus qu'un virement
          fait à la main.
        </p>
      </section>

      {/* ── Désigner un parrain ── */}
      {d.mode === "invitation" && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold text-sm">Désigner un parrain</h2>
          <div className="mt-3 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={recherche}
              onChange={e => chercher(e.target.value)}
              placeholder="Rechercher un membre…"
              className="w-full rounded-xl border border-border bg-background pl-9 pr-4 py-2.5 text-sm"
            />
          </div>

          {resultats.length > 0 && (
            <div className="mt-2 divide-y divide-border/60 rounded-xl border border-border">
              {resultats.map(u => (
                <div key={u.id} className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-sm">{u.first_name} {u.last_name}</span>
                  <button onClick={() => definirParrain(u.id, true)}
                          className="text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 font-medium">
                    Nommer parrain
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Les parrains ── */}
      <section className="rounded-2xl border border-border bg-card overflow-x-auto">
        <div className="p-5 pb-3">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" /> Parrains
          </h2>
        </div>

        {d.parrains.length === 0 ? (
          <p className="text-sm text-muted-foreground px-5 pb-5">Aucun parrain pour l'instant.</p>
        ) : (
          <table className="w-full text-sm min-w-[36rem]">
            <thead>
              <tr className="border-y border-border">
                {["Membre", "Code", "Filleuls", "Gains", "Dû", ""].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.parrains.map(p => (
                <tr key={p.user_id} className={`border-b border-border/60 last:border-0 ${p.active ? "" : "opacity-45"}`}>
                  <td className="px-4 py-3 font-medium">{p.nom}</td>
                  <td className="px-4 py-3"><code className="tracking-widest">{p.code}</code></td>
                  <td className="px-4 py-3 tabular-nums">{p.filleuls}</td>
                  <td className="px-4 py-3 tabular-nums">{formatPrice(p.gains)}</td>
                  <td className="px-4 py-3 tabular-nums font-semibold">{formatPrice(p.du)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => definirParrain(p.user_id, !p.active)}
                      className="p-1.5 rounded-lg hover:bg-secondary transition"
                      title={p.active ? "Désactiver le code" : "Réactiver le code"}>
                      {p.active ? <Ban className="w-4 h-4 text-muted-foreground" />
                                : <Check className="w-4 h-4 text-emerald-600" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="text-[11px] text-muted-foreground px-5 py-4 leading-relaxed">
          Désactiver un code arrête les commissions <strong>futures</strong>.
          Celles déjà acquises restent dues — elles ont été gagnées.
        </p>
      </section>
    </div>
  );
}

/** Champ numérique qui n'enregistre qu'à la validation, jamais à la frappe. */
function Champ({ label, value, onSave }: { label: string; value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => { setV(String(value)); }, [value]);

  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="mt-1.5 flex gap-2">
        <input
          value={v}
          onChange={e => setV(e.target.value)}
          inputMode="numeric"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm tabular-nums"
        />
        {v !== String(value) && (
          <button
            onClick={() => { const n = Number(v); if (Number.isFinite(n) && n >= 0) onSave(n); }}
            className="rounded-xl bg-primary text-primary-foreground px-3 text-sm font-medium">
            OK
          </button>
        )}
      </div>
    </div>
  );
}

function Petite({ v, l, alerte }: { v: string; l: string; alerte?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${alerte ? "border-gold/40 bg-gold/5" : "border-border bg-card"}`}>
      <div className="text-xl font-serif font-bold tabular-nums">{v}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{l}</div>
    </div>
  );
}

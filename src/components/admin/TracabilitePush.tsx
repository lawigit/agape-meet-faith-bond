import { useEffect, useState } from "react";
import {
  BellRing, AlertTriangle, MousePointerClick, Smartphone, BellOff, Info,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

/**
 * Traçabilité des notifications push.
 *
 * CE QU'ON NE PEUT PAS MESURER, ET POURQUOI ON NE FEINT PAS.
 *
 * Une notification push n'a pas de « taux d'ouverture ». Le pixel
 * invisible d'un e-mail n'existe pas ici : l'appareil affiche la
 * notification sans rien nous dire. Seul le CLIC est mesurable — et
 * c'est de toute façon le seul indicateur utile, une notification vue et
 * ignorée n'ayant rien produit.
 *
 * LE CHIFFRE À REGARDER EN PREMIER N'EST PAS LE NOMBRE D'ENVOIS, mais le
 * nombre de membres JOIGNABLES. Douze notifications envoyées n'ont pas
 * le même sens selon qu'on peut en toucher quinze ou trois mille.
 */

type Modele = { modele: string; envoyes: number; cliques: number; dernier: string };

type Donnees = {
  periode_jours: number;
  envoyes: number; cliques: number;
  joignables: number; appareils: number; refus: number;
  modeles: Modele[];
  textes: { modele: string; titre: string; corps: string; url: string; actif: boolean }[];
  courbe: { jour: string; envoyes: number; cliques: number }[];
  recents: { prenom: string; modele: string; envoye_le: string; clique_le: string | null }[];
};

const LIBELLES: Record<string, string> = {
  premium: "Passer Premium",
  reveil: "Réveil d'inactif",
  profil: "Profil incomplet",
  demarrage: "Commencer à chercher",
  communaute: "Communauté",
  boost: "Boost",
};

function pct(n: number, base: number) {
  return base > 0 ? Math.round((n / base) * 100) : 0;
}

function quand(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export function TracabilitePush({ days }: { days: number }) {
  const [d, setD] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let annule = false;
    supabase.rpc("admin_push", { p_days: days }).then(({ data, error }: any) => {
      if (annule) return;
      if (error || data?.error) { console.error("[admin/push]", error ?? data); setErreur(true); return; }
      setErreur(false);
      setD(data as Donnees);
    });
    return () => { annule = true; };
  }, [days]);

  if (erreur) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-gold shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          Traçabilité push indisponible. Les migrations <code>73</code> et{" "}
          <code>74_tracabilite_push.sql</code> ont-elles été exécutées ?
        </p>
      </section>
    );
  }

  if (!d) return <div className="h-64 rounded-2xl bg-secondary animate-pulse" />;

  const maxJour = Math.max(1, ...d.courbe.map(c => c.envoyes));

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-serif font-semibold flex items-center gap-2">
          <BellRing className="w-5 h-5 text-primary" /> Notifications push
        </h2>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
          Relances d'engagement envoyées automatiquement. Les notifications
          de message, match et Super Like ne figurent pas ici : elles sont
          immédiates et hors plafond.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Le dénominateur d'abord : sans lui, les autres chiffres ne
            veulent rien dire. */}
        <Petite v={String(d.joignables)} l="Membres joignables" fort />
        <Petite v={String(d.appareils)} l="Appareils enregistrés" />
        <Petite v={String(d.envoyes)} l={`Envoyées sur ${d.periode_jours} j`} />
        <Petite v={`${pct(d.cliques, d.envoyes)} %`} l={`Cliquées · ${d.cliques}`} />
        <Petite v={String(d.refus)} l="Ont coupé les relances" alerte={d.refus > 0} />
      </div>

      {d.joignables === 0 && (
        <div className="rounded-2xl border border-gold/40 bg-gold/5 p-4 flex gap-3">
          <AlertTriangle className="w-4 h-4 text-gold shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Aucun membre joignable.</strong>{" "}
            Une notification n'atteint que ceux qui l'ont explicitement
            autorisée depuis leurs paramètres. Tant que ce nombre est à zéro,
            le moteur tourne correctement mais n'envoie rien.
          </p>
        </div>
      )}

      {/* ── Par message ── */}
      <div className="rounded-2xl border border-border bg-card overflow-x-auto">
        <div className="p-5 pb-2">
          <h3 className="text-sm font-semibold">Par message</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Le taux de clic dit lequel ramène réellement du monde.
          </p>
        </div>

        {d.modeles.length === 0 ? (
          <p className="text-sm text-muted-foreground px-5 pb-5">
            Aucune notification envoyée sur la période.
          </p>
        ) : (
          <table className="w-full text-sm min-w-[30rem]">
            <thead>
              <tr className="border-y border-border">
                {["Message", "Envoyées", "Cliquées", "Taux", "Dernier envoi"].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.modeles.map(m => {
                const taux = pct(m.cliques, m.envoyes);
                return (
                  <tr key={m.modele} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-medium">{LIBELLES[m.modele] ?? m.modele}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold">{m.envoyes}</td>
                    <td className="px-4 py-3 tabular-nums">{m.cliques}</td>
                    <td className="px-4 py-3">
                      {/* 10 % est un repère correct pour du push de
                          relance ; en dessous, le texte est à revoir. */}
                      <span className={`tabular-nums font-semibold ${
                        taux >= 10 ? "text-emerald-600" : taux < 3 && m.envoyes >= 20 ? "text-gold-foreground" : ""}`}>
                        {taux} %
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-muted-foreground">{quand(m.dernier)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Jour par jour ── */}
      {d.courbe.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold">Jour par jour</h3>
          <div className="mt-3 space-y-1.5">
            {d.courbe.slice(-14).map((c, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className="w-14 shrink-0 text-muted-foreground tabular-nums">
                  {new Date(c.jour).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
                </span>
                <div className="flex-1 h-4 rounded-md bg-secondary overflow-hidden relative">
                  <div className="h-full bg-primary/25" style={{ width: `${(c.envoyes / maxJour) * 100}%` }} />
                  <div className="h-full bg-primary absolute inset-y-0 left-0"
                       style={{ width: `${(c.cliques / maxJour) * 100}%` }} />
                </div>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {c.envoyes} · <strong className="text-foreground">{c.cliques}</strong> clic{c.cliques > 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Derniers envois ── */}
      {d.recents.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold">Derniers envois</h3>
          <div className="mt-3 divide-y divide-border/60 max-h-80 overflow-y-auto">
            {d.recents.map((r, i) => (
              <div key={i} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.prenom}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {LIBELLES[r.modele] ?? r.modele} · {quand(r.envoye_le)}
                  </div>
                </div>
                <span className={`shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${
                  r.clique_le ? "bg-emerald-500/10 text-emerald-600" : "bg-secondary text-muted-foreground"}`}>
                  {r.clique_le ? <><MousePointerClick className="w-3 h-3" /> Cliquée</> : "Envoyée"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Les textes ── */}
      {d.textes.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold">Textes envoyés</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 flex items-start gap-1.5">
            <Info className="w-3 h-3 shrink-0 mt-0.5" />
            Modifiables directement dans la table <code>push_modeles</code>,
            sans redéploiement.
          </p>
          <div className="mt-3 space-y-2">
            {d.textes.map((t, i) => (
              <div key={i} className={`rounded-xl border border-border/60 p-3 ${t.actif ? "" : "opacity-50"}`}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wide bg-primary/10 text-primary rounded-full px-2 py-0.5">
                    {LIBELLES[t.modele] ?? t.modele}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{t.url}</span>
                </div>
                <div className="text-sm font-medium mt-1.5">{t.titre}</div>
                <div className="text-xs text-muted-foreground">{t.corps}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2.5 text-[11px] text-muted-foreground leading-relaxed">
        <Smartphone className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>
          Le push n'a pas de « taux d'ouverture » : l'appareil affiche la
          notification sans rien nous dire. Seul le clic est mesurable — et
          c'est le seul qui compte, une notification vue et ignorée n'ayant
          rien produit.
        </p>
      </div>
    </section>
  );
}

function Petite({ v, l, alerte, fort }: { v: string; l: string; alerte?: boolean; fort?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${
      alerte ? "border-gold/40 bg-gold/5"
      : fort ? "border-primary/40 bg-primary/5"
      : "border-border bg-card"}`}>
      <div className="text-xl font-serif font-bold tabular-nums">{v}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{l}</div>
    </div>
  );
}

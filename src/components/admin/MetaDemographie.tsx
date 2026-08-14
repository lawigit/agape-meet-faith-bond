import { useEffect, useState } from "react";
import {
  Globe, Users2, Cake, Church, MapPin, AlertTriangle, MousePointerClick, Info,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatPrice } from "@/lib/plans";
import { Drapeau } from "@/components/app/Drapeau";

/**
 * Répartition des membres venus de la publicité.
 *
 * CE BLOC NE DÉCRIT PAS LES VISITEURS, ET C'EST VOLONTAIRE.
 *
 * Une visite est anonyme : ni pays, ni genre, ni âge tant que la personne
 * ne s'est pas inscrite. Afficher une « répartition des visiteurs par
 * âge » supposerait de l'inventer.
 *
 * Ce qui est montré ici, ce sont les MEMBRES INSCRITS arrivés par une
 * publicité — les seuls dont on connaisse quoi que ce soit, parce qu'ils
 * l'ont déclaré eux-mêmes. C'est aussi la seule population qui serve à
 * régler un ciblage : mille visiteurs qui repartent ne disent pas qui
 * cibler ; trente inscrits d'Abidjan âgés de 30 ans, si.
 *
 * Chaque répartition affiche aussi les payants. Une tranche d'âge qui
 * s'inscrit beaucoup sans jamais payer coûte de l'argent au lieu d'en
 * rapporter, et seule cette colonne le révèle.
 */

type Part = { valeur: string; n: number; payants?: number; pays?: string };

type Donnees = {
  periode_jours: number;
  membres_pub: number;
  visites_total: number;
  visites_par_campagne: { campagne: string; source: string; n: number }[];
  visites_par_page: { page: string; n: number }[];
  pays: Part[];
  villes: Part[];
  genre: Part[];
  age: Part[];
  denomination: Part[];
  campagne_pays: { campagne: string; pays: string; n: number; payants: number; revenus: number }[];
};

const GENRES: Record<string, string> = {
  homme: "Hommes", femme: "Femmes", male: "Hommes", female: "Femmes",
};

export function MetaDemographie({ jours }: { jours: number }) {
  const [d, setD] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let annule = false;
    supabase.rpc("admin_meta_demographie", { p_days: jours }).then(({ data, error }: any) => {
      if (annule) return;
      if (error || data?.error) { console.error("[meta/demographie]", error ?? data); setErreur(true); return; }
      setErreur(false);
      setD(data as Donnees);
    });
    return () => { annule = true; };
  }, [jours]);

  if (erreur) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-gold shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          Répartitions indisponibles. La migration{" "}
          <code>72_meta_ads_demographie.sql</code> a-t-elle été exécutée ?
        </p>
      </section>
    );
  }

  if (!d) return <div className="h-72 rounded-2xl bg-secondary animate-pulse" />;

  return (
    <div className="space-y-5">
      {/* ── Ce qu'on mesure sur les visites ── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <MousePointerClick className="w-4 h-4 text-primary" /> Visites publicitaires
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Petite v={String(d.visites_total)} l={`Visites sur ${d.periode_jours} j`} />
          <Petite v={String(d.membres_pub)} l="Inscriptions issues des pubs" />
        </div>

        {/* La limite est écrite là où la question se pose, pas en note de
            bas de page : c'est ici qu'on chercherait un âge. */}
        <div className="mt-3 flex gap-2.5 text-[11px] text-muted-foreground leading-relaxed">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <p>
            Une visite est <strong className="text-foreground">anonyme</strong> : ni pays,
            ni genre, ni âge tant que la personne ne s'est pas inscrite. Les
            répartitions ci-dessous portent donc sur les{" "}
            <strong className="text-foreground">{d.membres_pub} membres inscrits</strong>{" "}
            venus d'une publicité, qui ont déclaré ces informations eux-mêmes.
          </p>
        </div>

        {d.visites_par_campagne.length > 0 && (
          <div className="mt-4">
            <h4 className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
              Par campagne
            </h4>
            <div className="mt-2 space-y-1.5">
              {d.visites_par_campagne.slice(0, 8).map((c, i) => (
                <div key={i} className="flex items-center justify-between text-sm gap-3">
                  <span className="truncate">
                    {c.campagne}
                    <span className="text-muted-foreground text-xs"> · {c.source}</span>
                  </span>
                  <span className="tabular-nums font-semibold shrink-0">{c.n}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {d.visites_par_page.length > 0 && (
          <div className="mt-4">
            <h4 className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
              Pages d'arrivée
            </h4>
            <div className="mt-2 space-y-1.5">
              {d.visites_par_page.slice(0, 6).map((p, i) => (
                <div key={i} className="flex items-center justify-between text-sm gap-3">
                  <code className="text-xs truncate">{p.page}</code>
                  <span className="tabular-nums shrink-0">{p.n}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {d.membres_pub === 0 ? (
        <section className="rounded-2xl border border-dashed border-border py-12 text-center">
          <Globe className="w-8 h-8 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground mt-3">
            Aucune inscription issue d'une publicité sur la période.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Les répartitions apparaîtront dès la première conversion.
          </p>
        </section>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Repartition titre="Pays" icone={Globe} parts={d.pays} total={d.membres_pub} drapeau />
            <Repartition titre="Genre" icone={Users2} parts={d.genre} total={d.membres_pub}
                         libelle={v => GENRES[v.toLowerCase()] ?? v} />
            <Repartition titre="Âge" icone={Cake} parts={d.age} total={d.membres_pub} />
            <Repartition titre="Dénomination" icone={Church} parts={d.denomination} total={d.membres_pub} />
          </div>

          <Repartition titre="Villes" icone={MapPin} parts={d.villes} total={d.membres_pub} max={12} />

          {/* ── Le tableau qui décide d'un budget ── */}
          {d.campagne_pays.length > 0 && (
            <section className="rounded-2xl border border-border bg-card overflow-x-auto">
              <div className="p-5 pb-2">
                <h3 className="text-sm font-semibold">Campagne × pays</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Où chaque campagne recrute, et ce que cela rapporte.
                </p>
              </div>
              <table className="w-full text-sm min-w-[34rem]">
                <thead>
                  <tr className="border-y border-border">
                    {["Campagne", "Pays", "Inscrits", "Payants", "Revenus", "Conversion"].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.campagne_pays.map((c, i) => {
                    const conv = c.n > 0 ? Math.round((c.payants / c.n) * 100) : 0;
                    return (
                      <tr key={i} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-3 font-medium truncate max-w-[12rem]">{c.campagne}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5">
                            <Drapeau pays={c.pays} className="w-4 h-4" />
                            <span className="truncate">{c.pays}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 tabular-nums font-semibold">{c.n}</td>
                        <td className="px-4 py-3 tabular-nums">{c.payants}</td>
                        <td className="px-4 py-3 tabular-nums">{formatPrice(c.revenus)}</td>
                        <td className="px-4 py-3">
                          <span className={`tabular-nums font-semibold ${conv >= 5 ? "text-emerald-600" : ""}`}>
                            {conv} %
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/* ─────────────── Répartition ─────────────── */

function Repartition({
  titre, icone: Icone, parts, total, libelle, drapeau, max = 8,
}: {
  titre: string;
  icone: any;
  parts: Part[];
  total: number;
  libelle?: (v: string) => string;
  drapeau?: boolean;
  max?: number;
}) {
  // « Non renseigné » est relégué en bas quel que soit son volume : ce
  // n'est pas un segment, c'est un trou dans la donnée.
  const tries = [...parts].sort((a, b) => {
    const aVide = /non renseign/i.test(a.valeur);
    const bVide = /non renseign/i.test(b.valeur);
    if (aVide !== bVide) return aVide ? 1 : -1;
    return b.n - a.n;
  });

  const plafond = Math.max(1, ...parts.filter(p => !/non renseign/i.test(p.valeur)).map(p => p.n));

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Icone className="w-4 h-4 text-primary" /> {titre}
      </h3>

      {parts.length === 0 ? (
        <p className="text-sm text-muted-foreground mt-3">Aucune donnée disponible.</p>
      ) : (
        <div className="mt-3 space-y-2.5">
          {tries.slice(0, max).map((p, i) => {
            const vide = /non renseign/i.test(p.valeur);
            const part = total > 0 ? Math.round((p.n / total) * 100) : 0;
            return (
              <div key={i} className={vide ? "opacity-55" : ""}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5 min-w-0">
                    {drapeau && !vide && <Drapeau pays={p.valeur} className="w-4 h-4 shrink-0" />}
                    <span className="truncate">{libelle ? libelle(p.valeur) : p.valeur}</span>
                    {p.pays && <span className="text-[11px] text-muted-foreground">· {p.pays}</span>}
                  </span>
                  <span className="tabular-nums shrink-0">
                    <strong>{p.n}</strong>
                    <span className="text-muted-foreground text-xs"> · {part} %</span>
                    {typeof p.payants === "number" && p.payants > 0 && (
                      <span className="text-emerald-600 text-xs"> · {p.payants} payant{p.payants > 1 ? "s" : ""}</span>
                    )}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary mt-1 overflow-hidden">
                  <div className={`h-full rounded-full ${vide ? "bg-muted-foreground/30" : "bg-primary"}`}
                       style={{ width: `${(p.n / plafond) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Petite({ v, l }: { v: string; l: string }) {
  return (
    <div className="rounded-xl border border-border p-3.5">
      <div className="text-xl font-serif font-bold tabular-nums">{v}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{l}</div>
    </div>
  );
}

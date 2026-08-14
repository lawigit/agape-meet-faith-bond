import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Radio, Activity, Target, Link2, TrendingUp, FlaskConical, Users2,
  BarChart3, AlertTriangle, CheckCircle2, XCircle, Loader2, RefreshCw,
  ExternalLink, Save, Info, Copy,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { MetaDemographie } from "@/components/admin/MetaDemographie";
import { formatPrice } from "@/lib/plans";

export const Route = createFileRoute("/admin/meta-ads")({
  component: AdminMetaAds,
});

/**
 * Meta Ads — mesure, pas gestion de campagnes.
 *
 * Les campagnes se créent dans Meta Business Suite. Ce module répond à la
 * seule question que Meta ne sait pas traiter : que produisent ces
 * campagnes DANS l'application — inscriptions, profils, matchs,
 * abonnements, revenus.
 *
 * CE QUI N'EST PAS AFFICHÉ, ET POURQUOI. Dépenses, impressions, clics,
 * CTR, CPC n'existent que dans l'API Marketing de Meta, qui exige une
 * autorisation OAuth sur un compte publicitaire. Tant qu'elle n'est pas
 * établie, ces chiffres — et donc le ROAS et le coût par abonné — ne sont
 * pas calculables. On l'écrit plutôt que d'afficher un nombre inventé :
 * un budget se décide sur ces valeurs.
 */

type Donnees = {
  periode_jours: number;
  entonnoir: {
    visites: number; inscrits: number; profils: number; matchs: number;
    checkouts: number; abonnes: number; revenus: number;
  };
  campagnes: {
    campagne: string; source: string; inscrits: number;
    profils: number; matchs: number; abonnes: number; revenus: number;
  }[];
  evenements: {
    nom: string; total: number; jour: number; reussis: number;
    echecs: number; sources: string[] | null; dernier: string;
  }[];
  sante: {
    envoyes_24h: number; reussis_24h: number; echecs_24h: number;
    dernier: string | null; dernier_achat: string | null;
    paiements_24h: number; achats_24h: number;
  };
  erreurs: { nom: string; code: string; message: string; http: number; quand: string }[];
  audiences: Record<string, number>;
  sources: { source: string; n: number }[];
};

const ONGLETS = [
  { k: "vue", l: "Vue d'ensemble", i: BarChart3 },
  { k: "pixel", l: "Pixel & Conversions", i: Radio },
  { k: "evenements", l: "Événements", i: Activity },
  { k: "audiences", l: "Audiences", i: Users2 },
  { k: "utm", l: "UTM & Tracking", i: Link2 },
  { k: "attribution", l: "Attribution", i: Target },
  { k: "rapports", l: "Rapports", i: TrendingUp },
  { k: "tests", l: "Tests & Diagnostic", i: FlaskConical },
] as const;

const PERIODES = [
  { j: 1, l: "Aujourd'hui" }, { j: 7, l: "7 jours" },
  { j: 30, l: "30 jours" }, { j: 90, l: "90 jours" }, { j: 365, l: "1 an" },
];

function AdminMetaAds() {
  const [onglet, setOnglet] = useState<string>("vue");
  const [jours, setJours] = useState(30);
  const [d, setD] = useState<Donnees | null>(null);
  const [reglages, setReglages] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = async (n: number) => {
    setErreur(null);
    const [{ data: m, error: e }, { data: s }] = await Promise.all([
      supabase.rpc("admin_meta_ads", { p_days: n }),
      supabase.from("app_settings").select("key, value").like("key", "meta_%"),
    ]);

    if (e || (m as any)?.error) {
      console.error("[admin/meta-ads]", e ?? m);
      setErreur("Lecture impossible. La migration 65 a-t-elle été exécutée, et avez-vous la permission « Réglages » ?");
      setLoading(false);
      return;
    }

    const r: Record<string, any> = {};
    (s ?? []).forEach((x: any) => { r[x.key] = x.value; });

    setD(m as Donnees);
    setReglages(r);
    setLoading(false);
  };

  useEffect(() => { charger(jours); }, [jours]);

  const pixelOk = Boolean(String(reglages.meta_pixel_id ?? "").trim());
  const capiOk = reglages.meta_capi_active === true;
  const enProd = reglages.meta_mode === "production";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-serif font-bold">Meta Ads</h1>
          <p className="text-muted-foreground mt-1 text-sm max-w-xl">
            Suivez les performances de vos campagnes Meta et mesurez leur
            impact réel sur AgapeMeet.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <select
            value={jours}
            onChange={e => setJours(Number(e.target.value))}
            className="px-3 py-2 rounded-xl border border-border bg-card text-sm"
          >
            {PERIODES.map(p => <option key={p.j} value={p.j}>{p.l}</option>)}
          </select>
          <button
            onClick={() => charger(jours)}
            className="p-2 rounded-xl border border-border bg-card hover:bg-secondary transition-colors"
            aria-label="Actualiser"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <a
            href="https://business.facebook.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition"
          >
            <ExternalLink className="w-4 h-4" /> Business Suite
          </a>
        </div>
      </div>

      {erreur && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm">{erreur}</p>
        </div>
      )}

      {/* Onglets internes — jamais des menus du sidebar. */}
      <div className="flex flex-wrap gap-2">
        {ONGLETS.map(o => (
          <button
            key={o.k}
            onClick={() => setOnglet(o.k)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-semibold transition-colors ${
              onglet === o.k
                ? "bg-primary text-primary-foreground shadow-soft"
                : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <o.i className="w-4 h-4" /> {o.l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-secondary animate-pulse" />)}
          </div>
          <div className="h-64 rounded-2xl bg-secondary animate-pulse" />
        </div>
      ) : d && (
        <>
          {onglet === "vue" && <Vue d={d} pixelOk={pixelOk} capiOk={capiOk} enProd={enProd} />}
          {onglet === "pixel" && <Pixel reglages={reglages} onSave={() => charger(jours)} />}
          {onglet === "evenements" && <Evenements d={d} />}
          {/* Les répartitions rejoignent « Audiences » : c'est l'onglet
              où l'on décide qui cibler, et il n'y avait jusqu'ici aucun
              chiffre sur qui répond réellement aux publicités. */}
          {onglet === "audiences" && (
            <div className="space-y-5">
              <Audiences d={d} />
              <MetaDemographie jours={jours} />
            </div>
          )}
          {onglet === "utm" && <Utm d={d} />}
          {onglet === "attribution" && <Attribution d={d} />}
          {onglet === "rapports" && <Rapports d={d} />}
          {onglet === "tests" && <Tests d={d} pixelOk={pixelOk} capiOk={capiOk} />}
        </>
      )}
    </div>
  );
}

/* ═══════════════ Vue d'ensemble ═══════════════ */

function Vue({ d, pixelOk, capiOk, enProd }: {
  d: Donnees; pixelOk: boolean; capiOk: boolean; enProd: boolean;
}) {
  const e = d.entonnoir;

  // Aucun paiement encaissé n'est parvenu à Meta : les campagnes
  // s'optimisent alors sans connaître les ventes qu'elles produisent.
  const achatsManquants = d.sante.paiements_24h > 0 && d.sante.achats_24h === 0;

  return (
    <div className="space-y-6">
      {/* État de la connexion */}
      {!pixelOk ? (
        <Encart ton="info" titre="Meta n'est pas encore connecté">
          Renseignez votre identifiant de Pixel dans l'onglet
          <strong> Pixel &amp; Conversions</strong> pour commencer à mesurer
          vos conversions.
        </Encart>
      ) : !capiOk ? (
        <Encart ton="attention" titre="Pixel actif, Conversions API inactive">
          Votre Pixel fonctionne, mais l'envoi serveur n'est pas activé. Une
          part importante des conversions échappe à Meta — bloqueurs de
          publicité et traitement iOS — et vos campagnes s'optimisent sur une
          vision partielle.
        </Encart>
      ) : achatsManquants ? (
        <Encart ton="erreur" titre="Aucun achat transmis depuis 24 heures">
          {d.sante.paiements_24h} paiement(s) confirmé(s) sur la période, mais
          aucun événement <strong>Purchase</strong> reçu par Meta. Vos
          campagnes optimisent sans connaître les ventes qu'elles produisent.
          Vérifiez l'onglet <strong>Tests &amp; Diagnostic</strong>.
        </Encart>
      ) : (
        <Encart ton="ok" titre="Votre tracking Meta est opérationnel">
          Pixel connecté, Conversions API active
          {enProd ? ", mode production." : ", mode test — les événements n'alimentent pas encore vos campagnes."}
        </Encart>
      )}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Statut label="Meta Pixel" ok={pixelOk} />
        <Statut label="Conversions API" ok={capiOk} />
        <Statut label="Mode" ok={enProd} texteOk="Production" texteKo="Test" />
        <Statut
          label="Tracking"
          ok={pixelOk && capiOk && !achatsManquants}
          texteOk="Opérationnel"
          texteKo="À vérifier"
        />
      </div>

      {/* KPI issus de l'application */}
      <section>
        <Titre icone={BarChart3} titre="Ce que les campagnes produisent">
          Membres arrivés par une campagne, sur {d.periode_jours} jours.
        </Titre>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mt-4">
          <Carte v={String(e.visites)} l="Visites" />
          <Carte v={String(e.inscrits)} l="Inscriptions" />
          <Carte v={String(e.profils)} l="Profils complétés" />
          <Carte v={String(e.matchs)} l="Matchs" />
          <Carte v={String(e.checkouts)} l="Checkouts démarrés" />
          <Carte v={String(e.abonnes)} l="Abonnements" />
          <Carte v={formatPrice(e.revenus)} l="Revenus" accent />
          <Carte
            v={e.abonnes > 0 ? formatPrice(Math.round(e.revenus / e.abonnes)) : "—"}
            l="Revenu par abonné"
          />
        </div>
      </section>

      {/* KPI qui dépendent de Meta */}
      <section>
        <Titre icone={Radio} titre="Métriques publicitaires">
          Ces chiffres n'existent que chez Meta.
        </Titre>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mt-4">
          {["Dépenses", "Impressions", "Portée", "Clics", "CTR", "CPC", "Coût par abonné", "ROAS"]
            .map(l => <CarteVide key={l} l={l} />)}
        </div>
        <Encart ton="info" titre="Connexion Meta requise">
          Dépenses, impressions et clics ne sont accessibles que par l'API
          Marketing de Meta, qui exige une autorisation sur votre compte
          publicitaire. Sans elle, ni le ROAS ni le coût par abonné ne peuvent
          être calculés — et afficher un nombre inventé serait pire que de ne
          rien afficher, puisque c'est sur ces valeurs qu'un budget se décide.
          <br /><br />
          En attendant, retrouvez-les dans <strong>Meta Business Suite</strong>,
          et rapprochez-les des revenus ci-dessus.
        </Encart>
      </section>

      <Entonnoir e={e} />
    </div>
  );
}

/* ═══════════════ Entonnoir ═══════════════ */

function Entonnoir({ e }: { e: Donnees["entonnoir"] }) {
  const etapes = [
    { l: "Visites depuis une publicité", n: e.visites },
    { l: "Inscriptions", n: e.inscrits },
    { l: "Profils complétés", n: e.profils },
    { l: "Matchs", n: e.matchs },
    { l: "Checkouts démarrés", n: e.checkouts },
    { l: "Abonnements", n: e.abonnes },
  ];
  const base = etapes[0].n || 1;

  if (e.visites === 0 && e.inscrits === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-border p-10 text-center">
        <Target className="w-9 h-9 text-muted-foreground/30 mx-auto" />
        <p className="text-sm text-muted-foreground mt-3 max-w-md mx-auto leading-relaxed">
          Aucune donnée disponible. L'entonnoir se remplira dès qu'une
          campagne enverra du trafic avec des paramètres UTM — voir l'onglet
          <strong> UTM &amp; Tracking</strong>.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold">Parcours, de la publicité au revenu</h3>
      <div className="mt-4 space-y-3">
        {etapes.map((s, i, arr) => {
          const perte = i > 0 ? arr[i - 1].n - s.n : 0;
          const taux = i > 0 && arr[i - 1].n > 0 ? Math.round((s.n / arr[i - 1].n) * 100) : 100;
          return (
            <div key={s.l}>
              <div className="flex items-baseline justify-between text-sm">
                <span>{s.l}</span>
                <span className="tabular-nums font-semibold">
                  {s.n}
                  {i > 0 && (
                    <span className="text-muted-foreground font-normal text-xs"> · {taux} %</span>
                  )}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-secondary mt-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60"
                  style={{ width: `${Math.max(2, (s.n / base) * 100)}%` }}
                />
              </div>
              {i > 0 && perte > 0 && (
                <p className={`text-[11px] mt-1 ${taux < 50 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                  −{perte} à cette étape
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-4 border-t border-border/60 flex items-baseline justify-between">
        <span className="text-sm font-semibold">Revenus générés</span>
        <span className="font-serif text-xl font-bold tabular-nums">{formatPrice(e.revenus)}</span>
      </div>
    </section>
  );
}

/* ═══════════════ Pixel & Conversions ═══════════════ */

function Pixel({ reglages, onSave }: { reglages: Record<string, any>; onSave: () => void }) {
  const [v, setV] = useState({
    meta_pixel_id: String(reglages.meta_pixel_id ?? ""),
    meta_domain: String(reglages.meta_domain ?? "agapemeet.com"),
    meta_test_code: String(reglages.meta_test_code ?? ""),
    meta_mode: String(reglages.meta_mode ?? "test"),
    meta_capi_active: reglages.meta_capi_active === true,
  });
  const [busy, setBusy] = useState(false);

  const enregistrer = async () => {
    setBusy(true);
    for (const [k, val] of Object.entries(v)) {
      const { error } = await supabase
        .from("app_settings")
        .update({ value: val, updated_at: new Date().toISOString() })
        .eq("key", k);
      if (error) {
        setBusy(false);
        toast.error(`Impossible d'enregistrer « ${k} »`);
        return;
      }
    }
    setBusy(false);
    toast.success("Configuration enregistrée");
    onSave();
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <Titre icone={Radio} titre="Configuration">
          Ces valeurs sont lues à chaque envoi, sans redéploiement.
        </Titre>

        <Champ label="Pixel / Dataset ID" aide="Visible dans Meta Events Manager. Cet identifiant est public : il part dans le navigateur de chaque visiteur.">
          <input
            value={v.meta_pixel_id}
            onChange={e => setV({ ...v, meta_pixel_id: e.target.value.trim() })}
            placeholder="123456789012345"
            className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm font-mono"
          />
        </Champ>

        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Domaine vérifié">
            <input
              value={v.meta_domain}
              onChange={e => setV({ ...v, meta_domain: e.target.value.trim() })}
              className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm"
            />
          </Champ>

          <Champ label="Test Event Code" aide="Isole les envois dans l'outil de test de Meta.">
            <input
              value={v.meta_test_code}
              onChange={e => setV({ ...v, meta_test_code: e.target.value.trim() })}
              placeholder="TEST12345"
              className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm font-mono"
            />
          </Champ>
        </div>

        <Champ label="Mode d'envoi">
          <div className="flex gap-2">
            {(["test", "production"] as const).map(m => (
              <button
                key={m}
                onClick={() => setV({ ...v, meta_mode: m })}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                  v.meta_mode === m
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/70"
                }`}
              >
                {m === "test" ? "Test" : "Production"}
              </button>
            ))}
          </div>
        </Champ>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={v.meta_capi_active}
            onChange={e => setV({ ...v, meta_capi_active: e.target.checked })}
            className="mt-1"
          />
          <span>
            <span className="text-sm font-medium">Activer Conversions API</span>
            <span className="block text-xs text-muted-foreground mt-0.5 leading-relaxed">
              L'envoi serveur double le Pixel. Sans lui, les bloqueurs de
              publicité et le traitement iOS privent Meta d'une part
              importante des conversions.
            </span>
          </span>
        </label>

        <button
          onClick={enregistrer}
          disabled={busy}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer
        </button>
      </section>

      <Encart ton="info" titre="Le jeton d'accès ne se saisit pas ici">
        Il n'apparaît dans aucune page, jamais, même pour un administrateur.
        Il vit uniquement dans les secrets du serveur :
        <br /><br />
        <code className="px-2 py-1 rounded bg-secondary text-xs block overflow-x-auto">
          npx supabase secrets set META_ACCESS_TOKEN=…
        </code>
        <br />
        Le stocker en base ou l'afficher dans une interface reviendrait à
        l'exposer : une capture d'écran, une extension de navigateur ou une
        fuite de journal suffirait à donner accès à votre compte publicitaire.
      </Encart>
    </div>
  );
}

/* ═══════════════ Événements ═══════════════ */

const ATTENDUS = [
  "PageView", "ViewContent", "CompleteRegistration", "CompleteProfile",
  "Like", "Match", "InitiateCheckout", "Purchase",
];

function Evenements({ d }: { d: Donnees }) {
  const parNom = new Map(d.evenements.map(e => [e.nom, e]));

  return (
    <div className="space-y-5">
      <Titre icone={Activity} titre="Événements suivis">
        Un événement ne part que lorsque l'action a réellement eu lieu en base.
      </Titre>

      <div className="rounded-2xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm min-w-[42rem]">
          <thead>
            <tr className="border-b border-border">
              {["Événement", "Statut", "Source", "24 h", "Total", "Dernier"].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ATTENDUS.map(nom => {
              const e = parNom.get(nom);
              return (
                <tr key={nom} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-medium">{nom}</td>
                  <td className="px-4 py-3">
                    {!e ? (
                      <Pastille ton="neutre">Jamais reçu</Pastille>
                    ) : e.echecs > 0 ? (
                      <Pastille ton="attention">{e.echecs} échec(s)</Pastille>
                    ) : (
                      <Pastille ton="ok">Actif</Pastille>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {e?.sources?.length ? e.sources.join(" + ") : "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{e?.jour ?? 0}</td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{e?.total ?? 0}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {e?.dernier ? depuis(e.dernier) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Encart ton="info" titre="Quand chaque événement part">
        <strong>CompleteRegistration</strong> — le profil est écrit en base,
        pas au clic sur « Créer mon compte ».<br />
        <strong>CompleteProfile</strong> — la complétion atteint 60 %.<br />
        <strong>Like</strong> et <strong>Match</strong> — après confirmation
        par la base, jamais sur l'intention.<br />
        <strong>InitiateCheckout</strong> — la commande est créée chez le
        prestataire.<br />
        <strong>Purchase</strong> — <em>uniquement</em> depuis le webhook de
        paiement, après encaissement confirmé. Il est refusé s'il vient d'un
        navigateur.
      </Encart>

      {d.erreurs.length > 0 && (
        <section>
          <Titre icone={AlertTriangle} titre="Dernières erreurs" />
          <div className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/5 divide-y divide-destructive/15">
            {d.erreurs.slice(0, 8).map((e, i) => (
              <div key={i} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{e.nom}</span>
                  <span className="text-[11px] text-muted-foreground">{depuis(e.quand)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {e.http ? `HTTP ${e.http} · ` : ""}{e.code ? `${e.code} · ` : ""}{e.message}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ═══════════════ Audiences ═══════════════ */

const AUDIENCES: { k: string; l: string; q: string }[] = [
  { k: "visiteurs", l: "Visiteurs venus d'une publicité", q: "Retargeting court" },
  { k: "inscrits", l: "Inscrits", q: "Exclusion des campagnes d'acquisition" },
  { k: "profils", l: "Profils complets", q: "Base d'une audience similaire" },
  { k: "actifs", l: "Actifs sur 30 jours", q: "Le meilleur socle pour un lookalike" },
  { k: "ont_like", l: "Ont envoyé un like", q: "Engagement démontré" },
  { k: "ont_match", l: "Ont obtenu un match", q: "Proches de l'abonnement" },
  { k: "checkout", l: "Ont démarré un checkout", q: "Relance la plus rentable" },
  { k: "abonnes", l: "Abonnés actifs", q: "À exclure des campagnes payantes" },
  { k: "anciens", l: "Anciens abonnés", q: "Réabonnement" },
];

function Audiences({ d }: { d: Donnees }) {
  return (
    <div className="space-y-5">
      <Titre icone={Users2} titre="Segments mobilisables">
        Effectifs réels, calculés depuis la base. La création des audiences
        se fait dans Meta Business Suite — AgapeMeet prépare les segments et
        mesure ce qu'ils produisent.
      </Titre>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AUDIENCES.map(a => (
          <div key={a.k} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium leading-snug">{a.l}</p>
              <span className="font-serif text-xl font-bold tabular-nums shrink-0">
                {d.audiences[a.k] ?? 0}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">{a.q}</p>
          </div>
        ))}
      </div>

      <Encart ton="attention" titre="Ne transmettez jamais de fichier de membres">
        Exporter des adresses e-mail vers une audience personnalisée
        transmettrait à Meta la liste de vos membres — sur une plateforme de
        rencontre chrétienne, cela révèle une orientation religieuse et une
        situation matrimoniale. Le tracking d'événements suffit à construire
        des audiences comportementales, sans jamais livrer d'identités.
      </Encart>
    </div>
  );
}

/* ═══════════════ UTM ═══════════════ */

function Utm({ d }: { d: Donnees }) {
  const exemple =
    "https://agapemeet.com/?utm_source=facebook&utm_medium=paid_social" +
    "&utm_campaign=celibataires_chretiens_togo&utm_content=video_01";

  const copier = () => {
    navigator.clipboard.writeText(exemple)
      .then(() => toast.success("Adresse copiée"))
      .catch(() => toast.error("Copie impossible"));
  };

  return (
    <div className="space-y-5">
      <Titre icone={Link2} titre="Marquage des campagnes">
        Sans ces paramètres, aucune inscription ne peut être rattachée à une
        campagne : l'attribution reste vide.
      </Titre>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold">Adresse à utiliser dans vos publicités</h3>
        <div className="mt-3 rounded-xl bg-secondary p-3 overflow-x-auto">
          <code className="text-xs whitespace-nowrap">{exemple}</code>
        </div>
        <button
          onClick={copier}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm hover:bg-secondary"
        >
          <Copy className="w-3.5 h-3.5" /> Copier
        </button>

        <div className="mt-5 space-y-2 text-xs text-muted-foreground">
          <p><code className="text-foreground">utm_source</code> — la plateforme : <em>facebook</em>, <em>instagram</em></p>
          <p><code className="text-foreground">utm_medium</code> — le type : <em>paid_social</em></p>
          <p><code className="text-foreground">utm_campaign</code> — le nom de campagne, tel qu'il apparaîtra ici</p>
          <p><code className="text-foreground">utm_content</code> — la création : <em>video_01</em>, <em>image_femme_30</em></p>
          <p><code className="text-foreground">utm_term</code> — facultatif, mot-clé ou ciblage</p>
        </div>
      </section>

      <section>
        <Titre icone={Radio} titre="Provenances constatées" />
        {d.sources.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-3">
            Aucune visite marquée sur la période. Ajoutez les paramètres
            ci-dessus à l'adresse de destination de vos publicités.
          </p>
        ) : (
          <div className="mt-3 rounded-2xl border border-border bg-card divide-y divide-border/60">
            {d.sources.map(s => (
              <div key={s.source} className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm">{s.source}</span>
                <span className="font-semibold tabular-nums">{s.n} visite(s)</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <Encart ton="info" titre="La première campagne l'emporte">
        Un membre qui revient par une seconde publicité reste attribué à celle
        qui l'a fait venir. Réattribuer au dernier clic ferait porter le
        mérite de l'acquisition à une campagne de reciblage.
      </Encart>
    </div>
  );
}

/* ═══════════════ Attribution ═══════════════ */

function Attribution({ d }: { d: Donnees }) {
  if (d.campagnes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center">
        <Target className="w-9 h-9 text-muted-foreground/30 mx-auto" />
        <p className="text-sm text-muted-foreground mt-3 max-w-md mx-auto leading-relaxed">
          Aucune donnée disponible. Marquez vos publicités avec des paramètres
          UTM — onglet <strong>UTM &amp; Tracking</strong> — et les campagnes
          apparaîtront ici dès les premières visites.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Titre icone={Target} titre="Ce que chaque campagne produit">
        Membres arrivés par la campagne, suivis jusqu'au revenu.
      </Titre>

      <div className="rounded-2xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm min-w-[46rem]">
          <thead>
            <tr className="border-b border-border">
              {["Campagne", "Source", "Inscrits", "Profils", "Matchs", "Abonnés", "Revenus", "Conversion"]
                .map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {h}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {d.campagnes.map((c, i) => {
              const conv = c.inscrits > 0 ? Math.round((c.abonnes / c.inscrits) * 100) : 0;
              return (
                <tr key={i} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-medium max-w-[16rem] truncate">{c.campagne}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{c.source}</td>
                  <td className="px-4 py-3 tabular-nums">{c.inscrits}</td>
                  <td className="px-4 py-3 tabular-nums">{c.profils}</td>
                  <td className="px-4 py-3 tabular-nums">{c.matchs}</td>
                  <td className="px-4 py-3 tabular-nums font-semibold">{c.abonnes}</td>
                  <td className="px-4 py-3 tabular-nums font-semibold">{formatPrice(c.revenus)}</td>
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
      </div>

      <Encart ton="info" titre="Le coût par abonné manque encore">
        Rapprochez la colonne <strong>Revenus</strong> de la dépense affichée
        dans Meta Business Suite pour le même nom de campagne. Le rapport des
        deux vous donne le ROAS réel — celui qui compte, puisqu'il repose sur
        des paiements encaissés et non sur des conversions déclarées.
      </Encart>
    </div>
  );
}

/* ═══════════════ Rapports ═══════════════ */

function Rapports({ d }: { d: Donnees }) {
  const max = Math.max(1, ...d.campagnes.map(c => c.revenus));

  return (
    <div className="space-y-5">
      <Titre icone={TrendingUp} titre="Comparaison des campagnes">
        Classées par revenus réellement encaissés.
      </Titre>

      {d.campagnes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune donnée disponible.</p>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          {d.campagnes.slice(0, 10).map((c, i) => (
            <div key={i}>
              <div className="flex items-baseline justify-between text-sm gap-3">
                <span className="truncate">{c.campagne}</span>
                <span className="tabular-nums font-semibold shrink-0">{formatPrice(c.revenus)}</span>
              </div>
              <div className="h-2.5 rounded-full bg-secondary mt-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-gold"
                  style={{ width: `${Math.max(2, (c.revenus / max) * 100)}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {c.inscrits} inscrit(s) · {c.abonnes} abonné(s)
              </p>
            </div>
          ))}
        </div>
      )}

      <Encart ton="info" titre="Export">
        Les données affichées ici proviennent de `admin_meta_ads`. Un export
        CSV peut être ajouté ; il n'existe pas encore, et je préfère l'écrire
        que le laisser croire.
      </Encart>
    </div>
  );
}

/* ═══════════════ Tests & Diagnostic ═══════════════ */

function Tests({ d, pixelOk, capiOk }: { d: Donnees; pixelOk: boolean; capiOk: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [resultats, setResultats] = useState<{ nom: string; ok: boolean; message: string }[]>([]);

  const tester = async (nom: string) => {
    setBusy(nom);
    try {
      const { data, error } = await supabase.functions.invoke("meta-capi", {
        body: {
          event_name: nom === "Pixel" ? "TestEvent" : nom,
          event_id: `test_${nom.toLowerCase()}_${Date.now()}`,
          test: true,
        },
      });

      const r = data as any;
      const ok = !error && r?.ok === true;
      setResultats(prev => [
        {
          nom,
          ok,
          message: ok
            ? `Reçu par Meta${r?.test ? " (mode test)" : ""}`
            : r?.raison === "non_configure"
              ? "Meta n'est pas configuré — renseignez le Pixel et activez Conversions API"
              : r?.message ?? error?.message ?? "Échec de l'envoi",
        },
        ...prev.slice(0, 9),
      ]);
    } catch (e: any) {
      setResultats(prev => [{ nom, ok: false, message: e?.message ?? "Erreur" }, ...prev.slice(0, 9)]);
    } finally {
      setBusy(null);
    }
  };

  const score = calculerSante(d, pixelOk, capiOk);

  return (
    <div className="space-y-5">
      {/* Santé */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold">Santé du tracking</h3>
          <span className={`font-serif text-3xl font-bold tabular-nums ${
            score.note >= 80 ? "text-emerald-600" : score.note >= 50 ? "text-gold" : "text-destructive"
          }`}>
            {score.note} / 100
          </span>
        </div>

        <div className="mt-4 space-y-2">
          {score.points.map((p, i) => (
            <div key={i} className="flex items-start gap-2.5 text-sm">
              <span className="shrink-0 mt-0.5">
                {p.ton === "ok" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  : p.ton === "attention" ? <AlertTriangle className="w-4 h-4 text-gold" />
                  : <XCircle className="w-4 h-4 text-destructive" />}
              </span>
              <span className={p.ton === "erreur" ? "text-destructive" : ""}>{p.texte}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Boutons de test */}
      <section>
        <Titre icone={FlaskConical} titre="Envoyer un événement de test">
          Les envois portent le Test Event Code : ils apparaissent dans l'outil
          de test de Meta sans entrer dans les statistiques de vos campagnes.
        </Titre>

        <div className="flex flex-wrap gap-2 mt-4">
          {["Pixel", "CompleteRegistration", "CompleteProfile", "Like", "Match", "InitiateCheckout"]
            .map(nom => (
              <button
                key={nom}
                onClick={() => tester(nom)}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card text-sm hover:border-primary/50 disabled:opacity-50"
              >
                {busy === nom && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Tester {nom}
              </button>
            ))}
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          <strong>Purchase n'est pas testable d'ici</strong> : il n'est accepté
          que depuis le webhook de paiement. C'est précisément ce qui garantit
          qu'aucune vente n'est comptée sans encaissement.
        </p>

        {resultats.length > 0 && (
          <div className="mt-4 rounded-2xl border border-border bg-card divide-y divide-border/60">
            {resultats.map((r, i) => (
              <div key={i} className="px-4 py-2.5 flex items-start gap-2.5 text-sm">
                {r.ok
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  : <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />}
                <span className="min-w-0">
                  <strong>{r.nom}</strong>
                  <span className="text-muted-foreground"> — {r.message}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Score de santé.
 *
 * Chaque manquement retire des points en proportion de ce qu'il coûte
 * réellement. L'absence de Purchase pèse le plus lourd : sans lui, Meta
 * optimise les campagnes sans jamais savoir ce qui se vend.
 */
function calculerSante(d: Donnees, pixelOk: boolean, capiOk: boolean) {
  const points: { ton: "ok" | "attention" | "erreur"; texte: string }[] = [];
  let note = 100;

  if (pixelOk) points.push({ ton: "ok", texte: "Pixel connecté" });
  else { note -= 30; points.push({ ton: "erreur", texte: "Pixel non configuré" }); }

  if (capiOk) points.push({ ton: "ok", texte: "Conversions API active" });
  else { note -= 25; points.push({ ton: "attention", texte: "Conversions API inactive — une part des conversions échappe à Meta" }); }

  const s = d.sante;
  if (s.envoyes_24h > 0) {
    const taux = Math.round((s.reussis_24h / s.envoyes_24h) * 100);
    if (taux >= 95) points.push({ ton: "ok", texte: `${taux} % des envois réussis sur 24 h` });
    else if (taux >= 80) { note -= 10; points.push({ ton: "attention", texte: `${100 - taux} % des envois échouent` }); }
    else { note -= 20; points.push({ ton: "erreur", texte: `${100 - taux} % des envois échouent` }); }
  } else {
    note -= 10;
    points.push({ ton: "attention", texte: "Aucun événement envoyé ces 24 dernières heures" });
  }

  if (s.paiements_24h > 0 && s.achats_24h === 0) {
    note -= 35;
    points.push({
      ton: "erreur",
      texte: `${s.paiements_24h} paiement(s) encaissé(s) et aucun Purchase transmis — vos campagnes optimisent à l'aveugle`,
    });
  } else if (s.achats_24h > 0) {
    points.push({ ton: "ok", texte: `${s.achats_24h} achat(s) transmis à Meta sur 24 h` });
  }

  return { note: Math.max(0, note), points };
}

/* ═══════════════ Éléments réutilisés ═══════════════ */

function Titre({ icone: I, titre, children }: { icone: any; titre: string; children?: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-serif font-semibold flex items-center gap-2">
        <I className="w-5 h-5 text-primary" /> {titre}
      </h2>
      {children && <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">{children}</p>}
    </div>
  );
}

function Carte({ v, l, accent }: { v: string; l: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
      <div className="text-2xl font-serif font-bold tabular-nums">{v}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{l}</div>
    </div>
  );
}

/** Métrique indisponible. Un tiret, jamais un nombre inventé. */
function CarteVide({ l }: { l: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-4">
      <div className="text-2xl font-serif font-bold text-muted-foreground/40">—</div>
      <div className="text-xs text-muted-foreground mt-0.5">{l}</div>
      <div className="text-[10px] text-muted-foreground/70 mt-1">Connexion Meta requise</div>
    </div>
  );
}

function Statut({ label, ok, texteOk = "Connecté", texteKo = "Inactif" }: {
  label: string; ok: boolean; texteOk?: string; texteKo?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-center gap-1.5 mt-1.5">
        <span className={`w-2 h-2 rounded-full ${ok ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
        <span className={`text-sm font-semibold ${ok ? "" : "text-muted-foreground"}`}>
          {ok ? texteOk : texteKo}
        </span>
      </div>
    </div>
  );
}

function Pastille({ ton, children }: { ton: "ok" | "attention" | "neutre"; children: React.ReactNode }) {
  const cls = ton === "ok" ? "bg-emerald-500/15 text-emerald-600"
    : ton === "attention" ? "bg-gold/20 text-gold"
    : "bg-secondary text-muted-foreground";
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>{children}</span>;
}

function Encart({ ton, titre, children }: {
  ton: "ok" | "info" | "attention" | "erreur"; titre: string; children: React.ReactNode;
}) {
  const cls = ton === "ok" ? "border-emerald-500/40 bg-emerald-500/5"
    : ton === "attention" ? "border-gold/40 bg-gold/5"
    : ton === "erreur" ? "border-destructive/40 bg-destructive/5"
    : "border-border bg-secondary/40";
  const I = ton === "ok" ? CheckCircle2 : ton === "erreur" ? XCircle : ton === "attention" ? AlertTriangle : Info;
  const couleur = ton === "ok" ? "text-emerald-600" : ton === "erreur" ? "text-destructive"
    : ton === "attention" ? "text-gold" : "text-primary";

  return (
    <div className={`rounded-2xl border p-4 flex gap-3 mt-4 ${cls}`}>
      <I className={`w-5 h-5 shrink-0 mt-0.5 ${couleur}`} />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{titre}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

function Champ({ label, aide, children }: { label: string; aide?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      <div className="mt-1.5">{children}</div>
      {aide && <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{aide}</p>}
    </div>
  );
}

function depuis(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

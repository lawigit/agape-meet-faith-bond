import { useEffect, useState } from "react";
import {
  Mail, AlertTriangle, Search, ChevronLeft, ChevronRight, Send,
  MailCheck, MailOpen, MousePointerClick, MailX, ShieldAlert, Clock,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

/**
 * Traçabilité des e-mails — du départ à l'ouverture.
 *
 * TROIS NIVEAUX DE LECTURE, et c'est délibéré.
 *
 * 1. Les compteurs disent l'état de santé général.
 * 2. Le tableau par modèle dit QUEL message fonctionne — c'est le seul
 *    endroit où l'on décide quoi réécrire.
 * 3. La liste détaillée répond à « qu'est devenu l'e-mail de cette
 *    personne ? », la question qui se pose quand quelqu'un écrit au
 *    support en disant n'avoir rien reçu.
 *
 * LES TAUX SONT RAPPORTÉS AUX MESSAGES DÉLIVRÉS, pas aux envois.
 * Rapporter les ouvertures aux envois ferait chuter le taux à cause
 * d'adresses mortes, et masquerait la performance réelle du message.
 */

type Modele = {
  template: string; categorie: string; envoyes: number; delivres: number;
  ouverts: number; cliques: number; rebonds: number; plaintes: number;
  dernier: string;
};

type Donnees = {
  periode_jours: number;
  envoyes: number; delivres: number; ouverts: number; cliques: number;
  rebonds: number; plaintes: number; supprimes: number;
  modeles: Modele[];
  categories: { categorie: string; envoyes: number; ouverts: number; plaintes: number }[];
  incidents: { email: string; template: string; statut: string; motif: string | null; date: string }[];
};

type Ligne = {
  id: string; email: string; prenom: string | null;
  categorie: string; template: string; statut: string;
  envoye_le: string; delivre_le: string | null; ouvert_le: string | null;
  clique_le: string | null; rebond_le: string | null; plainte_le: string | null;
  motif: string | null; resend_id: string | null;
};

const STATUTS: Record<string, { label: string; classe: string; icone: any }> = {
  sent:       { label: "Envoyé",   classe: "bg-secondary text-muted-foreground", icone: Send },
  delivered:  { label: "Délivré",  classe: "bg-sky-500/10 text-sky-600", icone: MailCheck },
  opened:     { label: "Ouvert",   classe: "bg-emerald-500/10 text-emerald-600", icone: MailOpen },
  clicked:    { label: "Cliqué",   classe: "bg-primary/10 text-primary", icone: MousePointerClick },
  bounced:    { label: "Rejeté",   classe: "bg-gold/15 text-gold-foreground", icone: MailX },
  complained: { label: "Plainte",  classe: "bg-destructive/10 text-destructive", icone: ShieldAlert },
};

const PAGE = 50;

function pct(n: number, base: number) {
  return base > 0 ? Math.round((n / base) * 100) : 0;
}

function dateCourte(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export function TracabiliteEmails({ days }: { days: number }) {
  const [d, setD] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState(false);

  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [statut, setStatut] = useState<string | null>(null);
  const [modele, setModele] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [chargeListe, setChargeListe] = useState(false);
  const [detail, setDetail] = useState<Ligne | null>(null);

  useEffect(() => {
    let annule = false;
    supabase.rpc("admin_emails", { p_days: days }).then(({ data, error }: any) => {
      if (annule) return;
      if (error || data?.error) { console.error("[admin/emails]", error ?? data); setErreur(true); return; }
      setErreur(false);
      setD(data as Donnees);
    });
    return () => { annule = true; };
  }, [days]);

  // Recherche décalée de 400 ms : sans cela, chaque frappe partirait en
  // requête et la liste clignoterait à chaque lettre.
  useEffect(() => {
    const t = setTimeout(() => { setPage(0); chargerListe(0); }, 400);
    return () => clearTimeout(t);
  }, [recherche, statut, modele, days]);

  async function chargerListe(p: number) {
    setChargeListe(true);
    const { data, error } = await supabase.rpc("admin_emails_liste", {
      p_days: days,
      p_statut: statut,
      p_template: modele,
      p_recherche: recherche.trim() || null,
      p_limit: PAGE,
      p_offset: p * PAGE,
    });
    setChargeListe(false);

    if (error || (data as any)?.error) { console.error("[admin/emails] liste", error ?? data); return; }
    setLignes((data as any).lignes ?? []);
    setTotal((data as any).total ?? 0);
  }

  if (erreur) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-gold shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          Traçabilité indisponible. Les migrations <code>30</code> et{" "}
          <code>71_tracabilite_emails.sql</code> ont-elles été exécutées ?
        </p>
      </section>
    );
  }

  if (!d) return <div className="h-64 rounded-2xl bg-secondary animate-pulse" />;

  const base = d.delivres || d.envoyes;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-serif font-semibold flex items-center gap-2">
          <Mail className="w-5 h-5 text-primary" /> Traçabilité des e-mails
        </h2>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
          Chaque message envoyé, et ce qu'il est devenu. Les taux sont
          calculés sur les messages <strong>délivrés</strong> : les rapporter
          aux envois ferait baisser le score à cause d'adresses mortes.
        </p>
      </div>

      {/* ── Compteurs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Petite v={String(d.envoyes)} l={`Envoyés sur ${d.periode_jours} j`} />
        <Petite v={`${pct(d.delivres, d.envoyes)} %`} l={`Délivrés · ${d.delivres}`} />
        <Petite v={`${pct(d.ouverts, base)} %`} l={`Ouverts · ${d.ouverts}`} />
        <Petite v={`${pct(d.cliques, base)} %`} l={`Cliqués · ${d.cliques}`} />
        <Petite v={String(d.rebonds)} l="Rejetés" alerte={d.rebonds > 0} />
        {/* Le seuil Gmail est 0,3 % : au-delà, le domaine est déclassé et
            les e-mails de confirmation d'inscription cessent d'arriver. */}
        <Petite
          v={`${d.envoyes > 0 ? (d.plaintes * 100 / d.envoyes).toFixed(2) : "0"} %`}
          l={`Plaintes · ${d.plaintes}`}
          alerte={d.envoyes > 0 && d.plaintes / d.envoyes > 0.003}
        />
      </div>

      {d.envoyes > 0 && d.plaintes / d.envoyes > 0.003 && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 flex gap-3">
          <ShieldAlert className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Taux de plaintes au-dessus de 0,3 %.</strong>{" "}
            C'est le seuil à partir duquel Gmail déclasse un domaine. Vos
            e-mails d'authentification partant de la même adresse, les
            confirmations d'inscription cesseraient d'arriver. Réduisez la
            fréquence des envois facultatifs.
          </p>
        </div>
      )}

      {/* ── Par modèle ── */}
      <div className="rounded-2xl border border-border bg-card overflow-x-auto">
        <div className="p-5 pb-2">
          <h3 className="text-sm font-semibold">Par message</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Cliquez une ligne pour filtrer le détail ci-dessous.
          </p>
        </div>

        {d.modeles.length === 0 ? (
          <p className="text-sm text-muted-foreground px-5 pb-5">
            Aucun envoi sur la période.
          </p>
        ) : (
          <table className="w-full text-sm min-w-[46rem]">
            <thead>
              <tr className="border-y border-border">
                {["Message", "Catégorie", "Envoyés", "Délivrés", "Ouverts", "Cliqués", "Rejetés", "Plaintes", "Dernier"]
                  .map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {h}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {d.modeles.map(m => (
                <tr
                  key={m.template}
                  onClick={() => setModele(modele === m.template ? null : m.template)}
                  className={`border-b border-border/60 last:border-0 cursor-pointer hover:bg-secondary/40 transition-colors ${
                    modele === m.template ? "bg-primary/5" : ""}`}
                >
                  <td className="px-4 py-3 font-medium"><code className="text-xs">{m.template}</code></td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{m.categorie}</td>
                  <td className="px-4 py-3 tabular-nums font-semibold">{m.envoyes}</td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {m.delivres} <span className="text-[11px]">({pct(m.delivres, m.envoyes)} %)</span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    <span className={pct(m.ouverts, m.delivres || m.envoyes) >= 25 ? "text-emerald-600 font-semibold" : ""}>
                      {pct(m.ouverts, m.delivres || m.envoyes)} %
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{pct(m.cliques, m.delivres || m.envoyes)} %</td>
                  <td className={`px-4 py-3 tabular-nums ${m.rebonds > 0 ? "text-gold-foreground" : "text-muted-foreground"}`}>
                    {m.rebonds}
                  </td>
                  <td className={`px-4 py-3 tabular-nums ${m.plaintes > 0 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                    {m.plaintes}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-muted-foreground">{dateCourte(m.dernier)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Détail ── */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="p-5 pb-3 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-semibold">
              Détail des envois
              {modele && (
                <button onClick={() => setModele(null)}
                        className="ml-2 text-[11px] font-normal bg-primary/10 text-primary rounded-full px-2 py-0.5">
                  {modele} ✕
                </button>
              )}
            </h3>
            <span className="text-xs text-muted-foreground tabular-nums">
              {total} résultat{total > 1 ? "s" : ""}
            </span>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={recherche}
              onChange={e => setRecherche(e.target.value)}
              placeholder="Rechercher une adresse…"
              className="w-full rounded-xl border border-border bg-background pl-9 pr-4 py-2.5 text-sm"
            />
          </div>

          <div className="flex gap-1.5 flex-wrap">
            <Chip actif={statut === null} onClick={() => setStatut(null)} label="Tous" />
            {Object.entries(STATUTS).map(([k, s]) => (
              <Chip key={k} actif={statut === k} onClick={() => setStatut(statut === k ? null : k)} label={s.label} />
            ))}
          </div>
        </div>

        {chargeListe ? (
          <div className="px-5 pb-5 space-y-2">
            {[0, 1, 2].map(i => <div key={i} className="h-12 rounded-xl bg-secondary animate-pulse" />)}
          </div>
        ) : lignes.length === 0 ? (
          <p className="text-sm text-muted-foreground px-5 pb-5">Aucun envoi correspondant.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[44rem]">
              <thead>
                <tr className="border-y border-border">
                  {["Destinataire", "Message", "Statut", "Envoyé", "Ouvert"].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map(l => {
                  const s = STATUTS[l.statut] ?? STATUTS.sent;
                  return (
                    <tr key={l.id}
                        onClick={() => setDetail(l)}
                        className="border-b border-border/60 last:border-0 cursor-pointer hover:bg-secondary/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium truncate max-w-[16rem]">{l.email}</div>
                        {l.prenom && <div className="text-[11px] text-muted-foreground">{l.prenom}</div>}
                      </td>
                      <td className="px-4 py-3"><code className="text-xs">{l.template}</code></td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.classe}`}>
                          <s.icone className="w-3 h-3" /> {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[11px] text-muted-foreground">{dateCourte(l.envoye_le)}</td>
                      <td className="px-4 py-3 text-[11px] text-muted-foreground">{dateCourte(l.ouvert_le)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGE && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
            <button
              onClick={() => { const p = page - 1; setPage(p); chargerListe(p); }}
              disabled={page === 0}
              className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg hover:bg-secondary disabled:opacity-40 transition">
              <ChevronLeft className="w-4 h-4" /> Précédent
            </button>
            <span className="text-xs text-muted-foreground tabular-nums">
              {page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} sur {total}
            </span>
            <button
              onClick={() => { const p = page + 1; setPage(p); chargerListe(p); }}
              disabled={(page + 1) * PAGE >= total}
              className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg hover:bg-secondary disabled:opacity-40 transition">
              Suivant <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* ── Incidents ── */}
      {d.incidents.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-gold" /> Incidents récents
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Rebonds et plaintes. Ces adresses sont écartées automatiquement
            des envois suivants.
          </p>
          <div className="mt-3 divide-y divide-border/60">
            {d.incidents.slice(0, 12).map((i, k) => (
              <div key={k} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate">{i.email}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {i.template}{i.motif ? ` · ${i.motif}` : ""}
                  </div>
                </div>
                <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full ${
                  i.statut === "complained" ? "bg-destructive/10 text-destructive"
                                            : "bg-gold/15 text-gold-foreground"}`}>
                  {i.statut === "complained" ? "Plainte" : "Rejeté"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {detail && <FicheEnvoi l={detail} onClose={() => setDetail(null)} />}
    </section>
  );
}

/* ─────────────── Fiche d'un envoi ─────────────── */

function FicheEnvoi({ l, onClose }: { l: Ligne; onClose: () => void }) {
  const [evenements, setEvenements] = useState<any[] | null>(null);

  useEffect(() => {
    if (!l.resend_id) { setEvenements([]); return; }
    supabase.rpc("admin_email_evenements", { p_resend_id: l.resend_id })
      .then(({ data }: any) => setEvenements(Array.isArray(data) ? data : []));
  }, [l.resend_id]);

  // La chronologie DÉDUITE du résumé, pour que la fiche reste lisible
  // même quand les événements bruts n'ont pas été rattachés.
  const etapes = [
    { label: "Envoyé", date: l.envoye_le, icone: Send },
    { label: "Délivré", date: l.delivre_le, icone: MailCheck },
    { label: "Ouvert", date: l.ouvert_le, icone: MailOpen },
    { label: "Cliqué", date: l.clique_le, icone: MousePointerClick },
    { label: "Rejeté", date: l.rebond_le, icone: MailX },
    { label: "Plainte", date: l.plainte_le, icone: ShieldAlert },
  ].filter(e => e.date);

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
         onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 max-h-[85vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        <h3 className="font-serif text-lg font-semibold truncate">{l.email}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          <code>{l.template}</code> · {l.categorie}
        </p>

        <div className="mt-4 space-y-3">
          {etapes.map((e, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-secondary grid place-items-center shrink-0">
                <e.icone className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{e.label}</div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {dateCourte(e.date)}
                </div>
              </div>
            </div>
          ))}
        </div>

        {l.motif && (
          <p className="mt-4 text-xs bg-destructive/5 text-destructive rounded-xl px-3 py-2">
            Motif du rejet : {l.motif}
          </p>
        )}

        {evenements && evenements.length > 0 && (
          <div className="mt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Événements bruts
            </h4>
            <div className="mt-2 space-y-1">
              {evenements.map((e, i) => (
                <div key={i} className="text-[11px] text-muted-foreground flex justify-between gap-2">
                  <code>{e.type}</code>
                  <span className="tabular-nums shrink-0">{dateCourte(e.date)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!l.resend_id && (
          <p className="mt-4 text-[11px] text-muted-foreground leading-relaxed">
            Aucun identifiant Resend n'a été enregistré pour cet envoi : son
            suivi s'arrête au départ. Les messages envoyés après la mise en
            place de la traçabilité sont suivis intégralement.
          </p>
        )}

        <button onClick={onClose}
                className="mt-5 w-full py-2.5 rounded-xl bg-secondary text-sm font-semibold hover:bg-secondary/70 transition">
          Fermer
        </button>
      </div>
    </div>
  );
}

function Chip({ actif, onClick, label }: { actif: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        actif ? "bg-primary text-primary-foreground border-primary"
              : "bg-card border-border text-muted-foreground hover:border-primary/50"}`}>
      {label}
    </button>
  );
}

function Petite({ v, l, alerte }: { v: string; l: string; alerte?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${alerte ? "border-gold/40 bg-gold/5" : "border-border bg-card"}`}>
      <div className="text-xl font-serif font-bold tabular-nums">{v}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{l}</div>
    </div>
  );
}

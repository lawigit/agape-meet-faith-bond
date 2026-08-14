import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Megaphone, Send, Users, MailCheck, AlertTriangle, Loader2, RefreshCw,
  Activity, Info, TrendingDown, Target, BellRing, Wallet, Radio,
  ArrowRight, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth";
import { formatPrice } from "@/lib/plans";
import { TracabiliteEmails } from "@/components/admin/TracabiliteEmails";

export const Route = createFileRoute("/admin/marketing")({
  component: AdminMarketing,
});

/**
 * Marketing — cinq angles, pas un seul.
 *
 * Cette page ne connaissait que l'e-mail. Elle ignorait les
 * notifications push, pourtant en place, et n'avait aucune notion
 * d'acquisition, d'activation ni de segment : on ne pouvait qu'envoyer
 * le même message à tout le monde.
 *
 * L'ordre des sections suit la vie d'un membre — d'où il vient, ce qu'il
 * fait, ce qu'on lui envoie, ce que ça rapporte. Les chiffres bruts
 * ouvrent la page ; l'action vient après, jamais l'inverse.
 */

type Marketing = {
  periode_jours: number;
  portee: { membres: number; email: number; push: number; joignables: number; taux: number };
  acquisition: { source: string; n: number; periode: number; payants: number }[];
  entonnoir: {
    inscrits: number; photo: number; swipe: number;
    match: number; message: number; payant: number;
  };
  segments: { cle: string; label: string; n: number; quoi: string }[];
  campagnes: {
    total: number; periode: number;
    destinataires: number; delivres: number; ignores: number;
  };
  delivrabilite: {
    supprimes: number; rebonds: number; plaintes: number;
    envois_30j: number; taux_plainte: number;
  };
  revenus: { periode: number; total: number; payants: number; panier: number };
};

type Campaign = {
  id: string; subject: string; body: string; status: string;
  recipients: number; delivered: number; skipped: number;
  segment?: string; channel?: string;
  created_at: string; sent_at: string | null;
};

/** Libellés des sources collectées à l'inscription. */
const SOURCES: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  whatsapp: "WhatsApp",
  recommandation: "Recommandation",
  autre: "Autre",
  inconnu: "Non renseigné",
};

const RANGES = [7, 30, 90] as const;

function AdminMarketing() {
  const [d, setD] = useState<Marketing | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [days, setDays] = useState<number>(30);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [segment, setSegment] = useState("tous");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (n: number) => {
    setError(null);
    const [{ data: m, error: mErr }, { data: c }] = await Promise.all([
      supabase.rpc("admin_marketing", { p_days: n }),
      supabase.from("campaigns").select("*").order("created_at", { ascending: false }).limit(20),
    ]);

    if (mErr || (m as any)?.error) {
      console.error("[admin/marketing]", mErr ?? m);
      setError("Lecture impossible. La migration 63 a-t-elle été exécutée, et avez-vous le rôle administrateur ?");
      setLoading(false);
      return;
    }

    setD(m as Marketing);
    setCampaigns((c ?? []) as Campaign[]);
    setLoading(false);
  };

  useEffect(() => { load(days); }, [days]);

  const cible = d?.segments.find(s => s.cle === segment);
  const nbCible = segment === "tous" ? (d?.portee.email ?? 0) : (cible?.n ?? 0);

  const send = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error("Un objet et un message sont nécessaires");
      return;
    }
    if (nbCible === 0) {
      toast.error("Ce segment ne contient personne");
      return;
    }

    const ok = window.confirm(
      `Envoyer « ${subject.trim()} » à ${nbCible} membre(s) — segment « ${segment === "tous" ? "Tous les inscrits au marketing" : cible?.label}» ?\n\n` +
      `Un envoi ne peut pas être annulé.`,
    );
    if (!ok) return;

    setSending(true);
    try {
      const userId = await getCurrentUserId();

      const { data: campaign, error: cErr } = await supabase
        .from("campaigns")
        .insert({
          subject: subject.trim(), body: body.trim(),
          created_by: userId, segment, channel: "email",
        })
        .select()
        .single();

      if (cErr || !campaign) throw cErr ?? new Error("Création de la campagne impossible");

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-campaign`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
          body: JSON.stringify({ campaignId: campaign.id }),
        },
      );

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "L'envoi a échoué");

      toast.success(`Campagne envoyée à ${json.delivered} membre(s)`, {
        description: json.skipped > 0
          ? `${json.skipped} ignoré(s) — désabonnés, adresses écartées ou plafond atteint`
          : undefined,
      });
      setSubject(""); setBody("");
      load(days);
    } catch (e: any) {
      console.error("[admin/marketing] envoi:", e);
      toast.error(e?.message ?? "L'envoi a échoué");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-serif font-bold">Marketing</h1>
          <p className="text-muted-foreground mt-1 text-sm max-w-xl">
            D'où viennent vos membres, où vous les perdez, et à qui parler
            en priorité.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex rounded-xl border border-border overflow-hidden">
            {RANGES.map(r => (
              <button
                key={r}
                onClick={() => setDays(r)}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  days === r ? "bg-primary text-primary-foreground" : "bg-card hover:bg-secondary"
                }`}
              >
                {r} j
              </button>
            ))}
          </div>
          <button
            onClick={() => load(days)}
            className="p-2 rounded-xl border border-border bg-card hover:bg-secondary transition-colors"
            aria-label="Actualiser"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-secondary animate-pulse" />)}
          </div>
          <div className="h-72 rounded-2xl bg-secondary animate-pulse" />
        </div>
      ) : d && (
        <>
          {/* ══ 1. Portée ══ */}
          <section>
            <Titre icone={Radio} titre="Qui pouvez-vous joindre">
              Un membre joignable par e-mail ET par push n'est compté qu'une
              fois : additionner les deux canaux surestimerait la portée réelle.
            </Titre>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-4">
              <Carte icone={Users} label="Membres" valeur={String(d.portee.membres)} />
              <Carte icone={MailCheck} label="Consentement e-mail" valeur={String(d.portee.email)}
                     detail={`${pct(d.portee.email, d.portee.membres)} % des membres`} />
              <Carte icone={BellRing} label="Abonnés au push" valeur={String(d.portee.push)}
                     detail={`${pct(d.portee.push, d.portee.membres)} % des membres`} />
              <Carte icone={Target} label="Joignables" valeur={`${d.portee.taux} %`}
                     detail={`${d.portee.joignables} par au moins un canal`}
                     accent />
            </div>

            {d.portee.push === 0 && (
              <Note>
                Aucun abonné aux notifications push. C'est le canal le plus
                efficace et le seul qui ne dépende pas de la délivrabilité
                e-mail — vérifiez que les migrations 58 à 61 sont exécutées et
                que le site est déployé.
              </Note>
            )}
          </section>

          {/* ══ 2. Acquisition ══ */}
          <section>
            <Titre icone={Sparkles} titre="D'où viennent vos membres">
              Réponse à la question posée à l'inscription. C'est la seule
              donnée qui indique où placer un budget publicitaire.
            </Titre>

            {d.acquisition.every(a => a.source === "inconnu") ? (
              <Note>
                Aucune source enregistrée pour l'instant. La question était
                posée à l'inscription mais la réponse n'était pas conservée —
                c'est corrigé, les prochains inscrits apparaîtront ici.
              </Note>
            ) : (
              <div className="mt-4 rounded-2xl border border-border bg-card divide-y divide-border/60">
                {d.acquisition.map(a => {
                  const conv = a.n > 0 ? Math.round((a.payants / a.n) * 100) : 0;
                  return (
                    <div key={a.source} className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                      <div className="min-w-[9rem]">
                        <p className="font-medium text-sm">{SOURCES[a.source] ?? a.source}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {a.periode} sur {d.periode_jours} jours
                        </p>
                      </div>
                      <div className="flex-1 min-w-[8rem]">
                        <div className="h-2 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full bg-primary rounded-full"
                               style={{ width: `${pct(a.n, d.portee.membres)}%` }} />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums">{a.n}</p>
                        <p className="text-[11px] text-muted-foreground">membres</p>
                      </div>
                      {/* Le volume ne suffit pas : une source peut amener
                          beaucoup de monde et aucun abonné. */}
                      <div className="text-right w-20">
                        <p className={`font-semibold tabular-nums ${conv >= 5 ? "text-emerald-600" : ""}`}>
                          {conv} %
                        </p>
                        <p className="text-[11px] text-muted-foreground">payants</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ══ 3. Activation ══ */}
          <section>
            <Titre icone={TrendingDown} titre="Où vous perdez les inscrits">
              Membres inscrits sur la période, suivis marche par marche.
              C'est l'écart entre deux marches qui désigne le problème, pas
              le chiffre brut.
            </Titre>

            <div className="mt-4 rounded-2xl border border-border bg-card p-5 space-y-3">
              {[
                { l: "Inscrits", n: d.entonnoir.inscrits },
                { l: "Ont ajouté une photo", n: d.entonnoir.photo },
                { l: "Ont swipé", n: d.entonnoir.swipe },
                { l: "Ont eu un match", n: d.entonnoir.match },
                { l: "Ont écrit", n: d.entonnoir.message },
                { l: "Ont payé", n: d.entonnoir.payant },
              ].map((e, i, arr) => {
                const base = arr[0].n || 1;
                const largeur = Math.max(2, (e.n / base) * 100);
                const perte = i > 0 ? arr[i - 1].n - e.n : 0;
                const tauxPerte = i > 0 && arr[i - 1].n > 0
                  ? Math.round((perte / arr[i - 1].n) * 100) : 0;
                return (
                  <div key={e.l}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span>{e.l}</span>
                      <span className="tabular-nums font-semibold">
                        {e.n}
                        <span className="text-muted-foreground font-normal text-xs">
                          {" "}· {Math.round((e.n / base) * 100)} %
                        </span>
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-secondary mt-1.5 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60"
                           style={{ width: `${largeur}%` }} />
                    </div>
                    {i > 0 && perte > 0 && (
                      <p className={`text-[11px] mt-1 ${tauxPerte >= 50 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                        −{perte} à cette étape ({tauxPerte} %)
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ══ 4. Segments ══ */}
          <section>
            <Titre icone={Target} titre="À qui parler en priorité">
              Cliquez un segment pour le cibler dans le formulaire d'envoi.
              Les comptes suspendus et en pause en sont toujours exclus.
            </Titre>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-4">
              {d.segments.map(s => (
                <button
                  key={s.cle}
                  onClick={() => {
                    setSegment(s.cle);
                    document.getElementById("composer")?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                  className={`text-left rounded-2xl border p-4 transition-all ${
                    segment === s.cle
                      ? "border-primary bg-primary/5 shadow-soft"
                      : "border-border bg-card hover:border-primary/40"
                  } ${s.n === 0 ? "opacity-50" : ""}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium leading-snug">{s.label}</p>
                    <span className="font-serif text-xl font-bold tabular-nums shrink-0">{s.n}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">{s.quoi}</p>
                  {segment === s.cle && (
                    <p className="text-[11px] text-primary font-medium mt-2 inline-flex items-center gap-1">
                      Sélectionné <ArrowRight className="w-3 h-3" />
                    </p>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* ══ 5. Envoi ══ */}
          <section id="composer">
            <Titre icone={Send} titre="Envoyer une campagne">
              L'envoi part aux membres du segment ayant consenti au marketing.
              Les désabonnés et adresses écartées sont retirés côté serveur.
            </Titre>

            <div className="mt-4 rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Cible :</span>
                <button
                  onClick={() => setSegment("tous")}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    segment === "tous" ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/70"
                  }`}
                >
                  Tous les consentants · {d.portee.email}
                </button>
                {segment !== "tous" && cible && (
                  <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-primary text-primary-foreground">
                    {cible.label} · {cible.n}
                  </span>
                )}
              </div>

              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Objet — ce qui décide de l'ouverture"
                maxLength={120}
                className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={7}
                placeholder="Votre message. Une seule idée, un seul appel à l'action."
                className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Destinataires estimés : <strong className="text-foreground">{nbCible}</strong>
                </p>
                <button
                  onClick={send}
                  disabled={sending || !subject.trim() || !body.trim() || nbCible === 0}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {sending ? "Envoi en cours…" : "Envoyer"}
                </button>
              </div>
            </div>
          </section>

          {/* ══ 6. Santé et revenus ══ */}
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" /> Santé du domaine
              </h2>

              <div className="mt-4 space-y-2.5 text-sm">
                <Ligne l="Envois sur 30 jours" v={String(d.delivrabilite.envois_30j)} />
                <Ligne l="Adresses écartées" v={String(d.delivrabilite.supprimes)} />
                <Ligne l="Rebonds" v={String(d.delivrabilite.rebonds)} />
                <Ligne l="Plaintes" v={String(d.delivrabilite.plaintes)} />
              </div>

              <div className={`mt-4 rounded-xl p-3 text-xs leading-relaxed ${
                d.delivrabilite.taux_plainte >= 0.3
                  ? "bg-destructive/10 border border-destructive/40"
                  : "bg-secondary"
              }`}>
                Taux de plainte : <strong>{d.delivrabilite.taux_plainte} %</strong>
                {d.delivrabilite.taux_plainte >= 0.3 ? (
                  <> — au-dessus du seuil de 0,3 % de Gmail. Le domaine est en
                  danger, et avec lui les e-mails de confirmation d'inscription.
                  Suspendez les envois marketing.</>
                ) : (
                  <> — sous le seuil de 0,3 % fixé par Gmail. Au-delà, le domaine
                  est déclassé et les confirmations d'inscription cessent
                  d'arriver avec le reste.</>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Wallet className="w-4 h-4 text-primary" /> Ce que ça rapporte
              </h2>

              <div className="mt-4 space-y-2.5 text-sm">
                <Ligne l={`Revenus sur ${d.periode_jours} jours`} v={formatPrice(d.revenus.periode)} />
                <Ligne l="Revenus cumulés" v={formatPrice(d.revenus.total)} />
                <Ligne l="Membres ayant payé" v={String(d.revenus.payants)} />
                <Ligne l="Panier moyen" v={formatPrice(d.revenus.panier)} />
              </div>

              <div className="mt-4 pt-4 border-t border-border/60 space-y-2.5 text-sm">
                <Ligne l="Campagnes envoyées" v={String(d.campagnes.total)} />
                <Ligne l="Destinataires cumulés" v={String(d.campagnes.destinataires)} />
                <Ligne
                  l="Taux de délivrance"
                  v={d.campagnes.destinataires > 0
                    ? `${Math.round((d.campagnes.delivres / d.campagnes.destinataires) * 100)} %`
                    : "—"}
                />
              </div>
            </section>
          </div>

          {/* ══ 7. Traçabilité ══
              Placée AVANT l'historique des campagnes : savoir ce que sont
              devenus les messages déjà partis pèse plus, au quotidien,
              que la liste de ce qu'on a envoyé. */}
          <TracabiliteEmails days={days} />

          {/* ══ 8. Historique ══ */}
          <section>
            <Titre icone={Megaphone} titre="Campagnes passées" />
            {campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-4">Aucune campagne pour l'instant.</p>
            ) : (
              <div className="mt-4 rounded-2xl border border-border bg-card divide-y divide-border/60">
                {campaigns.map(c => (
                  <div key={c.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.subject}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString("fr-FR", {
                          day: "2-digit", month: "short", year: "numeric",
                        })}
                        {c.segment && c.segment !== "tous" && ` · segment ${c.segment}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-xs shrink-0">
                      <span className="tabular-nums">
                        <strong>{c.delivered}</strong> délivré{c.delivered > 1 ? "s" : ""}
                      </span>
                      {c.skipped > 0 && (
                        <span className="text-muted-foreground tabular-nums">{c.skipped} ignoré(s)</span>
                      )}
                      <StatutCampagne statut={c.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/* ─────────────── Éléments réutilisés ─────────────── */

const pct = (n: number, total: number) =>
  total > 0 ? Math.round((n / total) * 100) : 0;

function Titre({ icone: Icone, titre, children }: {
  icone: any; titre: string; children?: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-lg font-serif font-semibold flex items-center gap-2">
        <Icone className="w-5 h-5 text-primary" /> {titre}
      </h2>
      {children && (
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">{children}</p>
      )}
    </div>
  );
}

function Carte({ icone: Icone, label, valeur, detail, accent }: {
  icone: any; label: string; valeur: string; detail?: string; accent?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
      <Icone className="w-5 h-5 text-primary" />
      <div className="text-2xl font-serif font-bold mt-2 tabular-nums">{valeur}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {detail && <div className="text-[11px] text-muted-foreground mt-1">{detail}</div>}
    </div>
  );
}

function Ligne({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{l}</span>
      <span className="font-semibold tabular-nums">{v}</span>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-2xl border border-gold/40 bg-gold/5 p-4 flex gap-3">
      <Info className="w-4 h-4 text-gold shrink-0 mt-0.5" />
      <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

function StatutCampagne({ statut }: { statut: string }) {
  const m: Record<string, { l: string; c: string }> = {
    draft:   { l: "Brouillon", c: "bg-secondary text-muted-foreground" },
    sending: { l: "En cours",  c: "bg-gold/20 text-gold" },
    sent:    { l: "Envoyée",   c: "bg-emerald-500/15 text-emerald-600" },
    failed:  { l: "Échec",     c: "bg-destructive/10 text-destructive" },
  };
  const s = m[statut] ?? m.draft;
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.c}`}>{s.l}</span>;
}

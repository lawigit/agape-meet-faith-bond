import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft, Users, Gift, Copy, Check, Share2, Wallet,
  Clock, Lock, ArrowRight, Info,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatPrice } from "@/lib/plans";
import { lienParrainage } from "@/lib/parrainage";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/parrainage")({
  head: () => ({ meta: [{ title: "Parrainage — AgapeMeet" }] }),
  component: ParrainagePage,
});

type Donnees = {
  programme_actif: boolean;
  autorise?: boolean;
  code?: string;
  taux?: number;
  seuil?: number;
  maturation_jours?: number;
  filleuls_total?: number;
  filleuls_payants?: number;
  gains_total?: number;
  en_attente?: number;
  disponible?: number;
  paye?: number;
  retrait_en_cours?: boolean;
  filleuls?: { prenom: string; depuis: string | null; gains: number }[];
  historique?: {
    date: string; montant: number; base: number;
    taux: number; statut: string; mature_le: string;
  }[];
  retraits?: {
    montant: number; statut: string;
    demande_le: string; paye_le: string | null;
  }[];
};

function ParrainagePage() {
  const [d, setD] = useState<Donnees | null>(null);
  const [copie, setCopie] = useState(false);
  const [numero, setNumero] = useState("");
  const [envoi, setEnvoi] = useState(false);

  async function charger() {
    const { data, error } = await supabase.rpc("mon_parrainage");
    if (error) { console.error("[parrainage]", error); setD({ programme_actif: false }); return; }
    setD(data as Donnees);
  }

  useEffect(() => { charger(); }, []);

  if (!d) return <div className="max-w-3xl mx-auto p-4"><div className="h-64 rounded-2xl bg-secondary animate-pulse" /></div>;

  /* Programme éteint, ou membre non désigné : la page ne doit rien
     laisser deviner. Annoncer « vous n'êtes pas encore autorisé »
     donnerait envie de réclamer, et transformerait une invitation en
     source de frustration. */
  if (!d.programme_actif || !d.autorise) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <Entete />
        <div className="rounded-2xl border border-dashed border-border py-14 text-center">
          <Lock className="w-9 h-9 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground mt-4 max-w-sm mx-auto leading-relaxed">
            Le programme de parrainage n'est pas ouvert pour le moment.
          </p>
        </div>
      </div>
    );
  }

  const lien = lienParrainage(d.code!);
  const seuil = d.seuil ?? 3000;
  const dispo = d.disponible ?? 0;
  const atteint = dispo >= seuil;

  async function copier() {
    try {
      await navigator.clipboard.writeText(lien);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
      toast.success("Lien copié");
    } catch {
      toast.error("Copie impossible — sélectionnez le lien à la main");
    }
  }

  function partager() {
    const texte = `Rejoins-moi sur AgapeMeet, l'application de rencontre chrétienne. ${lien}`;
    if (navigator.share) {
      navigator.share({ title: "AgapeMeet", text: texte, url: lien }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(texte)}`, "_blank");
    }
  }

  async function retirer() {
    setEnvoi(true);
    const { data, error } = await supabase.rpc("demander_retrait", { p_numero: numero });
    setEnvoi(false);

    if (error) { toast.error("Demande impossible"); return; }

    const r = data as any;
    if (!r?.ok) {
      const messages: Record<string, string> = {
        sous_le_seuil: `Il faut atteindre ${formatPrice(seuil)} pour demander un retrait.`,
        demande_en_cours: "Une demande est déjà en cours de traitement.",
        numero_invalide: "Numéro Mobile Money invalide.",
        non_autorise: "Votre code de parrainage n'est plus actif.",
      };
      toast.error(messages[r?.raison] ?? "Demande refusée");
      return;
    }

    toast.success(`Demande de ${formatPrice(r.montant)} envoyée`);
    setNumero("");
    charger();
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-5 pb-24">
      <Entete />

      {/* ── Le lien, tout en haut ──
          C'est la seule chose que le membre vient chercher. Tout le
          reste — soldes, historique — ne sert qu'après le partage. */}
      <section className="rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/10 to-transparent p-5">
        <div className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-gold" />
          <h2 className="font-serif font-semibold">Votre lien de parrainage</h2>
        </div>

        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          Vous recevez <strong className="text-foreground">{d.taux ?? 20} %</strong> sur
          chaque abonnement de vos filleuls — <strong className="text-foreground">à vie</strong>,
          à chaque renouvellement, aussi longtemps qu'ils restent abonnés.
        </p>

        <div className="mt-4 flex items-center gap-2 rounded-xl bg-background border border-border px-3 py-2.5">
          <code className="text-xs sm:text-sm flex-1 truncate select-all">{lien}</code>
          <button onClick={copier}
                  className="shrink-0 p-2 rounded-lg hover:bg-secondary transition"
                  aria-label="Copier le lien">
            {copie ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        <button onClick={partager}
                className="mt-3 w-full rounded-xl bg-gold text-background font-semibold py-3 flex items-center justify-center gap-2 hover:opacity-90 transition">
          <Share2 className="w-4 h-4" /> Partager
        </button>

        <p className="text-[11px] text-muted-foreground mt-3">
          Code : <strong className="text-foreground tracking-widest">{d.code}</strong>
        </p>
      </section>

      {/* ── Soldes ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Carte v={formatPrice(dispo)} l="Disponible" fort />
        <Carte v={formatPrice(d.en_attente ?? 0)} l={`En attente (${d.maturation_jours ?? 7} j)`} />
        <Carte v={formatPrice(d.paye ?? 0)} l="Déjà versé" />
        <Carte v={String(d.filleuls_total ?? 0)} l="Filleuls" />
      </div>

      {/* ── Retrait ── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" />
          <h2 className="font-serif font-semibold">Retirer mes gains</h2>
        </div>

        {d.retrait_en_cours ? (
          <div className="mt-3 flex gap-3 rounded-xl bg-secondary p-4">
            <Clock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Votre demande est en cours de traitement. Le versement est
              effectué manuellement par Mobile Money.
            </p>
          </div>
        ) : atteint ? (
          <>
            <p className="text-sm text-muted-foreground mt-2">
              Vous pouvez retirer <strong className="text-foreground">{formatPrice(dispo)}</strong>.
            </p>
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <input
                value={numero}
                onChange={e => setNumero(e.target.value)}
                inputMode="tel"
                placeholder="Numéro Mobile Money"
                className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm"
              />
              <button
                onClick={retirer}
                disabled={envoi || numero.trim().length < 8}
                className="rounded-xl bg-primary text-primary-foreground font-semibold px-5 py-3 disabled:opacity-40 transition">
                {envoi ? "Envoi…" : "Demander"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mt-2">
              Le retrait devient possible à partir de {formatPrice(seuil)}.
            </p>
            <div className="h-2 rounded-full bg-secondary mt-3 overflow-hidden">
              <div className="h-full bg-gold rounded-full transition-all"
                   style={{ width: `${Math.min(100, (dispo / seuil) * 100)}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {formatPrice(dispo)} sur {formatPrice(seuil)}
            </p>
          </>
        )}

        {/* Le délai n'est pas un piège : il est expliqué, sinon il sera
            vécu comme un retard inexpliqué. */}
        <div className="mt-4 flex gap-2.5 text-[11px] text-muted-foreground leading-relaxed">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <p>
            Une commission devient disponible {d.maturation_jours ?? 7} jours
            après le paiement de votre filleul. Ce délai nous permet de
            vérifier que le compte est authentique.
          </p>
        </div>
      </section>

      {/* ── Filleuls ── */}
      {(d.filleuls?.length ?? 0) > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <h2 className="font-serif font-semibold">Mes filleuls</h2>
          </div>
          <div className="mt-3 divide-y divide-border/60">
            {d.filleuls!.map((f, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-medium">{f.prenom}</span>
                <span className="tabular-nums text-muted-foreground">
                  {f.gains > 0 ? formatPrice(f.gains) : "—"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Historique ── */}
      {(d.historique?.length ?? 0) > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-serif font-semibold">Historique des commissions</h2>
          <div className="mt-3 divide-y divide-border/60">
            {d.historique!.map((h, i) => {
              const mur = new Date(h.mature_le) <= new Date();
              return (
                <div key={i} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <div className="font-medium tabular-nums">{formatPrice(h.montant)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {h.taux} % de {formatPrice(h.base)} ·{" "}
                      {new Date(h.date).toLocaleDateString("fr-FR")}
                    </div>
                  </div>
                  <span className={`text-[11px] px-2 py-1 rounded-full ${
                    h.statut === "payee" ? "bg-emerald-500/10 text-emerald-600"
                    : h.statut === "annulee" ? "bg-secondary text-muted-foreground line-through"
                    : mur ? "bg-gold/15 text-gold-foreground" : "bg-secondary text-muted-foreground"
                  }`}>
                    {h.statut === "payee" ? "Versée"
                     : h.statut === "annulee" ? "Annulée"
                     : mur ? "Disponible" : "En attente"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function Entete() {
  return (
    <div className="flex items-center gap-3 mb-4">
      <Link to="/accueil" className="p-2 -ml-2 rounded-xl hover:bg-secondary transition">
        <ArrowLeft className="w-5 h-5" />
      </Link>
      <h1 className="text-xl font-serif font-bold">Parrainage</h1>
    </div>
  );
}

function Carte({ v, l, fort }: { v: string; l: string; fort?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${fort ? "border-gold/40 bg-gold/5" : "border-border bg-card"}`}>
      <div className="text-lg font-serif font-bold tabular-nums">{v}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{l}</div>
    </div>
  );
}

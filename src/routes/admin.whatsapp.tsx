import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Copy, Check, ExternalLink, SkipForward, AlertTriangle,
  Sunrise, Moon, Loader2, RefreshCw, Info,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

/**
 * Chaîne WhatsApp — deux publications par jour, prêtes à coller.
 *
 * POURQUOI CE N'EST PAS ENTIÈREMENT AUTOMATIQUE
 *
 * Les chaînes WhatsApp n'ont aucune API. Meta ne permet pas d'y publier
 * par programme : ni webhook, ni Cloud API, ni outil d'automatisation.
 * La Cloud API sait envoyer des messages à des personnes qui ont accepté
 * d'être contactées — c'est un autre produit, facturé au message, et il
 * ne touche pas les abonnés d'une chaîne.
 *
 * Des bibliothèques non officielles pilotent WhatsApp Web. Elles violent
 * les conditions d'utilisation, et la sanction est le bannissement du
 * numéro : la chaîne et ses abonnés disparaissent avec lui. Ce n'est pas
 * un pari à faire sur un canal d'acquisition.
 *
 * Cette page automatise donc tout sauf les cinq dernières secondes : le
 * choix du message, la rotation des angles, l'heure, le rappel sur le
 * téléphone. Reste à copier et coller.
 *
 * CE QUE L'ÉCRAN MONTRE EN PREMIER
 *
 * Ce qui est dû maintenant, en grand, avec un seul bouton. Le reste de
 * la semaine est en dessous, replié dans une liste — on ne vient pas ici
 * pour consulter un calendrier, on vient pour publier.
 */

export const Route = createFileRoute("/admin/whatsapp")({
  head: () => ({
    meta: [
      { title: "Chaîne WhatsApp — AgapeMeet" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminWhatsapp,
});

type Ligne = {
  id: number;
  publier_le: string;
  moment: "matin" | "soir";
  angle: string | null;
  contenu: string;
  statut: "prevu" | "publie" | "saute";
  publie_le: string | null;
};

const ANGLES: Record<string, string> = {
  verset: "Verset", priere: "Prière", promesse: "Promesse",
  attente: "Attente", caractere: "Caractère", temoignage: "Témoignage",
  question: "Question", agape: "AgapeMeet",
};

function heure(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function jour(iso: string) {
  const d = new Date(iso);
  const aujourdhui = new Date();
  const memeJour = d.toDateString() === aujourdhui.toDateString();
  if (memeJour) return "Aujourd'hui";
  const demain = new Date(aujourdhui.getTime() + 86400000);
  if (d.toDateString() === demain.toDateString()) return "Demain";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function AdminWhatsapp() {
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [banque, setBanque] = useState<Record<string, number>>({});
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState<number | null>(null);

  const charger = async () => {
    const { data, error } = await supabase.rpc("admin_whatsapp", { p_jours: 7 });
    if (error) {
      console.error("[admin/whatsapp]", error);
      setErreur("Lecture impossible. La migration 83 a-t-elle été exécutée ?");
      setChargement(false);
      return;
    }
    const d = data as any;
    if (d?.error) { setErreur("Accès refusé."); setChargement(false); return; }

    setLignes((d?.planning ?? []) as Ligne[]);
    setBanque((d?.banque ?? {}) as Record<string, number>);
    setErreur(null);
    setChargement(false);
  };

  useEffect(() => { charger(); }, []);

  const copier = async (l: Ligne) => {
    try {
      await navigator.clipboard.writeText(l.contenu);
      setCopie(l.id);
      setTimeout(() => setCopie(null), 2500);
      toast.success("Texte copié — collez-le dans la chaîne");
    } catch {
      toast.error("Copie impossible. Sélectionnez le texte à la main.");
    }
  };

  const marquer = async (l: Ligne, statut: "publie" | "saute") => {
    const { error } = await supabase.rpc("marquer_whatsapp", { p_id: l.id, p_statut: statut });
    if (error) { toast.error("Enregistrement impossible"); return; }
    setLignes(prev => prev.map(x => x.id === l.id ? { ...x, statut } : x));
    toast.success(statut === "publie" ? "Marqué comme publié" : "Créneau sauté");
  };

  const maintenant = Date.now();
  // Dû = l'heure est passée et rien n'a été fait. Six heures de grâce :
  // au-delà, le créneau est manqué, et le proposer encore ferait publier
  // le message du matin à minuit.
  const dus = lignes.filter(l =>
    l.statut === "prevu" &&
    new Date(l.publier_le).getTime() <= maintenant &&
    maintenant - new Date(l.publier_le).getTime() < 6 * 3600_000,
  );
  const aVenir = lignes.filter(l =>
    l.statut === "prevu" && new Date(l.publier_le).getTime() > maintenant,
  );
  const passes = lignes.filter(l => l.statut !== "prevu");

  if (chargement) {
    return (
      <div className="p-8 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" /> Chargement…
      </div>
    );
  }

  if (erreur) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
          <p className="text-sm">{erreur}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl space-y-6">
      <header>
        <h1 className="font-serif text-2xl font-semibold">Chaîne WhatsApp</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Deux publications par jour, choisies et programmées automatiquement.
        </p>
      </header>

      {/* La limite est annoncée d'emblée, et non découverte en cherchant
          un bouton « publier » qui n'existe pas. */}
      <div className="rounded-2xl border border-border bg-secondary/40 p-4 flex gap-3">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground leading-relaxed">
          <p className="font-semibold text-foreground">Pourquoi il reste un geste à faire</p>
          <p className="mt-1">
            Les chaînes WhatsApp n'ont pas d'API : Meta ne permet à aucun
            programme d'y publier. Les outils qui le prétendent pilotent
            WhatsApp&nbsp;Web en fraude, et font bannir le numéro — donc perdre
            la chaîne et ses abonnés.
          </p>
          <p className="mt-1.5">
            Tout le reste est automatique : le choix du message, la rotation des
            angles, l'heure, et un rappel sur votre téléphone. Il ne reste qu'à
            copier et coller.
          </p>
        </div>
      </div>

      {dus.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">
            À publier maintenant
          </h2>
          {dus.map(l => (
            <Carte key={l.id} l={l} copie={copie === l.id}
                   onCopier={() => copier(l)}
                   onPublie={() => marquer(l, "publie")}
                   onSaute={() => marquer(l, "saute")} en_avant />
          ))}
        </section>
      )}

      {dus.length === 0 && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
          <p className="font-semibold">Rien à publier pour l'instant.</p>
          <p className="text-muted-foreground text-xs mt-1">
            {aVenir[0]
              ? `Prochaine publication : ${jour(aVenir[0].publier_le)} à ${heure(aVenir[0].publier_le)}.`
              : "Aucun créneau programmé — vérifiez la tâche planifiée."}
          </p>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Les jours qui viennent
          </h2>
          <button onClick={charger}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <RefreshCw className="w-3.5 h-3.5" /> Actualiser
          </button>
        </div>

        {aVenir.map(l => (
          <Carte key={l.id} l={l} copie={copie === l.id}
                 onCopier={() => copier(l)}
                 onPublie={() => marquer(l, "publie")}
                 onSaute={() => marquer(l, "saute")} />
        ))}
      </section>

      {passes.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Derniers jours
          </h2>
          {passes.map(l => (
            <div key={l.id} className="rounded-xl border border-border/50 px-4 py-2.5 flex items-center gap-3 text-xs">
              {l.moment === "matin" ? <Sunrise className="w-3.5 h-3.5 text-gold shrink-0" />
                                    : <Moon className="w-3.5 h-3.5 text-primary shrink-0" />}
              <span className="text-muted-foreground shrink-0">
                {jour(l.publier_le)} · {heure(l.publier_le)}
              </span>
              <span className="flex-1 truncate text-muted-foreground">
                {ANGLES[l.angle ?? ""] ?? l.angle}
              </span>
              <span className={`shrink-0 font-semibold ${
                l.statut === "publie" ? "text-emerald-600" : "text-muted-foreground"
              }`}>
                {l.statut === "publie" ? "Publié" : "Sauté"}
              </span>
            </div>
          ))}
        </section>
      )}

      {/* L'indicateur qui annonce l'essoufflement AVANT qu'il ne se voie
          dans les publications : quand la banque est trop courte, les
          messages se répètent et les abonnés se désabonnent. */}
      <p className="text-[11px] text-muted-foreground border-t border-border/50 pt-4">
        Banque de messages : {banque.matin ?? 0} pour le matin, {banque.soir ?? 0} pour le soir.
        {(banque.matin ?? 0) < 10 || (banque.soir ?? 0) < 10
          ? " ⚠️ En dessous de dix, les messages reviennent trop souvent."
          : ""}
      </p>
    </div>
  );
}

function Carte({
  l, copie, onCopier, onPublie, onSaute, en_avant,
}: {
  l: Ligne; copie: boolean;
  onCopier: () => void; onPublie: () => void; onSaute: () => void;
  en_avant?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${
      en_avant ? "border-primary/40 bg-primary/5 shadow-soft" : "border-border/50 bg-card"
    }`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {l.moment === "matin" ? <Sunrise className="w-4 h-4 text-gold" />
                              : <Moon className="w-4 h-4 text-primary" />}
        <span className="font-semibold text-foreground">
          {jour(l.publier_le)} · {heure(l.publier_le)}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-secondary text-[10px] uppercase tracking-wide font-semibold">
          {ANGLES[l.angle ?? ""] ?? l.angle}
        </span>
      </div>

      {/* `whitespace-pre-wrap` : les retours à la ligne FONT le message sur
          WhatsApp. Les écraser ici donnerait un aperçu qui ne ressemble
          pas à ce qui sera publié. */}
      <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed">
        {l.contenu}
      </pre>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={onCopier}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-soft hover:opacity-90 transition-opacity"
        >
          {copie ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copie ? "Copié" : "Copier le texte"}
        </button>

        <a
          href="https://web.whatsapp.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm hover:bg-secondary transition-colors"
        >
          <ExternalLink className="w-4 h-4" /> Ouvrir WhatsApp
        </a>

        <button
          onClick={onPublie}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-500/40 text-emerald-600 text-sm font-medium hover:bg-emerald-500/10 transition-colors"
        >
          <Check className="w-4 h-4" /> C'est publié
        </button>

        <button
          onClick={onSaute}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-muted-foreground text-sm hover:bg-secondary transition-colors"
        >
          <SkipForward className="w-4 h-4" /> Sauter
        </button>
      </div>
    </div>
  );
}

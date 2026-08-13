import { useEffect, useState } from "react";
import { UserPlus, Hourglass, UserCheck, X, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import {
  etatDemande, envoyerDemande, annulerDemande, RAISONS, type EtatDemande,
} from "@/lib/contacts";

/**
 * « Ajouter » — envoi d'une demande de contact.
 *
 * Distinct du like : le like est un signal silencieux issu du balayage,
 * la demande est explicite et appelle une réponse. Les deux coexistent
 * sur un profil sans se remplacer.
 *
 * LE BOUTON REFLÈTE L'ÉTAT RÉEL, dans les deux sens. Si l'autre m'a déjà
 * sollicité, on ne propose pas d'envoyer une seconde demande en miroir :
 * on invite à répondre à la sienne. Sans cette lecture croisée, deux
 * personnes intéressées ouvriraient deux fils pour la même relation.
 */
export function BoutonAjouter({
  autreId,
  compact,
  onChange,
}: {
  autreId: string;
  /** Version réduite, pour une barre d'actions déjà chargée. */
  compact?: boolean;
  onChange?: () => void;
}) {
  const [etat, setEtat] = useState<EtatDemande | null>(null);
  const [busy, setBusy] = useState(false);
  const [saisie, setSaisie] = useState(false);
  const [mot, setMot] = useState("");

  async function lire() {
    setEtat(await etatDemande(autreId));
  }

  useEffect(() => { lire(); }, [autreId]);

  async function envoyer() {
    setBusy(true);
    const res = await envoyerDemande(autreId, mot);
    setBusy(false);
    setSaisie(false);
    setMot("");

    if (!res.ok) {
      toast.error(RAISONS[res.raison] ?? "Envoi impossible");
      lire();
      return;
    }

    toast.success(
      res.croisee
        ? "Vous étiez déjà sollicité : vous voilà en contact"
        : "Demande envoyée",
    );
    lire();
    onChange?.();
  }

  async function annuler() {
    if (!etat?.id) return;
    setBusy(true);
    const res = await annulerDemande(etat.id);
    setBusy(false);

    if (!res.ok) { toast.error("Annulation impossible"); return; }
    toast.success("Demande annulée");
    lire();
    onChange?.();
  }

  // Rien tant que l'état n'est pas connu : un bouton « Ajouter » qui se
  // transformerait en « En attente » une seconde plus tard ferait croire
  // à un envoi accidentel.
  if (!etat) {
    return <div className={`rounded-xl bg-secondary animate-pulse ${compact ? "h-9 w-24" : "h-11 w-full"}`} />;
  }

  const base = compact
    ? "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
    : "w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-colors";

  if (etat.etat === "accepted") {
    return (
      <span className={`${base} bg-emerald-500/10 text-emerald-600 cursor-default`}>
        <UserCheck className="w-4 h-4" /> En contact
      </span>
    );
  }

  if (etat.etat === "pending") {
    // L'émetteur peut se rétracter ; le destinataire, lui, est invité à
    // répondre — pas à envoyer une demande de plus.
    return etat.je_suis_emetteur ? (
      <button onClick={annuler} disabled={busy}
              className={`${base} bg-secondary text-muted-foreground hover:bg-secondary/70 disabled:opacity-50`}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Hourglass className="w-4 h-4" />}
        Demande envoyée · annuler
      </button>
    ) : (
      <span className={`${base} bg-gold/15 text-gold-foreground cursor-default`}>
        <Hourglass className="w-4 h-4" /> Vous a envoyé une demande
      </span>
    );
  }

  if (etat.etat === "refused") {
    // Volontairement muet sur QUI a refusé : la contrainte d'unicité
    // empêche de toute façon de réessayer, et insister n'aiderait pas.
    return (
      <span className={`${base} bg-secondary text-muted-foreground cursor-default`}>
        <X className="w-4 h-4" /> Demande close
      </span>
    );
  }

  if (saisie) {
    return (
      <div className="w-full space-y-2">
        <textarea
          value={mot}
          onChange={e => setMot(e.target.value.slice(0, 200))}
          rows={2}
          autoFocus
          placeholder="Un mot pour vous présenter (facultatif)"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none"
        />
        <div className="flex gap-2">
          <button onClick={() => { setSaisie(false); setMot(""); }}
                  className="flex-1 py-2.5 rounded-xl bg-secondary text-muted-foreground text-sm font-semibold">
            Annuler
          </button>
          <button onClick={envoyer} disabled={busy}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Envoyer
          </button>
        </div>
      </div>
    );
  }

  return (
    <button onClick={() => setSaisie(true)}
            className={`${base} bg-primary text-primary-foreground hover:opacity-90`}>
      <UserPlus className="w-4 h-4" /> Ajouter
    </button>
  );
}

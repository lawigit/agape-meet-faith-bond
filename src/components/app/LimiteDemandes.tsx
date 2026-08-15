import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Crown, Check, Clock } from "lucide-react";
import { getPlan } from "@/lib/plans";

/**
 * « Limite atteinte » — le panneau du sixième clic.
 *
 * UN PANNEAU, PAS UNE NOTIFICATION. Une notification disparaît en trois
 * secondes ; on vient de refuser quelque chose à quelqu'un, la réponse
 * doit rester à l'écran le temps d'être lue et de proposer la suite.
 *
 * LES AVANTAGES SONT LUS DANS `plans.ts`, jamais recopiés ici. Une liste
 * dupliquée finit toujours par annoncer un avantage qui n'existe plus,
 * ou par oublier celui qu'on vient d'ajouter — et c'est sur cet écran
 * précis que la promesse doit être exacte.
 */
export function LimiteDemandes({
  max, onClose,
}: {
  max: number;
  /**
   * Heure du prochain envoi possible, renvoyée par la base.
   *
   * Plus affichée : le panneau invite à s'abonner, pas à patienter. La
   * propriété reste acceptée pour ne pas casser les appelants, et parce
   * qu'elle redeviendra utile si l'on veut un jour annoncer le délai.
   */
  prochain?: string | null;
  onClose: () => void;
}) {
  const premium = getPlan("premium");

  /* Échap ferme aussi.
     Le clic à côté est la seule sortie visible ; au clavier, il n'y en
     aurait aucune, et l'écran deviendrait un cul-de-sac. Rien ne
     s'affiche pour autant : c'est un filet, pas un bouton. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 28, stiffness: 320 }}
        className="w-full max-w-sm rounded-3xl bg-background border border-border shadow-elegant overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Aucune croix : le panneau se ferme en touchant à côté. */}
        <div className="relative px-5 pt-5 pb-4 bg-gradient-to-br from-primary to-primary/85 text-primary-foreground">
          <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
          <h2 className="font-serif text-xl font-semibold mt-3">Limite atteinte</h2>
          <p className="text-sm opacity-95 mt-1.5 leading-relaxed">
            Tu as utilisé tes {max} demandes du jour. Avec Premium, tu peux
            contacter sans attendre demain et tu verras qui s'intéresse à toi.
          </p>
        </div>

        <div className="p-5">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-gold" />
            <h3 className="font-semibold text-sm">Avec Premium</h3>
          </div>

          <ul className="mt-3 space-y-2.5">
            <li className="flex gap-2.5 text-sm">
              <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>Demandes de contact <strong>sans limite</strong></span>
            </li>
            {premium.perks.map((p, i) => (
              <li key={i} className="flex gap-2.5 text-sm">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>{p}</span>
              </li>
            ))}
          </ul>

          {/* Sans prix : la page Tarifs présente les trois formules et
              leurs durées. Afficher un montant ici en imposerait un seul,
              et le contredirait dès qu'une offre change. */}
          <Link
            to="/abonnement"
            onClick={onClose}
            className="mt-5 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gold text-gold-foreground font-semibold shadow-elegant hover:opacity-90 transition-opacity"
          >
            <Crown className="w-4 h-4" /> Passer Premium
          </Link>
        </div>
      </motion.div>
    </motion.div>
  );
}

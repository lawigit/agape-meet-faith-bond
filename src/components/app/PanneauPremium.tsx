import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { createPortal } from "react-dom";
import { Crown, Check } from "lucide-react";

/**
 * Refus d'une fonction payante — un panneau, pas une notification.
 *
 * CE QU'IL REMPLACE
 *
 * Un `toast.error("Revenir en arrière est réservé aux membres Premium")`.
 * Trois défauts : il disparaît en trois secondes, il énonce une
 * interdiction sans dire ce qu'on y gagnerait, et il laisse la personne
 * sans rien à faire d'autre que renoncer.
 *
 * LA STRUCTURE, DANS CET ORDRE
 *
 *   1. Ce que la fonction APPORTE — jamais « c'est réservé à »
 *   2. Ce que Premium débloque en plus, en trois points
 *   3. L'action payante
 *   4. UNE ALTERNATIVE GRATUITE quand elle existe
 *
 * Le quatrième point est le plus important. Un écran qui ne propose que
 * de payer se referme ; un écran qui offre un geste immédiat garde la
 * personne dans l'application — et c'est elle qui reviendra payer plus
 * tard.
 */

export type ActionAlternative = {
  label: string;
  onClick: () => void;
  /** Phrase qui introduit l'alternative, au-dessus du bouton. */
  invite: string;
};

export function PanneauPremium({
  titre,
  texte,
  avantages,
  alternative,
  onClose,
}: {
  titre: string;
  texte: string;
  /** Trois au maximum : au-delà, plus personne ne lit. */
  avantages?: string[];
  alternative?: ActionAlternative;
  onClose: () => void;
}) {
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 28, stiffness: 320 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-3xl bg-background border border-border shadow-elegant"
      >
        <div className="px-5 pt-5 pb-4 bg-gradient-to-br from-primary to-primary/85 text-primary-foreground">
          <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center">
            <Crown className="w-5 h-5" />
          </div>
          <h2 className="font-serif text-xl font-semibold mt-3">{titre}</h2>
          <p className="text-sm opacity-90 mt-1.5 leading-relaxed">{texte}</p>
        </div>

        <div className="p-5">
          {!!avantages?.length && (
            <ul className="space-y-2.5">
              {avantages.map((a, i) => (
                <li key={i} className="flex gap-2.5 text-sm">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          )}

          <Link
            to="/abonnement"
            onClick={onClose}
            className="mt-5 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gold text-gold-foreground font-bold shadow-elegant hover:opacity-90 transition-opacity"
          >
            <Crown className="w-4 h-4" /> Passer Premium
          </Link>

          {/* L'alternative gratuite, nettement séparée : elle ne doit pas
              se lire comme un second bouton d'achat. */}
          {alternative && (
            <>
              <div className="flex items-center gap-3 my-4">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">ou</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <p className="text-xs text-muted-foreground text-center leading-relaxed">
                {alternative.invite}
              </p>

              <button
                onClick={() => { alternative.onClick(); onClose(); }}
                className="mt-2.5 w-full py-2.5 rounded-xl border border-primary/40 bg-primary/5 text-primary text-sm font-semibold hover:bg-primary/10 transition-colors"
              >
                {alternative.label}
              </button>
            </>
          )}

          <button
            onClick={onClose}
            className="mt-2 w-full py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-secondary transition-colors"
          >
            Plus tard
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

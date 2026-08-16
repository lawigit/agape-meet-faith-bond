import { createPortal } from "react-dom";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Rocket, X } from "lucide-react";
import { BOOST_OFFERS, boostSavings, formatPrice, type BoostOffer } from "@/lib/plans";
import { CheckoutSheet } from "@/components/app/CheckoutSheet";

/**
 * Proposé aux membres qui n'ont pas de Boost disponible — formule gratuite,
 * ou quota mensuel déjà consommé. C'est souvent la première dépense d'un
 * membre gratuit, donc l'écran doit rester simple et sans culpabilisation.
 */
export function BoostPicker({ onClose, reason }: { onClose: () => void; reason?: "plan" | "quota" }) {
  const [selected, setSelected] = useState<BoostOffer | null>(null);

  if (selected) {
    return (
      <CheckoutSheet
        offerId={selected.id}
        title={selected.label}
        subtitle={`Mise en avant pendant ${selected.duration}`}
        priceXOF={selected.priceXOF}
        onClose={() => setSelected(null)}
      />
    );
  }

  /* PORTAIL VERS `document.body`, et c'est indispensable.
     Ce panneau est monté depuis le bouton Boost, qui vit dans l'en-tête
     — un en-tête portant `backdrop-blur-xl`. Or un `backdrop-filter`
     crée un BLOC CONTENEUR pour les descendants en `position: fixed` :
     `inset-0` se calait donc sur les soixante pixels de l'en-tête, et
     l'on ne voyait que le bas du panneau.

     `max-h-[85vh]` et le défilement traitent l'autre cas : un contenu
     plus haut que l'écran. Sur mobile le panneau colle en bas, et sans
     cette limite son sommet passerait hors champ, inatteignable. */
  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[65] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-3xl bg-background border border-border shadow-elegant"
        >
          <div className="relative px-5 pt-5 pb-4 bg-gradient-to-br from-primary to-primary/85 text-primary-foreground">
            <button
              onClick={onClose}
              aria-label="Fermer"
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center">
              <Rocket className="w-5 h-5" />
            </div>
            <h2 className="font-serif text-xl font-semibold mt-3">Choisissez votre boost</h2>
            <p className="text-xs opacity-90 mt-1">
              {reason === "quota"
                ? "Vous avez déjà utilisé le Boost inclus dans votre formule ce mois-ci."
                : "Passez en tête des découvertes et multipliez les profils qui vous voient."}
            </p>
          </div>

          <div className="p-4 space-y-2">
            {BOOST_OFFERS.map(offer => {
              const savings = boostSavings(offer);
              return (
                <button
                  key={offer.id}
                  onClick={() => setSelected(offer)}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl border transition-all active:scale-[0.98] ${
                    offer.popular
                      ? "border-primary bg-primary/5 hover:bg-primary/10"
                      : "border-border bg-card hover:bg-secondary/50"
                  }`}
                >
                  <div className="text-left min-w-0">
                    <div className="font-semibold text-sm flex items-center gap-1.5">
                      {offer.label}
                      {offer.popular && (
                        <span className="px-1.5 py-0.5 rounded-full bg-gold text-gold-foreground text-[9px] uppercase tracking-wide">
                          Populaire
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      {offer.duration}
                      {savings > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 text-[9px] font-bold">
                          −{savings}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-serif text-base font-semibold">
                      {formatPrice(offer.priceXOF)}
                    </span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </button>
              );
            })}

            <p className="text-[10px] text-muted-foreground text-center pt-1 leading-relaxed">
              Un Boost acheté pendant un Boost actif <strong>prolonge</strong> la durée.
              <br />
              Il ne consomme pas le Boost inclus dans votre formule.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

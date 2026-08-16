import { createPortal } from "react-dom";
import { useState } from "react";
import { motion } from "motion/react";
import { CreditCard, Loader2, ShieldCheck, Smartphone, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/plans";
import { startCheckout } from "@/lib/checkout";
import { SelecteurIndicatif } from "@/components/app/SelecteurIndicatif";

/**
 * Pays proposés par défaut.
 *
 * ⚠️ Cette liste ne pilote PLUS le sélecteur : il lit désormais les 187
 * pays de `pays.ts` avec leur indicatif, et propose une recherche. Elle
 * ne sert qu'à fournir la valeur initiale, et reste exportée parce que
 * d'autres écrans l'importent.
 */
export const COUNTRIES = [
  { code: "TG", dial: "+228", label: "Togo" },
  { code: "BJ", dial: "+229", label: "Bénin" },
  { code: "CI", dial: "+225", label: "Côte d'Ivoire" },
  { code: "SN", dial: "+221", label: "Sénégal" },
  { code: "BF", dial: "+226", label: "Burkina Faso" },
  { code: "ML", dial: "+223", label: "Mali" },
  { code: "NE", dial: "+227", label: "Niger" },
  { code: "GW", dial: "+245", label: "Guinée-Bissau" },
  { code: "CM", dial: "+237", label: "Cameroun" },
  { code: "GA", dial: "+241", label: "Gabon" },
  { code: "CG", dial: "+242", label: "Congo" },
  { code: "TD", dial: "+235", label: "Tchad" },
  { code: "CF", dial: "+236", label: "Centrafrique" },
  { code: "GQ", dial: "+240", label: "Guinée équatoriale" },
  { code: "FR", dial: "+33", label: "France" },
  { code: "BE", dial: "+32", label: "Belgique" },
  { code: "CA", dial: "+1", label: "Canada" },
];

/**
 * Récupère l'indicatif et le numéro, puis délègue à Chariow.
 * Le choix Mobile Money / carte se fait sur LEUR page : l'indicatif saisi
 * ici détermine les opérateurs qui y seront proposés.
 *
 * Partagée entre l'achat d'un abonnement et celui d'un Boost.
 */
export function CheckoutSheet({
  offerId,
  title,
  subtitle,
  priceXOF,
  onClose,
}: {
  offerId: string;
  title: string;
  subtitle: string;
  priceXOF: number;
  onClose: () => void;
}) {
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 6) {
      toast.error("Numéro de téléphone invalide");
      return;
    }

    setBusy(true);
    const res = await startCheckout(offerId, digits, country.code);
    if (!res.ok) {
      setBusy(false);
      toast.error(res.error ?? "Le paiement n'a pas pu être lancé");
    }
    // En cas de succès la page est redirigée : on garde l'état occupé
  };

  /* Portail vers `document.body`.
     Cette feuille peut être ouverte depuis le bouton Boost de l'en-tête,
     dont le `backdrop-blur-xl` crée un bloc conteneur pour les
     descendants en `position: fixed`. Sans portail, elle se calerait
     sur l'en-tête au lieu de couvrir l'écran. */
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl bg-background border border-border shadow-elegant overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <span className="font-semibold text-sm flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-gold" /> Finaliser l'achat
          </span>
          <button onClick={onClose} aria-label="Fermer" className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="rounded-2xl bg-secondary/60 p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Pack sélectionné
              </div>
              <div className="font-semibold text-sm truncate">{title}</div>
              <div className="text-[11px] text-muted-foreground">{subtitle}</div>
            </div>
            <div className="font-serif text-lg font-semibold shrink-0">{formatPrice(priceXOF)}</div>
          </div>

          <div>
            <label className="text-xs font-medium">Numéro de téléphone</label>
            <div className="mt-1.5 flex gap-2">
              <SelecteurIndicatif valeur={country} onChange={setCountry} />
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                inputMode="tel"
                placeholder="90 00 00 00"
                className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Les moyens de paiement proposés dépendent de votre pays.
            </p>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Smartphone className="w-3.5 h-3.5 text-primary" /> Mobile Money
            </span>
            <span className="flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5 text-primary" /> Visa · Mastercard
            </span>
          </div>

          <button
            onClick={submit}
            disabled={busy}
            className="w-full py-3 rounded-xl bg-gradient-to-br from-primary to-primary/85 text-primary-foreground font-semibold text-sm shadow-elegant disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Redirection…
              </>
            ) : (
              <>Payer {formatPrice(priceXOF)}</>
            )}
          </button>

          <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
            <ShieldCheck className="w-3 h-3" /> Paiement sécurisé — nous ne stockons aucune donnée bancaire.
          </p>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

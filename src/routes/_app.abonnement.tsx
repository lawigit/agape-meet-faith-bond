import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Check,
  Crown,
  Gem,
  Eye,
  Star,
  Zap,
  Sparkles,
  ShieldCheck,
  X,
  Loader2,
  CreditCard,
  Smartphone,
  BadgeCheck,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { CheckoutSheet } from "@/components/app/CheckoutSheet";
import { SupportContactBlock, WhatsAppButton } from "@/components/SupportContact";
import {
  PLANS,
  formatPrice,
  offersFor,
  savingsVsMonthly,
  useSubscription,
  type Offer,
  type Plan,
} from "@/lib/subscription";

export const Route = createFileRoute("/_app/abonnement")({
  head: () => ({
    meta: [
      { title: "Abonnement — AgapeMeet" },
      {
        name: "description",
        content:
          "Choisissez votre formule AgapeMeet : visiteurs, Super Likes illimités, Boosts et filtres avancés.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SubscriptionPage,
});

function SubscriptionPage() {
  const {
    plan, planId, expiresAt, daysLeft, isPaid, isFounder, loading,
    superLikesLeft, boostsLeft, refresh, pendingPayments, reconcile,
  } = useSubscription();
  const [checkoutOffer, setCheckoutOffer] = useState<Offer | null>(null);
  const [checking, setChecking] = useState(false);

  const verifyNow = async () => {
    setChecking(true);
    const { recovered, pending } = await reconcile();
    setChecking(false);

    if (recovered > 0) toast.success("Paiement confirmé — votre formule est active 🎉");
    else if (pending > 0) toast.info("Paiement encore en attente chez l'opérateur.");
    else toast.info("Aucun paiement en attente.");
  };

  // Retour depuis la page de paiement Chariow : on resynchronise
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("paiement") !== "retour") return;

    toast.info("Paiement en cours de validation…", {
      description: "Votre formule s'activera automatiquement dès confirmation.",
    });
    refresh();
    window.history.replaceState({}, "", window.location.pathname);

    // La notification arrive en général en quelques secondes ; si elle se
    // perd, ces vérifications rattrapent le paiement sans intervention.
    const timers = [5000, 15000, 40000].map(ms => setTimeout(() => reconcile(), ms));
    return () => timers.forEach(clearTimeout);
  }, [refresh, reconcile]);

  return (
    <div className="px-4 pt-4 pb-8">
      <div className="text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gold/15 text-gold text-[11px] font-semibold">
          <Crown className="w-3.5 h-3.5" /> Abonnement
        </div>
        <h1 className="font-serif text-2xl font-semibold mt-2">
          {isFounder ? "Vous êtes membre fondateur" : "Passez au niveau supérieur"}
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          {isFounder
            ? "Merci d'avoir rejoint AgapeMeet dès les débuts."
            : "Voyez vos visiteurs, envoyez des Super Likes illimités et boostez votre profil."}
        </p>
      </div>

      {/* Fondateur : on remercie, on ne vend rien */}
      {isFounder && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-5 rounded-2xl overflow-hidden relative"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-gold via-gold/90 to-gold/70" />
          <div className="relative p-5 text-gold-foreground text-center">
            <div className="w-12 h-12 rounded-full bg-white/25 mx-auto flex items-center justify-center">
              <Crown className="w-6 h-6" />
            </div>
            <h2 className="font-serif text-xl font-semibold mt-3">Accès VIP à vie</h2>
            <p className="text-xs opacity-90 mt-1.5 max-w-xs mx-auto leading-relaxed">
              Parce que vous étiez là avant tout le monde, l'intégralité des fonctionnalités
              vous reste offerte — sans abonnement, sans limite de durée.
            </p>
          </div>
        </motion.div>
      )}

      {/* Paiement encaissé mais pas encore confirmé */}
      {pendingPayments > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-5 rounded-2xl border border-gold/40 bg-gold/10 p-3.5 flex items-start gap-3"
        >
          <Loader2 className="w-4 h-4 text-gold animate-spin shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">Paiement en attente de confirmation</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Si vous avez validé le paiement sur votre téléphone, votre formule s'activera
              automatiquement. Vous pouvez aussi vérifier maintenant.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={verifyNow}
                disabled={checking}
                className="px-3 py-1.5 rounded-lg bg-gold text-gold-foreground text-[11px] font-semibold disabled:opacity-60"
              >
                {checking ? "Vérification…" : "Vérifier mon paiement"}
              </button>
              {/* Un paiement bloqué est le moment où l'on perd un client :
                  il a payé et n'a rien reçu. Le canal le plus direct doit
                  être là, pas trois écrans plus loin. */}
              <WhatsAppButton
                label="Nous écrire"
                message="Bonjour, j'ai payé sur AgapeMeet mais mon abonnement n'est toujours pas actif."
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700 transition-colors"
              />
            </div>
          </div>
        </motion.div>
      )}

      {/* Statut actuel */}
      <div className="mt-5 rounded-2xl border border-border/60 bg-card p-4 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Formule actuelle
            </div>
            <div className="font-serif text-xl font-semibold flex items-center gap-1.5">
              {loading ? "…" : plan.name}
              {isPaid && <BadgeCheck className="w-4 h-4 text-gold" />}
            </div>
            {isPaid && expiresAt && (
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Expire le {new Date(expiresAt).toLocaleDateString("fr-FR")}
                {daysLeft !== null && ` · ${daysLeft} jour${daysLeft > 1 ? "s" : ""} restant${daysLeft > 1 ? "s" : ""}`}
              </div>
            )}
          </div>
          {isPaid && daysLeft !== null && daysLeft <= 5 && (
            <span className="shrink-0 px-2.5 py-1 rounded-full bg-destructive/10 text-destructive text-[10px] font-semibold">
              Bientôt expiré
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4">
          <StatTile icon={Eye} label="Visiteurs" value={plan.features.visitors ? "Oui" : "Non"} />
          <StatTile
            icon={Star}
            label="Super Likes"
            value={superLikesLeft === -1 ? "∞" : String(superLikesLeft)}
          />
          <StatTile
            icon={Zap}
            label="Boosts"
            value={boostsLeft === -1 ? "∞" : String(boostsLeft)}
          />
        </div>
      </div>

      {/* Formules — inutile de les proposer à qui a déjà tout */}
      {!isFounder && (
        <>
          <div className="mt-6 space-y-4">
            {PLANS.map((p, i) => (
              <PlanCard
                key={p.id}
                plan={p}
                current={p.id === planId}
                delay={i * 0.05}
                onChoose={setCheckoutOffer}
              />
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground text-center mt-5 leading-relaxed">
            Paiement unique, sans engagement ni prélèvement automatique.
            <br />
            Un nouvel achat pendant une période active <strong>prolonge</strong> votre abonnement.
          </p>
        </>
      )}

      <AnimatePresence>
        {checkoutOffer && (
          <CheckoutSheet
            offerId={checkoutOffer.id}
            title={`${checkoutOffer.planId === "vip" ? "VIP" : "Premium"} · ${checkoutOffer.label}`}
            subtitle={`Abonnement de ${checkoutOffer.label}`}
            priceXOF={checkoutOffer.priceXOF}
            onClose={() => setCheckoutOffer(null)}
          />
        )}
      </AnimatePresence>

      <div className="mt-8">
        <SupportContactBlock
          title="Un problème avec votre paiement ?"
          description="Paiement débité sans activation, erreur de l'opérateur mobile, ou simple question sur les formules : écrivez-nous, une personne vous répond."
          message="Bonjour, j'ai une question concernant mon paiement sur AgapeMeet."
          subject="Question sur mon paiement AgapeMeet"
          compact
        />
      </div>
    </div>
  );
}

function StatTile({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/60 p-2.5 text-center">
      <Icon className="w-4 h-4 mx-auto text-primary" />
      <div className="text-sm font-semibold mt-1">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function PlanCard({
  plan,
  current,
  delay,
  onChoose,
}: {
  plan: Plan;
  current: boolean;
  delay: number;
  onChoose: (o: Offer) => void;
}) {
  const offers = offersFor(plan.id);
  const free = plan.id === "gratuit";

  /* Une durée est présélectionnée : un bouton d'achat sans rien de
     coché obligerait à deviner ce qu'on va payer. On propose celle
     marquée « Populaire », à défaut la première. */
  const [choisi, setChoisi] = useState<Offer | null>(
    () => offers.find(o => o.popular) ?? offers[0] ?? null,
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`rounded-2xl border p-4 shadow-soft ${
        plan.highlight
          ? "border-primary bg-gradient-to-br from-primary to-primary/85 text-primary-foreground"
          : "border-border/60 bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-serif text-xl font-semibold flex items-center gap-1.5">
            {plan.name}
            {plan.id === "vip" && <Crown className="w-4 h-4 text-gold" />}
          </div>
          <div className={`text-[11px] ${plan.highlight ? "opacity-85" : "text-muted-foreground"}`}>
            {plan.tagline}
          </div>
        </div>
        {current && (
          <span
            className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold ${
              plan.highlight ? "bg-white/20" : "bg-primary/10 text-primary"
            }`}
          >
            Formule actuelle
          </span>
        )}
      </div>

      <p
        className={`mt-2.5 text-xs font-medium leading-snug ${
          plan.highlight ? "opacity-95" : "text-foreground/80"
        }`}
      >
        {plan.promise}
      </p>

      <ul className="mt-3 space-y-1.5 text-xs">
        {plan.perks.map(perk => (
          <li key={perk} className="flex gap-1.5">
            <Check
              className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${plan.highlight ? "text-gold" : "text-primary"}`}
            />
            <span className={plan.highlight ? "opacity-95" : ""}>{perk}</span>
          </li>
        ))}
      </ul>

      {/* Ce que la formule ne couvre pas — le contraste fait la vente */}
      {plan.limits && plan.limits.length > 0 && (
        <ul className="mt-2 space-y-1.5 text-xs border-t border-border/50 pt-2">
          {plan.limits.map(limit => (
            <li key={limit} className="flex gap-1.5 text-muted-foreground">
              <X className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-60" />
              <span>{limit}</span>
            </li>
          ))}
        </ul>
      )}

      {free ? (
        <div
          className={`mt-4 w-full py-2.5 rounded-xl text-center text-xs font-semibold ${
            plan.highlight ? "bg-white/15" : "bg-secondary text-muted-foreground"
          }`}
        >
          Inclus par défaut
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {/* Introduit la liste des durées. Sans ce titre, on voyait
              trois prix alignés sans comprendre qu'il fallait en choisir
              un — ni que le plus long revient moins cher. */}
          <div className="pb-1">
            <p className={`text-sm font-semibold ${
              plan.highlight ? "text-primary-foreground" : "text-foreground"
            }`}>
              Choisis ta durée
            </p>
            <p className={`text-[11px] leading-snug ${
              plan.highlight ? "text-primary-foreground/80" : "text-muted-foreground"
            }`}>
              Plus c'est long, plus tu économises
            </p>
          </div>

          {offers.map(offer => {
            // Remise calculée sur le prix barré, pas sur le tarif
            // mensuel : c'est le chiffre que le membre peut vérifier
            // lui-même en regardant les deux nombres affichés.
            const remise = offer.originalPriceXOF && offer.originalPriceXOF > offer.priceXOF
              ? Math.round((1 - offer.priceXOF / offer.originalPriceXOF) * 100)
              : 0;
            const actif = choisi?.id === offer.id;
            return (
              <button
                key={offer.id}
                onClick={() => setChoisi(offer)}
                aria-pressed={actif}
                /* Sélection, plus achat direct. Chaque ligne ouvrait
                   auparavant le paiement au premier clic : on choisissait
                   et l'on payait d'un même geste, sans pouvoir comparer.
                   L'anneau marque le choix ; le bouton plus bas engage. */
                className={`w-full flex items-start justify-between gap-3 px-3.5 py-3 rounded-xl font-semibold transition-all active:scale-[0.98] ${
                  plan.highlight
                    ? "bg-white text-primary hover:bg-white/90"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                } ${
                  actif
                    ? plan.highlight
                      ? "ring-2 ring-gold ring-offset-2 ring-offset-primary"
                      : "ring-2 ring-gold ring-offset-2 ring-offset-card"
                    : "opacity-70 hover:opacity-100"
                }`}
              >
                <span className="flex flex-col items-start gap-1 min-w-0">
                  <span className="flex items-center gap-2 text-sm">
                    {offer.label}
                    {offer.popular && (
                      <span className="px-1.5 py-0.5 rounded-full bg-gold text-gold-foreground text-[9px] uppercase tracking-wide">
                        Populaire
                      </span>
                    )}
                    {remise > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 text-[9px] font-bold">
                        −{remise} %
                      </span>
                    )}
                  </span>
                  {/* Sur sa propre ligne : l'étiquette des Boosts serait
                      illisible coincée entre la durée et deux prix.

                      Le VIP n'a pas de nombre : ses Boosts sont
                      illimités. Y afficher un chiffre annoncerait MOINS
                      que ce qui est réellement accordé. */}
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-gold/20 text-gold-foreground text-[9px] font-bold">
                    <Zap className="w-2.5 h-2.5" />
                    {offer.boostsOffered
                      ? `${offer.boostsOffered} Boost${offer.boostsOffered > 1 ? "s" : ""} offert${offer.boostsOffered > 1 ? "s" : ""}`
                      : "Boosts illimités"}
                  </span>
                </span>
                {/* Prix barré au-dessus, prix réel en dessous : le
                    montant dû doit rester le plus lisible des deux,
                    sinon c'est le mauvais chiffre qu'on retient. */}
                <span className="flex flex-col items-end shrink-0">
                  {offer.originalPriceXOF && offer.originalPriceXOF > offer.priceXOF && (
                    <span className="text-[10px] font-normal line-through opacity-55 leading-none">
                      {formatPrice(offer.originalPriceXOF)}
                    </span>
                  )}
                  {/* La flèche a disparu : elle promettait un passage à
                      l'étape suivante, alors que la ligne ne fait plus
                      que sélectionner. */}
                  <span className="text-sm mt-0.5">
                    {formatPrice(offer.priceXOF)}
                  </span>
                </span>
              </button>
            );
          })}

          {/* L'engagement se prend ICI, une fois la durée choisie. */}
          {choisi && (
            <div className="pt-2">
              <button
                onClick={() => onChoose(choisi)}
                className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold shadow-elegant transition-all active:scale-[0.98] ${
                  plan.highlight
                    ? "bg-gold text-gold-foreground hover:opacity-90"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                }`}
              >
                {plan.id === "vip" ? <Gem className="w-4 h-4" /> : <Crown className="w-4 h-4" />}
                Devenir membre {plan.name}
              </button>

              <p className={`text-[10px] text-center mt-2 ${
                plan.highlight ? "text-primary-foreground/70" : "text-muted-foreground"
              }`}>
                Activation instantanée • Annulable en 1 clic
              </p>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

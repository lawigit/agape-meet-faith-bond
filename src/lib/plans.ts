/**
 * Catalogue des formules AgapeMeet.
 *
 * Modèle retenu : vente de DURÉES en paiement unique (pas de prélèvement
 * récurrent), car Chariow ne gère que le paiement à l'acte. À l'expiration,
 * l'utilisateur rachète une durée. Un achat pendant une période active
 * PROLONGE la date de fin au lieu de l'écraser.
 */

export type PlanId = "gratuit" | "premium" | "vip";
export type DurationId = "15j" | "1m" | "3m";

/**
 * Droits d'une formule.
 *
 * Ces valeurs pilotent l'INTERFACE. Les limites qui comptent vraiment
 * (messages, likes, Super Likes, appels, médias, visibilité) sont en plus
 * imposées par des triggers en base — voir 26_limites_gratuit.sql. Sans
 * cette double barrière, il suffirait d'appeler l'API depuis la console.
 */
export type PlanFeatures = {
  /** Voir réellement les visiteurs (le gratuit n'a qu'un aperçu flouté) */
  visitors: boolean;
  /**
   * Voir QUI vous a aimé — « M'ont aimé » et les Super Likes reçus.
   *
   * Sans ce droit, les visages restent floutés et les prénoms masqués,
   * mais le NOMBRE reste visible et exact. Cacher jusqu'au compteur
   * n'inciterait à rien : c'est de savoir qu'ils sont douze à attendre
   * que naît l'envie de s'abonner.
   */
  seeAdmirers: boolean;
  superLikesPerDay: number; // -1 = illimité
  /** Délai entre deux Super Likes, en jours (0 = pas de délai) */
  superLikeCooldownDays: number;
  /** Likes quotidiens : -1 = illimité */
  dailyLikes: number;
  /** Messages envoyés par jour : -1 = illimité */
  dailyMessages: number;
  boostsPerMonth: number; // -1 = illimité
  /** Droit d'utiliser le Boost inclus */
  canBoost: boolean;
  unlimitedLikes: boolean;
  advancedFilters: boolean;
  readReceipts: boolean;
  incognito: boolean;
  priorityVerification: boolean;
  /** Messages vocaux */
  voiceMessages: boolean;
  /** Appels audio et vidéo */
  calls: boolean;
  /** Bouton Retour (annuler le dernier swipe) */
  rewind: boolean;
  /** Bouton Message avant le match */
  preMatchMessage: boolean;
  /** Régler la visibilité de son profil */
  visibilityControl: boolean;
  /** Publier des photos dans la communauté */
  communityMedia: boolean;
  /** Publier des vidéos dans la communauté — VIP uniquement */
  communityVideo: boolean;
  /** Envoyer une vidéo en conversation — VIP uniquement */
  videoMessages: boolean;
  /** Appel vidéo — VIP uniquement (l'audio suffit en Premium) */
  videoCalls: boolean;
  /** Vidéo de présentation sur le profil — VIP uniquement */
  profileVideo: boolean;
  /** Assistant coach IA — VIP uniquement */
  aiCoach: boolean;
};

/** Palier : 0 = gratuit, 1 = 15 j, 2 = 1 mois, 3 = 3 mois, 4 = VIP. */
export type PlanLevel = 0 | 1 | 2 | 3 | 4;

/** Messages par jour selon le palier. -1 = illimité. */
export const MESSAGES_BY_LEVEL: Record<PlanLevel, number> = {
  0: 5, 1: 20, 2: 35, 3: 55, 4: -1,
};

/** Boosts par mois selon le palier. -1 = illimité. */
export const BOOSTS_BY_LEVEL: Record<PlanLevel, number> = {
  0: 0, 1: 1, 2: 2, 3: 4, 4: -1,
};

export const LEVEL_LABELS: Record<PlanLevel, string> = {
  0: "Gratuit",
  1: "Premium 15 jours",
  2: "Premium 1 mois",
  3: "Premium 3 mois",
  4: "VIP",
};

/**
 * Droits effectifs, ajustés au palier réellement acheté.
 *
 * Les quotas de messages et de Boosts varient d'un palier Premium à
 * l'autre ; tout le reste dépend seulement de la formule.
 */
export function featuresFor(planId: PlanId, level: PlanLevel): PlanFeatures {
  const base = planId === "gratuit" ? FREE_FEATURES : getPlan(planId).features;
  return {
    ...base,
    dailyMessages: MESSAGES_BY_LEVEL[level] ?? base.dailyMessages,
    boostsPerMonth: BOOSTS_BY_LEVEL[level] ?? base.boostsPerMonth,
    canBoost: (BOOSTS_BY_LEVEL[level] ?? 0) !== 0,
  };
}

export type Offer = {
  id: string; // identifiant interne, sert de clé côté base
  planId: PlanId;
  duration: DurationId;
  label: string;
  days: number;
  priceXOF: number;
  /**
   * Prix de référence, affiché barré à côté du prix réel.
   *
   * ⚠️ Un prix barré est une annonce de réduction. Dans la plupart des
   * législations, le prix de référence doit avoir été RÉELLEMENT
   * pratiqué — sans quoi c'est une pratique commerciale trompeuse. À
   * vérifier avant toute campagne s'appuyant dessus.
   */
  originalPriceXOF?: number;
  popular?: boolean;
};
// Les identifiants produits Chariow (prd_…) ne vivent QUE côté serveur,
// dans les secrets de l'Edge Function : le client n'envoie que `offerId`.

export type Plan = {
  id: PlanId;
  name: string;
  tagline: string;
  /** Promesse en une ligne, affichée en tête de carte. */
  promise: string;
  perks: string[];
  /** Ce que la formule ne couvre pas — crée le contraste avec la suivante. */
  limits?: string[];
  features: PlanFeatures;
  highlight?: boolean;
};

export const FREE_FEATURES: PlanFeatures = {
  visitors: false,
  seeAdmirers: false,
  superLikesPerDay: 1,
  superLikeCooldownDays: 7,
  dailyLikes: 25,
  dailyMessages: 5,
  boostsPerMonth: 0,
  canBoost: false,
  unlimitedLikes: false,
  advancedFilters: false,
  readReceipts: false,
  incognito: false,
  priorityVerification: false,
  voiceMessages: false,
  calls: false,
  rewind: false,
  preMatchMessage: false,
  visibilityControl: false,
  communityMedia: false,
  communityVideo: false,
  videoMessages: false,
  videoCalls: false,
  profileVideo: false,
  aiCoach: false,
};

const PAID_BASE = {
  visitors: true,
  seeAdmirers: true,
  superLikeCooldownDays: 0,
  dailyLikes: -1,
  dailyMessages: -1,
  canBoost: true,
  unlimitedLikes: true,
  advancedFilters: true,
  readReceipts: true,
  voiceMessages: true,
  calls: true,
  rewind: true,
  preMatchMessage: true,
  visibilityControl: true,
  communityMedia: true,
  // Tout ce qui touche à la vidéo, plus le coach IA, reste au VIP
  communityVideo: false,
  videoMessages: false,
  videoCalls: false,
  profileVideo: false,
  aiCoach: false,
} as const;

export const PLANS: Plan[] = [
  {
    id: "gratuit",
    name: "Gratuit",
    tagline: "Faites vos premiers pas",
    promise: "Découvrez la communauté à votre rythme, sans rien débourser.",
    perks: [
      "Un profil complet pour vous présenter tel que vous êtes",
      "25 likes par jour pour explorer sans précipitation",
      "1 Super Like par semaine, pour les profils qui vous touchent vraiment",
      "5 messages par jour avec vos matchs",
      // « Voir qui vous a aimé » a quitté cette liste : la rubrique est
      // redevenue payante. L'annoncer en Gratuit ferait promettre à
      // l'inscription ce qu'un cadenas refuse ensuite.
      "Savoir combien de personnes vous ont aimé",
      "Le verset du jour et la vie de la communauté",
    ],
    limits: [
      "Vous ne voyez pas qui a visité votre profil, ni vos Super Likes reçus",
      "Ni appels audio ou vidéo, ni messages vocaux",
      "Publications sans photo ni vidéo",
      "Ni Boost, ni filtres avancés, ni réglage de visibilité",
    ],
    features: FREE_FEATURES,
  },
  {
    id: "premium",
    name: "Premium",
    tagline: "Pour celles et ceux qui avancent vers le mariage",
    promise: "Ne laissez plus passer la bonne personne faute d'être vu.",
    highlight: true,
    perks: [
      "Découvrez qui visite votre profil — un intérêt sincère ne vous échappera plus",
      "Likes illimités : plus aucun frein pour trouver la bonne personne",
      "5 Super Likes par jour pour vous démarquer dès le premier regard",
      "Un Boost offert chaque mois : votre profil mis en avant",
      "Filtres avancés — confession, pratique, ville, distance",
      "Accusés de lecture : sachez quand votre message a été lu",
    ],
    features: {
      ...PAID_BASE,
      superLikesPerDay: 5,
      boostsPerMonth: 1,
      incognito: false,
      priorityVerification: false,
    },
  },
  {
    id: "vip",
    name: "VIP",
    tagline: "À l'image de l'amour inconditionnel de Dieu",
    promise: "Tout Premium, sans aucune limite — et quelqu'un à vos côtés.",
    perks: [
      "Tout ce que contient Premium, sans la moindre restriction",
      "Super Likes et Boosts illimités — soyez visible chaque jour",
      "Mode incognito : visitez les profils sans laisser de trace",
      "Vérification prioritaire de votre identité et de votre foi",
      "Le badge certifié qui inspire confiance au premier coup d'œil",
      "Mise en avant permanente auprès des profils les plus compatibles",
      "Un conseiller dédié pour vous accompagner jusqu'à la rencontre",
    ],
    features: {
      ...PAID_BASE,
      superLikesPerDay: -1,
      boostsPerMonth: -1,
      incognito: true,
      priorityVerification: true,
      // Le VIP a accès à tout, sans exception
      communityVideo: true,
      videoMessages: true,
      videoCalls: true,
      profileVideo: true,
      aiCoach: true,
    },
  },
];

export const OFFERS: Offer[] = [
  {
    id: "premium_15j",
    planId: "premium",
    duration: "15j",
    label: "15 jours",
    days: 15,
    priceXOF: 2500,
    // Reference : 4 500 F. Le rapport 1,8 est applique aux autres
    // durees Premium, pour que la remise annoncee reste coherente.
    originalPriceXOF: 4500,
  },
  {
    id: "premium_1m",
    planId: "premium",
    duration: "1m",
    label: "1 mois",
    days: 30,
    priceXOF: 4000,
    originalPriceXOF: 7200,
    popular: true,
  },
  {
    id: "premium_3m",
    planId: "premium",
    duration: "3m",
    label: "3 mois",
    days: 90,
    priceXOF: 10500,
    originalPriceXOF: 18900,
  },
  {
    id: "vip_1m",
    planId: "vip",
    duration: "1m",
    label: "1 mois",
    days: 30,
    priceXOF: 12000,
    originalPriceXOF: 16500,
  },
];

/**
 * Boosts à l'unité.
 *
 * Le Boost inclus dans Premium dure 30 minutes et se renouvelle chaque mois.
 * Ceux-ci s'achètent séparément, durent bien plus longtemps, et sont ouverts
 * à tous — y compris aux membres gratuits, pour qui c'est souvent la
 * première dépense.
 */
export type BoostOffer = {
  id: string;
  label: string;
  duration: string;
  hours: number;
  priceXOF: number;
  popular?: boolean;
};

export const BOOST_OFFERS: BoostOffer[] = [
  { id: "boost_24h", label: "Boost 24h", duration: "24 heures", hours: 24, priceXOF: 1000 },
  { id: "boost_3j", label: "Boost 3 jours", duration: "3 jours", hours: 72, priceXOF: 2000, popular: true },
  { id: "boost_7j", label: "Boost 7 jours", duration: "7 jours", hours: 168, priceXOF: 3500 },
];

export function getBoostOffer(id: string): BoostOffer | undefined {
  return BOOST_OFFERS.find(o => o.id === id);
}

/** Prix ramené à la journée — met en valeur les formules longues. */
export function boostPricePerDay(offer: BoostOffer) {
  return Math.round(offer.priceXOF / (offer.hours / 24));
}

/** Économie en % face au Boost 24h. */
export function boostSavings(offer: BoostOffer): number {
  const ref = BOOST_OFFERS[0];
  if (offer.id === ref.id) return 0;
  const refPerDay = ref.priceXOF / (ref.hours / 24);
  const mine = offer.priceXOF / (offer.hours / 24);
  return Math.max(0, Math.round((1 - mine / refPerDay) * 100));
}

export function getPlan(id: PlanId): Plan {
  return PLANS.find(p => p.id === id) ?? PLANS[0];
}

export function offersFor(planId: PlanId): Offer[] {
  return OFFERS.filter(o => o.planId === planId);
}

export function getOffer(offerId: string): Offer | undefined {
  return OFFERS.find(o => o.id === offerId);
}

export function formatPrice(amount: number) {
  return new Intl.NumberFormat("fr-FR").format(amount) + " FCFA";
}

/** Prix ramené au jour — sert à afficher l'économie réalisée sur les longues durées. */
export function pricePerDay(offer: Offer) {
  return Math.round(offer.priceXOF / offer.days);
}

/** Économie en % par rapport au tarif journalier de la formule 1 mois. */
export function savingsVsMonthly(offer: Offer): number {
  const monthly = OFFERS.find(o => o.planId === offer.planId && o.duration === "1m");
  if (!monthly || monthly.id === offer.id) return 0;
  const ref = monthly.priceXOF / monthly.days;
  const mine = offer.priceXOF / offer.days;
  return Math.max(0, Math.round((1 - mine / ref) * 100));
}

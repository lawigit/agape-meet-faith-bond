/**
 * Champs complémentaires du profil — vocabulaire et regroupement.
 *
 * Trois blocs plutôt que huit champs en enfilade. Un formulaire qui aligne
 * huit questions sans respiration se remplit à moitié ; regroupés, chaque
 * bloc se termine et donne envie d'attaquer le suivant.
 *
 * L'ordre suit celui d'une rencontre réelle : ce que je cherche, qui je
 * suis, puis ce que j'admets de moi.
 */

export const PROFILE_GROUPS = [
  {
    id: "chemin",
    title: "Mon chemin vers le mariage",
    hint: "Où vous en êtes, ce qui vous met en marche, et ce sur quoi vous ne transigerez pas.",
    fields: ["marital_status", "marriage_vision", "looking_for", "dealbreakers"] as const,
  },
  {
    id: "qui",
    title: "Qui je suis",
    hint: "De quoi engager une conversation autrement que par « ça va ? ».",
    fields: ["education", "height_cm", "interests"] as const,
  },
  {
    id: "sincerite",
    title: "En toute sincérité",
    hint: "Reconnaître ses défauts inspire plus confiance qu'une liste de qualités.",
    fields: ["qualities", "flaws"] as const,
  },
] as const;

/**
 * Situation matrimoniale.
 *
 * « Marié(e) » ne figure pas dans la liste, et la contrainte CHECK de la
 * migration 40 le refuse aussi en base : le proposer laisserait entendre
 * qu'on peut chercher ici en étant déjà engagé.
 */
export const MARITAL_STATUSES = [
  { key: "celibataire", label: "Célibataire" },
  { key: "divorce", label: "Divorcé(e)" },
  { key: "veuf", label: "Veuf / Veuve" },
  { key: "separe", label: "Séparé(e)", hint: "Union non encore dissoute" },
  { key: "annule", label: "Mariage annulé", hint: "Annulation religieuse prononcée" },
];

export const MARITAL_LABELS: Record<string, string> = Object.fromEntries(
  MARITAL_STATUSES.map(s => [s.key, s.label]),
);

/**
 * Confessions proposées.
 *
 * Liste unique, partagée par l'inscription et la page profil. Les deux
 * divergeaient : l'onboarding enregistrait « Protestant Évangélique »,
 * la page profil « evangelique » — si bien qu'ouvrir son profil et
 * enregistrer réécrivait la confession dans un autre format, et qu'un
 * pentecôtiste ne retrouvait pas la sienne dans la liste.
 *
 * Ces valeurs sont stockées telles quelles : ce sont elles que le filtre
 * par dénomination regroupe.
 */
export const DENOMINATIONS_CONNUES = [
  "Catholique",
  "Protestant Évangélique",
  "Pentecôtiste",
  "Baptiste",
  "Méthodiste",
  "Adventiste",
  "Orthodoxe",
  "Non-dénominationnel",
];

/** Vrai si la confession a été saisie librement plutôt que choisie. */
export function estDenominationLibre(valeur?: string | null): boolean {
  return Boolean(valeur) && !DENOMINATIONS_CONNUES.includes(valeur as string);
}

export const EDUCATION_LEVELS = [
  "Sans diplôme",
  "Certificat / BEPC",
  "Baccalauréat",
  "BTS / DUT (Bac +2)",
  "Licence (Bac +3)",
  "Master (Bac +5)",
  "Doctorat",
  "Formation professionnelle",
  "École biblique / théologie",
];

/** Propositions cochables — la saisie libre reste possible partout. */
export const INTEREST_SUGGESTIONS = [
  "Louange", "Chorale", "Lecture", "Cuisine", "Voyages", "Sport",
  "Football", "Marche", "Cinéma", "Musique", "Entrepreneuriat",
  "Bénévolat", "Photographie", "Danse", "Jardinage", "Mode",
  "Technologie", "Enseignement", "Écriture", "Nature",
];

export const QUALITY_SUGGESTIONS = [
  "Patient(e)", "À l'écoute", "Fidèle", "Généreux(se)", "Travailleur(se)",
  "Drôle", "Organisé(e)", "Calme", "Ambitieux(se)", "Bienveillant(e)",
  "Honnête", "Persévérant(e)", "Attentionné(e)", "Discret(e)",
];

export const FLAW_SUGGESTIONS = [
  "Têtu(e)", "Impatient(e)", "Trop direct(e)", "Perfectionniste",
  "Bavard(e)", "Timide", "Désordonné(e)", "Susceptible",
  "Anxieux(se)", "Distrait(e)", "Rancunier(ère)", "Trop exigeant(e)",
];

export const DEALBREAKER_SUGGESTIONS = [
  "Le mensonge", "L'infidélité", "Le manque de foi", "La violence",
  "L'alcool", "Le tabac", "Le manque de respect", "La jalousie excessive",
  "L'irresponsabilité", "Le manque d'ambition", "Les relations avant le mariage",
];

/** Libellés affichés, partagés entre le formulaire et les cartes. */
export const FIELD_LABELS: Record<string, string> = {
  marital_status: "Situation matrimoniale",
  marriage_vision: "Ma vision du mariage",
  looking_for: "Ce que je recherche",
  dealbreakers: "Ce que je n'accepte pas",
  education: "Niveau d'études",
  height_cm: "Taille",
  interests: "Centres d'intérêt",
  qualities: "Mes qualités",
  flaws: "Mes défauts",
};

/**
 * Foi, pratique et intentions — traduction des valeurs stockées.
 *
 * La base garde des clés courtes (`hebdomadaire`, `pas_maintenant`) que
 * le formulaire de /profil sait afficher, mais qui étaient illisibles
 * partout ailleurs : une fiche montrait « pas_maintenant » à l'écran.
 *
 * Ces tables sont la copie exacte des `<option>` du formulaire. Si l'une
 * bouge, l'autre doit bouger — c'est le prix d'un vocabulaire unique.
 */
export const PRACTICE_LABELS: Record<string, string> = {
  pratiquant: "Pratiquant régulier",
  occasionnel: "Occasionnel",
  croyant: "Croyant non pratiquant",
  decouverte: "En découverte",
};

export const BAPTIZED_LABELS: Record<string, string> = {
  oui: "Baptisé(e)",
  non: "Pas encore baptisé(e)",
  prevu: "Baptême prévu prochainement",
};

export const ATTENDANCE_LABELS: Record<string, string> = {
  hebdomadaire: "Toutes les semaines",
  mensuel: "Quelques fois par mois",
  fetes: "Seulement aux fêtes",
  jamais: "Presque jamais",
};

export const INTENT_LABELS: Record<string, string> = {
  serieux: "Je cherche le mariage",
  ouvert: "Ouvert(e) à l'idée",
  pas_maintenant: "Pas pour le moment",
};

export const HAS_CHILDREN_LABELS: Record<string, string> = {
  oui: "Oui",
  non: "Non",
};

export const WANTS_CHILDREN_LABELS: Record<string, string> = {
  oui: "Oui",
  non: "Non",
  ouvert: "Ouvert(e) à l'idée",
  plus: "Pas d'autres enfants",
};

/** Type des champs complémentaires, tel que stocké. */
export type ProfileExtras = {
  marital_status: string;
  marriage_vision: string;
  looking_for: string;
  education: string;
  height_cm: number | null;
  interests: string[];
  qualities: string[];
  flaws: string[];
  dealbreakers: string[];
};

export const EMPTY_EXTRAS: ProfileExtras = {
  marital_status: "",
  marriage_vision: "",
  looking_for: "",
  education: "",
  height_cm: null,
  interests: [],
  qualities: [],
  flaws: [],
  dealbreakers: [],
};

/** Nombre maximum d'éléments par liste — aligné sur les contraintes CHECK. */
export const LIST_LIMITS: Record<string, number> = {
  interests: 12,
  qualities: 6,
  flaws: 6,
  dealbreakers: 6,
};

export function formatHeight(cm?: number | null): string {
  if (!cm) return "";
  const m = Math.floor(cm / 100);
  const rest = cm % 100;
  return `${m} m ${rest.toString().padStart(2, "0")}`;
}

/** Un bloc est-il assez rempli pour être affiché sur une carte ? */
export function hasAnyExtra(p: Partial<ProfileExtras>): boolean {
  return Boolean(
    p.marital_status ||
    p.marriage_vision?.trim() ||
    p.looking_for?.trim() ||
    p.education ||
    p.height_cm ||
    p.interests?.length ||
    p.qualities?.length ||
    p.flaws?.length ||
    p.dealbreakers?.length,
  );
}

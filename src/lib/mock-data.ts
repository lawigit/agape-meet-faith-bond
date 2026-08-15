export type Profile = {
  id: string;
  firstName: string;
  /** Peut être vide : le nom n'est pas obligatoire à l'inscription. */
  lastName?: string;
  /** Champs complémentaires, remplis après l'inscription (migrations 39-40). */
  maritalStatus?: string;
  /** Distance en km, calculée en base. NULL si l'un des deux ne partage pas sa position. */
  distanceKm?: number | null;
  /** Offre publique — sert au badge. `planUntil` en décide l'expiration. */
  plan?: string | null;
  planUntil?: string | null;
  /** Date d'inscription — sert au tri « Nouveaux membres ». */
  createdAt?: string | null;
  isFounder?: boolean;
  marriageVisionText?: string;
  lookingFor?: string;
  educationLevel?: string;
  heightCm?: number | null;
  qualities?: string[];
  flaws?: string[];
  dealbreakers?: string[];
  age: number;
  city: string;
  country: string;
  denomination: string;
  compatibility: number;
  verified: boolean;
  premium: boolean;
  lastActive: string;
  photo: string;
  photos: string[];
  bio: string;
  profession: string;
  education: string;
  height: string;
  languages: string[];
  interests: string[];
  passions: string[];
  marriageVision: string;
  favoriteVerse: string;
  church: string;
  faithImportance: string;
  /** Fin du Boost en cours — sert au classement et à l'étiquette */
  boostedUntil?: string | null;
};

const pic = (seed: string, w = 800) =>
  `https://images.unsplash.com/photo-${seed}?auto=format&fit=crop&w=${w}&q=80`;

// Curated portrait photos (Unsplash IDs)
const portraits = [
  "1531123897727-8f129e1688ce",
  "1502823403499-6ccfcf4fb453",
  "1544005313-94ddf0286df2",
  "1519085360753-af0119f7cbe7",
  "1524504388940-b1c1722653e1",
  "1508214751196-bcfd4ca60f91",
  "1487412720507-e7ab37603c6f",
  "1517841905240-472988babdf9",
  "1541823709867-1b206113eafd",
  "1573496359142-b8d87734a5a2",
  "1506794778202-cad84cf45f1d",
  "1500648767791-00dcc994a43e",
];

export const profiles: Profile[] = [];
export const recommendedProfiles: Profile[] = [];
export const newMembers: Profile[] = [];
export const mostCompatible: Profile[] = [];
export const verifiedProfiles: Profile[] = [];
export const premiumProfiles: Profile[] = [];
export const recentlyActive: Profile[] = [];

// Messages
export type Chat = {
  id: string;
  profile: Profile;
  lastMessage: string;
  time: string;
  unread: number;
  online: boolean;
  typing?: boolean;
};

export const chats: Chat[] = [];

// Requests
export type MatchRequest = {
  id: string;
  profile: Profile;
  type: "like" | "superlike" | "match" | "invite" | "visit" | "pending";
  time: string;
};

export const requests: MatchRequest[] = [];

// Community
export type Post = {
  id: string;
  author: Profile;
  category:
    | "Témoignage"
    | "Prière"
    | "Encouragement"
    | "Verset"
    | "Conseil"
    | "Réflexion"
    | "Question"
    | "Expérience";
  time: string;
  text: string;
  image?: string;
  likes: number;
  comments: number;
  shares: number;
  liked?: boolean;
  saved?: boolean;
};

export const posts: Post[] = [];

export const coupleTestimonials: any[] = [];

export const fallbackVerses = [
  { ref: "Jérémie 29:11", text: "Car je connais les projets que j'ai formés sur vous, dit l'Éternel, projets de paix et non de malheur, afin de vous donner un avenir et de l'espérance." },
  { ref: "Proverbes 3:5-6", text: "Confie-toi en l'Éternel de tout ton cœur, et ne t'appuie pas sur ta sagesse ; Reconnais-le dans toutes tes voies, et il aplanira tes sentiers." },
  { ref: "Philippiens 4:6-7", text: "Ne vous inquiétez de rien; mais en toute chose faites connaître vos besoins à Dieu par des prières et des supplications, avec des actions de grâces." },
  { ref: "Romains 8:28", text: "Nous savons, du reste, que toutes choses concourent au bien de ceux qui aiment Dieu, de ceux qui sont appelés selon son dessein." },
  { ref: "Esaïe 41:10", text: "Ne crains rien, car je suis avec toi; Ne promène pas des regards inquiets, car je suis ton Dieu; Je te fortifie, je viens à ton secours, Je te soutiens de ma droite triomphante." },
  { ref: "Psaume 23:1", text: "L'Éternel est mon berger : je ne manquerai de rien." },
  { ref: "1 Corinthiens 13:4-5", text: "L'amour est patient, il est plein de bonté; l'amour n'est point envieux; l'amour ne se vante point, il ne s'enfle point d'orgueil..." },
  { ref: "Proverbes 18:22", text: "Celui qui trouve une femme trouve le bonheur; C'est une grâce qu'il obtient de l'Éternel." },
  { ref: "Ecclésiaste 4:9", text: "Deux valent mieux qu'un, parce qu'ils retirent un bon salaire de leur travail." },
  { ref: "Colossiens 3:14", text: "Mais par-dessus toutes ces choses revêtez-vous de la charité, qui est le lien de la perfection." },
  { ref: "1 Pierre 4:8", text: "Avant tout, ayez les uns pour les autres une ardente charité, car la charité couvre une multitude de péchés." },
  { ref: "Ephésiens 4:2", text: "En toute humilité et douceur, avec patience, vous supportant les uns les autres avec charité." },
  { ref: "1 Jean 4:19", text: "Pour nous, nous l'aimons, parce qu'il nous a aimés le premier." },
  { ref: "Psaume 37:4", text: "Fais de l'Éternel tes délices, Et il te donnera ce que ton cœur désire." },
  { ref: "Matthieu 6:33", text: "Cherchez premièrement le royaume et la justice de Dieu; et toutes ces choses vous seront données par-dessus." }
];

export const fallbackChallenges = [
  { title: "Défi spirituel", text: "Prenez 10 minutes aujourd'hui pour prier spécifiquement pour votre futur(e) conjoint(e)." },
  { title: "Défi gratitude", text: "Écrivez 3 choses pour lesquelles vous êtes reconnaissant(e) envers Dieu aujourd'hui." },
  { title: "Défi méditation", text: "Lisez et méditez 1 Corinthiens 13. Comment pouvez-vous appliquer cet amour aujourd'hui ?" },
  { title: "Défi encouragement", text: "Envoyez un message encourageant à un ami ou un membre de votre famille." },
  { title: "Défi patience", text: "Si vous vous sentez frustré(e) par l'attente, priez pour que Dieu renouvelle votre patience et votre paix." },
  { title: "Défi pureté", text: "Évaluez ce que vous regardez ou écoutez. Est-ce que cela honore Dieu et prépare votre cœur au mariage ?" },
  { title: "Défi service", text: "Faites une action désintéressée pour quelqu'un aujourd'hui, en reflétant l'amour de Christ." },
  { title: "Défi confiance", text: "Écrivez une de vos peurs concernant le mariage ou l'avenir, et confiez-la intentionnellement à Dieu dans la prière." },
  { title: "Défi connexion", text: "Participez activement à une discussion ou partagez un verset dans la section Communauté de l'application." },
  { title: "Défi louange", text: "Écoutez un chant de louange qui parle de la fidélité de Dieu et chantez-le de tout votre cœur." }
];

export const fallbackAdvices = [
  { text: "On épouse une personne pour quatre choses : sa richesse, son lignage, sa beauté et sa foi. Choisis celle qui a la foi, et tu seras comblé.", source: "Sagesse spirituelle", ref: "CHOISIS D'ABORD LA FOI" },
  { text: "Le mariage n'est pas la ligne d'arrivée, c'est le début d'un marathon où l'on court à deux en regardant vers Christ.", source: "Conseil relationnel", ref: "UN MARATHON À DEUX" },
  { text: "Ne cherchez pas 'la bonne personne', cherchez d'abord à 'être la bonne personne' par la grâce de Dieu.", source: "Principe de croissance", ref: "ÊTRE PRÊT(E)" },
  { text: "L'attirance physique est importante, mais la connexion spirituelle est ce qui maintiendra le couple dans les tempêtes.", source: "Fondation solide", ref: "CONNEXION SPIRITUELLE" },
  { text: "Un mariage fort est composé de deux personnes qui sont douées pour pardonner.", source: "Ruth Bell Graham", ref: "LE PARDON" },
  { text: "L'amour n'est pas seulement un sentiment, c'est un choix quotidien, un engagement constant, même quand c'est difficile.", source: "Vérité sur l'amour", ref: "UN CHOIX QUOTIDIEN" },
  { text: "Avant de demander à Dieu de vous donner un conjoint, demandez-Lui de vous préparer à en être un(e) bon(ne).", source: "Préparation", ref: "PRIÈRE DE PRÉPARATION" },
  { text: "La communication sans prière est incomplète. Priez ensemble pour grandir ensemble.", source: "Conseil de couple", ref: "COMMUNIQUER ET PRIER" },
  { text: "Ne comparez pas votre saison d'attente à la saison de récolte de quelqu'un d'autre. Le plan de Dieu pour vous est unique.", source: "Patience et Foi", ref: "SAISON D'ATTENTE" },
  { text: "Le but ultime du mariage chrétien n'est pas seulement le bonheur, mais la sainteté et la gloire de Dieu.", source: "Objectif du mariage", ref: "POUR SA GLOIRE" }
];
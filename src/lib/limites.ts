/**
 * Ce qu'on montre quand un membre gratuit atteint une limite.
 *
 * POURQUOI PAS UN SIMPLE MESSAGE D'ERREUR
 *
 * « Vous avez atteint vos 25 likes du jour » énonce un mur. La personne
 * range son téléphone, et l'occasion est perdue — alors que c'est
 * précisément l'instant où elle est le plus engagée : elle vient
 * d'utiliser l'application vingt-cinq fois de suite.
 *
 * Une limite atteinte est le meilleur moment pour proposer, parce que le
 * besoin vient d'être ressenti. Pas une heure plus tôt dans un e-mail,
 * pas une semaine plus tard sur la page Tarifs : maintenant.
 *
 * TROIS RÈGLES DANS CHAQUE TEXTE
 *
 *   1. Constater sans reprocher — « vous avez été actif », jamais
 *      « vous avez dépassé ».
 *   2. Nommer ce qu'on rate MAINTENANT, pas ce qui est interdit.
 *   3. Trois avantages au maximum, dont le premier lève précisément
 *      la limite rencontrée.
 */

export type ContenuLimite = {
  titre: string;
  texte: string;
  avantages: string[];
};

const LIMITES: Record<string, ContenuLimite> = {
  likes: {
    titre: "Vous êtes lancé",
    texte:
      "Vos 25 likes du jour sont partis — c'est le signe que vous cherchez sérieusement. Avec Premium, plus aucune limite ne vous arrête.",
    avantages: [
      "Likes illimités, chaque jour",
      "Découvrez qui vous a aimé, et répondez-lui",
      "Un Boost offert pour être vu bien plus",
    ],
  },

  messages: {
    titre: "La conversation continue",
    texte:
      "Vous avez utilisé vos 5 messages du jour. C'est souvent au sixième que les choses deviennent intéressantes.",
    avantages: [
      "Messages illimités avec tous vos contacts",
      "Accusés de lecture : sachez quand on vous a lu",
      "Messages vocaux et appels audio",
    ],
  },

  superlike: {
    titre: "Marquez les esprits",
    texte:
      "Un Super Like par semaine en formule Gratuite. Avec Premium, vous en avez cinq par jour — de quoi ne jamais laisser passer quelqu'un.",
    avantages: [
      "5 Super Likes par jour",
      "Découvrez qui vous a aimé, et répondez-lui",
      "Likes illimités, chaque jour",
    ],
  },

  boost: {
    titre: "Passez devant",
    texte:
      "Un profil boosté est vu bien plus souvent — c'est le moyen le plus rapide de recevoir des visites aujourd'hui même.",
    avantages: [
      "Un Boost offert chaque mois, et jusqu'à onze sur trois mois",
      "Découvrez qui visite votre profil",
      "Filtres avancés : confession, ville, distance",
    ],
  },

  media: {
    titre: "Illustrez vos publications",
    texte:
      "Une publication avec photo attire bien plus de regards qu'un texte seul — et c'est souvent ainsi qu'on se fait remarquer.",
    avantages: [
      "Publiez avec des photos dans la communauté",
      "Découvrez qui visite votre profil",
      "Likes et messages illimités",
    ],
  },
};

/**
 * Reconnaît une limite à partir du message d'erreur de la base.
 *
 * Les triggers lèvent des codes stables (`FREE_LIKE_QUOTA`…) : c'est sur
 * eux qu'on s'appuie, jamais sur le texte français, qui peut changer.
 *
 * `null` pour tout ce qui n'est pas une limite de formule — une erreur
 * technique ou une suspension ne doit surtout pas afficher un argument
 * de vente.
 */
export function limiteDepuisErreur(error: unknown): ContenuLimite | null {
  const brut = String((error as any)?.message ?? "");

  if (brut.includes("FREE_LIKE_QUOTA")) return LIMITES.likes;
  if (brut.includes("FREE_MESSAGE_QUOTA") || brut.includes("MESSAGE_QUOTA_REACHED"))
    return LIMITES.messages;
  if (brut.includes("FREE_SUPERLIKE_COOLDOWN")) return LIMITES.superlike;
  if (brut.includes("FREE_NO_MEDIA_POST")) return LIMITES.media;

  return null;
}

export function limite(cle: keyof typeof LIMITES): ContenuLimite {
  return LIMITES[cle];
}

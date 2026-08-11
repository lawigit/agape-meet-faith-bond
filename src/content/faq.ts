/**
 * Questions fréquentes.
 *
 * Ces entrées alimentent la page /faq ET son balisage JSON-LD `FAQPage`,
 * qui permet à Google d'afficher les questions directement dans ses
 * résultats. C'est le seul contenu de ce projet qui puisse décrocher un
 * résultat enrichi, d'où le soin apporté à la formulation : chaque réponse
 * doit se suffire à elle-même, sortie de son contexte.
 */

export type FaqItem = { q: string; a: string; category: string };

export const FAQ: FaqItem[] = [
  // ── Découvrir la plateforme ──
  {
    category: "Découvrir AgapeMeet",
    q: "Qu'est-ce qu'AgapeMeet ?",
    a: "AgapeMeet est une plateforme de rencontres réservée aux chrétiens qui cherchent une relation sérieuse orientée vers le mariage. Elle réunit des célibataires d'Afrique francophone et de la diaspora autour d'une même conviction : un couple se bâtit sur une foi partagée.",
  },
  {
    category: "Découvrir AgapeMeet",
    q: "L'inscription est-elle vraiment gratuite ?",
    a: "Oui. Créer un profil, découvrir des membres, envoyer des likes et échanger avec vos matchs ne coûte rien. La formule Gratuite comporte des limites quotidiennes — 25 likes, 5 messages et un Super Like par semaine — que les formules Premium et VIP lèvent.",
  },
  {
    category: "Découvrir AgapeMeet",
    q: "Faut-il appartenir à une confession précise ?",
    a: "Non. Catholiques, protestants, évangéliques, pentecôtistes et autres traditions chrétiennes sont les bienvenus. Vous indiquez votre confession sur votre profil, et vous pouvez chercher des personnes de la même sensibilité si c'est important pour vous.",
  },

  // ── Fonctionnement ──
  {
    category: "Comment ça marche",
    q: "Comment se crée un match ?",
    a: "Lorsque deux membres se likent mutuellement, un match se crée et la conversation s'ouvre. Personne ne peut vous écrire sans que l'intérêt soit réciproque, à l'exception d'un message d'introduction réservé aux membres Premium et VIP.",
  },
  {
    category: "Comment ça marche",
    q: "Qu'est-ce qu'un Super Like ?",
    a: "Le Super Like signale un intérêt particulier : la personne le voit immédiatement, avant même de découvrir votre profil dans son fil. En formule Gratuite vous en disposez d'un par semaine, contre cinq par jour en Premium et un nombre illimité en VIP.",
  },
  {
    category: "Comment ça marche",
    q: "À quoi sert le Boost ?",
    a: "Un Boost place votre profil en tête des découvertes pendant une durée déterminée, ce qui multiplie le nombre de personnes qui le voient. Les formules Premium en incluent de un à quatre par mois selon la durée souscrite, le VIP en offre un nombre illimité, et des Boosts de 24 heures, 3 jours ou 7 jours peuvent s'acheter séparément.",
  },
  {
    category: "Comment ça marche",
    q: "Puis-je masquer mon profil ?",
    a: "Oui. Trois réglages existent : visible par tous, visible uniquement des personnes que vous avez likées, ou entièrement en pause. Ce réglage fait partie des formules Premium et VIP.",
  },

  // ── Sécurité et confiance ──
  {
    category: "Sécurité et confiance",
    q: "Les profils sont-ils vérifiés ?",
    a: "Notre équipe examine manuellement les profils — photos, cohérence des informations, sérieux de la démarche — avant d'attribuer le badge de vérification. Les demandes des membres VIP sont traitées en priorité. Vous pouvez par ailleurs signaler ou bloquer n'importe quel membre en deux clics, et chaque signalement est examiné.",
  },
  {
    category: "Sécurité et confiance",
    q: "Mon profil est-il visible sur Google ?",
    a: "Non. Les profils ne sont accessibles qu'aux membres connectés et sont explicitement exclus de l'indexation par les moteurs de recherche. Votre nom ne remontera pas dans une recherche Google.",
  },
  {
    category: "Sécurité et confiance",
    q: "Que faire si quelqu'un se comporte mal ?",
    a: "Utilisez le bouton Signaler présent sur chaque profil et dans chaque conversation. Vous pouvez également bloquer la personne : elle disparaît alors définitivement de vos découvertes et ne peut plus vous contacter.",
  },

  // ── Abonnement et paiement ──
  {
    category: "Abonnement et paiement",
    q: "Comment payer depuis l'Afrique ?",
    a: "Mobile Money est accepté — Togocel Money, Moov Money, Orange Money, MTN MoMo, Wave selon votre pays — ainsi que les cartes Visa et Mastercard. Les moyens proposés s'adaptent automatiquement à l'indicatif téléphonique que vous saisissez.",
  },
  {
    category: "Abonnement et paiement",
    q: "L'abonnement se renouvelle-t-il automatiquement ?",
    a: "Non, et c'est volontaire. Vous achetez une durée précise — 15 jours, 1 mois ou 3 mois — et rien n'est prélevé ensuite. Aucun débit ne vous surprendra, et il n'y a pas d'abonnement à résilier.",
  },
  {
    category: "Abonnement et paiement",
    q: "Que se passe-t-il si j'achète pendant une période déjà active ?",
    a: "La nouvelle durée s'ajoute à celle en cours au lieu de la remplacer. Vous ne perdez jamais de temps déjà payé, et acheter une courte durée ne fait pas perdre les avantages d'une formule plus longue encore active.",
  },
  {
    category: "Abonnement et paiement",
    q: "J'ai payé mais ma formule n'est pas activée. Que faire ?",
    a: "Le paiement Mobile Money se confirme parfois quelques minutes après validation. Votre formule s'active automatiquement dès confirmation, même si vous avez fermé l'application. Si rien n'apparaît, ouvrez la page Abonnement : un bouton « Vérifier mon paiement » interroge directement l'opérateur.",
  },
];

export const FAQ_CATEGORIES = [...new Set(FAQ.map(f => f.category))];

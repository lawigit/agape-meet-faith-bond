import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import {
  Compass, MessageCircle, UserPlus, Users, UserCircle,
  Camera, Heart, Send, Church, Search, Sparkles, ArrowRight,
} from "lucide-react";

/**
 * Guide d'écran — affiché UNE FOIS par page, à la première visite.
 *
 * CE QUE LES MEMBRES DEMANDENT VRAIMENT
 *
 * Ils n'écrivent pas « à quoi sert ce bouton ». Ils écrivent
 * « comment trouver mon âme sœur ». Ce n'est pas une question
 * d'interface : il leur manque un PARCOURS.
 *
 * Chaque guide répond donc à « que dois-je faire ici, et en quoi cela
 * me rapproche du but ? » — jamais à « voici les fonctions de cet
 * écran ». Une liste de fonctionnalités n'a jamais fait agir personne.
 *
 * TROIS ÉTAPES AU MAXIMUM PAR ÉCRAN. Au-delà, on ferme sans lire, et
 * l'on aura dépensé la seule occasion d'être lu.
 *
 * Chaque écran a sa propre clé : quelqu'un qui a compris l'accueil doit
 * quand même recevoir celui de la communauté le jour où il y va.
 */

type Etape = { icone: any; titre: string; texte: string };

type Guide = {
  titre: string;
  intro: string;
  etapes: Etape[];
  /** Bouton final. Sans lien, il se contente de fermer. */
  action?: { label: string; to: string };
};

export type EcranGuide = "accueil" | "messages" | "demandes" | "communaute" | "profil";

const GUIDES: Record<EcranGuide, Guide> = {
  /* L'accueil porte le parcours COMPLET : c'est le premier écran après
     l'inscription, et le seul endroit où répondre à la question qu'ils
     posent vraiment. */
  accueil: {
    titre: "Trouver la bonne personne",
    intro: "Trois gestes suffisent. Le reste vient tout seul.",
    etapes: [
      {
        icone: Camera,
        titre: "1. Complétez votre profil",
        texte: "Une photo nette et quelques mots sincères. Les profils complets reçoivent plusieurs fois plus de visites — c'est ce qui compte le plus.",
      },
      {
        icone: Compass,
        titre: "2. Découvrez des profils",
        texte: "Dans « Découvrir », parcourez les profils un à un. Prenez le temps de lire : la présentation en dit souvent plus que la photo.",
      },
      {
        icone: UserPlus,
        // « Ajouter » et non le like : les actions J'adore et Super like
        // ont été retirées de l'écran Découvrir. Décrire un geste qui
        // n'existe plus enverrait chercher un bouton absent.
        titre: "3. Envoyez une invitation",
        texte: "Touchez « Ajouter » sur la personne qui vous plaît. Si elle accepte, votre conversation s'ouvre aussitôt.",
      },
    ],
    action: { label: "Compléter mon profil", to: "/profil" },
  },

  profil: {
    titre: "Votre profil parle pour vous",
    intro: "C'est la seule chose que les autres voient avant de décider.",
    etapes: [
      {
        icone: Camera,
        titre: "Une photo où l'on vous voit",
        texte: "Visage net, lumière naturelle, seul sur l'image. C'est le premier tri que font tous les membres.",
      },
      {
        icone: Church,
        titre: "Parlez de votre foi concrètement",
        texte: "Votre confession, votre assemblée, votre vision du mariage. C'est ce qui attire les personnes vraiment compatibles.",
      },
      {
        icone: Sparkles,
        titre: "Complétez tout",
        texte: "Le pourcentage en haut de page monte à mesure. Au-delà de 80 %, votre profil remonte dans les suggestions.",
      },
    ],
  },

  demandes: {
    titre: "Vos invitations",
    intro: "Ici se gèrent les demandes de contact — différentes des likes.",
    etapes: [
      {
        icone: UserPlus,
        titre: "Reçues",
        texte: "Quelqu'un souhaite entrer en contact avec vous. Acceptez, et la conversation s'ouvre aussitôt.",
      },
      {
        icone: Send,
        titre: "Envoyées",
        texte: "Celles que vous avez adressées. Tant qu'elles sont en attente, vous pouvez encore les annuler.",
      },
      {
        icone: Heart,
        titre: "Contacts",
        texte: "Les demandes acceptées. Chacune ouvre une conversation dans vos messages.",
      },
    ],
    action: { label: "Découvrir des profils", to: "/decouvrir" },
  },

  messages: {
    titre: "Vos conversations",
    intro: "Le premier message décide de tout.",
    etapes: [
      {
        icone: MessageCircle,
        titre: "Écrivez quelque chose de personnel",
        texte: "Rebondissez sur une phrase de son profil. Un « salut » seul reste presque toujours sans réponse.",
      },
      {
        icone: Church,
        titre: "Parlez de l'essentiel assez tôt",
        texte: "Votre vision du mariage, votre pratique. Mieux vaut le découvrir au troisième message qu'au troisième mois.",
      },
      {
        icone: Users,
        titre: "Prenez votre temps",
        texte: "Une relation orientée vers le mariage ne se décide pas en trois échanges. Apprenez à connaître la personne, sa famille, son assemblée.",
      },
    ],
  },

  communaute: {
    titre: "La communauté",
    intro: "Se faire connaître autrement que par son profil.",
    etapes: [
      {
        icone: Users,
        titre: "Partagez, priez, encouragez",
        texte: "Témoignages, sujets de prière, questions. Ceux qui publient sont vus par bien plus de monde.",
      },
      {
        icone: Search,
        titre: "On vous découvre ici aussi",
        texte: "Un message juste attire souvent plus qu'une photo. Beaucoup de rencontres commencent par une publication.",
      },
    ],
  },
};

export function GuideEcran({ ecran }: { ecran: EcranGuide }) {
  const cle = `agape_guide_${ecran}_v1`;
  const [visible, setVisible] = useState(false);
  const guide = GUIDES[ecran];

  useEffect(() => {
    try {
      if (!localStorage.getItem(cle)) setVisible(true);
    } catch {
      // Navigation privée : ne rien montrer vaut mieux que le montrer à
      // chaque ouverture.
    }
  }, [cle]);

  const fermer = () => {
    setVisible(false);
    try { localStorage.setItem(cle, "1"); } catch { /* sans importance */ }
  };

  if (!visible || !guide) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={fermer}
      >
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", damping: 26, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-3xl bg-background border border-border shadow-elegant"
        >
          <div className="px-5 pt-6 pb-5 text-center bg-gradient-to-br from-primary to-primary/85 text-primary-foreground">
            <div className="w-12 h-12 rounded-full bg-white/20 mx-auto flex items-center justify-center">
              <UserCircle className="w-6 h-6" />
            </div>
            <h2 className="font-serif text-xl font-semibold mt-3">{guide.titre}</h2>
            <p className="text-sm opacity-90 mt-1.5 leading-relaxed">{guide.intro}</p>
          </div>

          <div className="p-5 space-y-3.5">
            {guide.etapes.map((e, i) => (
              <div key={i} className="flex gap-3">
                <span className="w-9 h-9 rounded-xl bg-primary/10 grid place-items-center shrink-0">
                  <e.icone className="w-4 h-4 text-primary" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{e.titre}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {e.texte}
                  </span>
                </span>
              </div>
            ))}

            {guide.action ? (
              <>
                <Link
                  to={guide.action.to}
                  onClick={fermer}
                  className="mt-2 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold shadow-elegant hover:opacity-90 transition-opacity"
                >
                  {guide.action.label} <ArrowRight className="w-4 h-4" />
                </Link>
                {/* Une sortie sans action : celui qui veut d'abord
                    regarder ne doit pas être poussé ailleurs. */}
                <button
                  onClick={fermer}
                  className="w-full py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-secondary transition-colors"
                >
                  Plus tard
                </button>
              </>
            ) : (
              <button
                onClick={fermer}
                className="mt-2 w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold shadow-elegant hover:opacity-90 transition-opacity"
              >
                J'ai compris
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

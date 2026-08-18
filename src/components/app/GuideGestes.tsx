import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import { X, MessageCircle, UserPlus, Undo2, Hand } from "lucide-react";

/**
 * Guide des gestes — affiché UNE FOIS, à la première visite.
 *
 * LE CHIFFRE QUI JUSTIFIE CET ÉCRAN
 *
 * Sur 149 inscrits, 103 n'ont jamais fait un seul swipe. Ce ne sont pas
 * des gens désintéressés : ils ont rempli quatre étapes d'inscription et
 * envoyé leurs photos. Ils ne savaient simplement pas quoi faire ensuite.
 *
 * Le geste de balayage n'était évident que pour qui avait déjà utilisé ce
 * type d'application, et rien à l'écran ne l'annonçait. Il a fini par
 * être supprimé : tout passe désormais par des boutons portant une icône
 * ET un libellé. Cet écran nomme donc ce que la barre montre déjà —
 * répéter n'est pas de trop quand sept membres sur dix n'ont jamais
 * trouvé la commande principale.
 *
 * POURQUOI UN ÉCRAN PLEIN, ET NON UNE INFOBULLE
 *
 * Une petite bulle se referme d'un geste distrait et ne revient jamais.
 * Ici, c'est le premier contact avec la fonction principale : il faut
 * qu'il soit impossible de le manquer, et qu'il ne coûte qu'un clic.
 *
 * Vu une seule fois : la clé est posée en `localStorage` à la fermeture.
 * Quelqu'un qui a compris ne doit jamais le revoir.
 */

const CLE = "agape_guide_gestes_v1";

export function GuideGestes() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(CLE)) setVisible(true);
    } catch {
      // Navigation privée : on n'affiche rien plutôt que de le montrer
      // à chaque ouverture, ce qui serait pire que de ne rien montrer.
    }
  }, []);

  const fermer = () => {
    setVisible(false);
    try { localStorage.setItem(CLE, "1"); } catch { /* sans importance */ }
  };

  if (!visible) return null;

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
              <Hand className="w-6 h-6" />
            </div>
            <h2 className="font-serif text-xl font-semibold mt-3">
              Comment ça marche
            </h2>
            <p className="text-sm opacity-90 mt-1.5 leading-relaxed">
              Trente secondes, et vous saurez tout.
            </p>
          </div>

          <div className="p-5 space-y-4">
            {/* Ni « J'adore » ni « Super like » : ces deux actions ont été
                retirées de l'écran. Les mentionner enverrait chercher des
                boutons qui n'existent plus — le plus sûr moyen de perdre
                quelqu'un qu'on voulait guider.

                Le guide présente donc ce qui reste : on parcourt, et l'on
                invite. « Ajouter » est mis en avant, c'est désormais le
                geste qui crée le lien. */}
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/15 mx-auto flex items-center justify-center text-primary">
                <UserPlus className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold mt-2">
                Une personne vous plaît ?
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Touchez <strong className="text-foreground">Ajouter</strong> pour lui
                envoyer une invitation. Si elle accepte, votre conversation s'ouvre
                aussitôt.
              </p>
            </div>

            {/* Plus aucune mention du balayage : la carte ne se fait plus
                glisser du tout. Enseigner un geste qui ne répond pas est
                le plus sûr moyen de faire croire que l'application est
                cassée — et ces membres-là ne reviennent pas demander. */}
            <div className="rounded-2xl border border-border bg-secondary/40 p-4 text-center">
              <div className="w-11 h-11 rounded-full bg-background border-2 border-muted-foreground/40 mx-auto flex items-center justify-center text-muted-foreground">
                <X className="w-5 h-5" />
              </div>
              <p className="text-[11px] font-semibold mt-1.5">Touchez Passer</p>
              <p className="text-[10px] text-muted-foreground">pour voir le profil suivant</p>
            </div>

            <div className="space-y-2.5 pt-1">
              <Ligne icone={Undo2} titre="Retour" texte="Revenir sur le profil précédent." />
              <Ligne icone={MessageCircle} titre="Message" texte="Écrire directement, sans attendre." />
            </div>

            <button
              onClick={fermer}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold shadow-elegant hover:opacity-90 transition-opacity"
            >
              J'ai compris
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

function Ligne({ icone: Icone, titre, texte }: { icone: any; titre: string; texte: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-8 h-8 rounded-lg bg-secondary grid place-items-center shrink-0">
        <Icone className="w-4 h-4 text-primary" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold">{titre}</span>
        <span className="block text-[11px] text-muted-foreground leading-snug">{texte}</span>
      </span>
    </div>
  );
}

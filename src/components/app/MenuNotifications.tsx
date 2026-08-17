import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Bell, Heart, MessageSquare, UserPlus, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavBadges } from "@/lib/badgesNav";

/**
 * La cloche de l'en-tête, et sa pastille.
 *
 * CE QU'ELLE AFFICHAIT AVANT
 *
 * Un point rouge fixe, allumé en permanence — même sur un compte sans la
 * moindre notification — et trois notifications écrites en dur dans le
 * code : « Sarah : Salut ! J'ai vu que tu aimais… ». Aucune n'existait.
 *
 * Un signal toujours allumé ne signale plus rien : on apprend en deux
 * jours à ne plus le regarder, et le jour où un vrai message arrive, on
 * ne le voit pas non plus. C'est pire que pas de pastille du tout.
 *
 * CE QU'ELLE AFFICHE MAINTENANT
 *
 * Les compteurs réels renvoyés par `my_badges()` — la même source que la
 * barre du bas, donc jamais deux nombres différents à l'écran.
 *
 * Le nombre rouge ne compte QUE ce qui s'adresse personnellement au
 * membre : messages non lus, personnes qui l'ont aimé, invitations
 * reçues. L'activité de la communauté est listée dans le panneau, mais
 * ne fait pas rougir la cloche : le fil bouge tous les jours, et la
 * pastille serait allumée en permanence — on retomberait exactement dans
 * le travers qu'on vient de corriger.
 *
 * Chaque ligne mène à l'endroit où l'on traite la chose. Une notification
 * sur laquelle on ne peut rien faire n'a aucune raison d'exister.
 */

export function MenuNotifications() {
  const { messages, demandes, contacts, communaute } = useNavBadges();

  const total = messages + demandes + contacts;

  const lignes = [
    contacts > 0 && {
      to: "/demandes" as const,
      icone: UserPlus,
      couleur: "bg-primary/10 text-primary",
      titre: `${contacts} invitation${contacts > 1 ? "s" : ""} en attente`,
      texte: contacts > 1
        ? "Des personnes souhaitent entrer en contact avec vous."
        : "Quelqu'un souhaite entrer en contact avec vous.",
    },
    messages > 0 && {
      to: "/messages" as const,
      icone: MessageSquare,
      couleur: "bg-blue-500/10 text-blue-500",
      titre: `${messages} message${messages > 1 ? "s" : ""} non lu${messages > 1 ? "s" : ""}`,
      texte: "Une conversation vous attend.",
    },
    demandes > 0 && {
      to: "/accueil" as const,
      icone: Heart,
      couleur: "bg-rose-500/10 text-rose-500",
      titre: `${demandes} personne${demandes > 1 ? "s" : ""} vous ${demandes > 1 ? "ont" : "a"} aimé`,
      texte: "Découvrez qui, sur votre accueil.",
    },
    communaute > 0 && {
      to: "/communaute" as const,
      icone: Users,
      couleur: "bg-gold/10 text-gold",
      titre: `${communaute} nouvelle${communaute > 1 ? "s" : ""} publication${communaute > 1 ? "s" : ""}`,
      texte: "Témoignages et intentions de prière.",
    },
  ].filter(Boolean) as Array<{
    to: "/demandes" | "/messages" | "/accueil" | "/communaute";
    icone: typeof Heart;
    couleur: string;
    titre: string;
    texte: string;
  }>;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={
            total > 0
              ? `Notifications, ${total} non lue${total > 1 ? "s" : ""}`
              : "Notifications"
          }
          className="relative w-9 h-9 rounded-full border border-border bg-background hover:bg-secondary flex items-center justify-center transition-transform hover:scale-105"
        >
          <Bell className="w-4 h-4" />
          {total > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
              // `min-w` plutôt que `w` : un cercle pour un chiffre, une
              // pilule dès qu'il y en a deux, sans jamais rogner le texte.
              // Au-delà de 99, la différence entre 100 et 340 ne change
              // rien à ce qu'on va faire.
              className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1
                         rounded-full bg-destructive text-destructive-foreground
                         text-[10px] font-bold leading-none
                         flex items-center justify-center
                         ring-2 ring-background tabular-nums"
              aria-hidden
            >
              {total > 99 ? "99+" : total}
            </motion.span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-80 rounded-2xl shadow-elegant border-border/50 bg-background/95 backdrop-blur-xl p-0 mt-2"
      >
        <div className="px-4 py-3 border-b border-border/50">
          <span className="font-semibold text-sm">Notifications</span>
        </div>

        <div className="max-h-[300px] overflow-y-auto">
          {lignes.length === 0 ? (
            /* Rien d'inventé pour meubler. Une invitation à agir vaut
               mieux qu'une fausse notification : sur un compte neuf,
               c'est précisément le moment où l'on ne sait pas quoi
               faire ensuite. */
            <div className="px-4 py-6 text-center">
              <p className="text-sm font-medium">Rien de nouveau</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Parcourez les profils pour lancer vos premières conversations.
              </p>
              <Link
                to="/decouvrir"
                className="inline-block mt-3 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold"
              >
                Découvrir des profils
              </Link>
            </div>
          ) : (
            lignes.map(l => {
              const Icone = l.icone;
              return (
                <DropdownMenuItem
                  key={l.to}
                  asChild
                  className="p-3 m-1 rounded-xl cursor-pointer hover:bg-secondary flex items-start gap-3"
                >
                  <Link to={l.to}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${l.couleur}`}>
                      <Icone className="w-4 h-4" />
                    </div>
                    <div className="flex-1 space-y-1 min-w-0">
                      <p className="text-sm font-medium leading-none">{l.titre}</p>
                      <p className="text-xs text-muted-foreground leading-snug">{l.texte}</p>
                    </div>
                  </Link>
                </DropdownMenuItem>
              );
            })
          )}
        </div>

        <div className="p-2 border-t border-border/50">
          <Link
            to="/parametres/notifications"
            className="block text-center text-xs text-muted-foreground hover:text-foreground p-2 transition-colors"
          >
            Paramètres de notification
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

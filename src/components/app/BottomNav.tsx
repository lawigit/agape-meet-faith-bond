import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Flame, MessageCircle, Heart, Users } from "lucide-react";
import { motion } from "motion/react";
import { useNavBadges, type NavBadges } from "@/lib/badgesNav";

type NavItem = {
  to: "/accueil" | "/decouvrir" | "/messages" | "/demandes" | "/communaute";
  label: string;
  icon: typeof Home;
  exact?: boolean;
  /** Compteur à afficher sur l'icône, s'il y en a un. */
  badge?: keyof NavBadges;
};

// Seule la PASTILLE des demandes est passée sur « Accueil », avec les
// listes qu'elle compte. Un compteur rouge doit mener à ce qu'il annonce,
// et le laisser sur « Demandes » aurait promis des likes pour ouvrir une
// page vide — sans jamais retomber, puisque rien ne s'y consulte plus.
// L'onglet, lui, reste en place.
const items: NavItem[] = [
  { to: "/accueil", label: "Accueil", icon: Home, exact: true, badge: "demandes" },
  { to: "/decouvrir", label: "Découvrir", icon: Flame },
  { to: "/messages", label: "Messages", icon: MessageCircle, badge: "messages" },
  { to: "/demandes", label: "Demandes", icon: Heart },
  { to: "/communaute", label: "Communauté", icon: Users, badge: "communaute" },
];

/**
 * Pastille de comptage.
 *
 * Au-delà de 99 on affiche « 99+ » : trois chiffres débordent de l'icône
 * sur les petits écrans, et la différence entre 100 et 340 messages ne
 * change rien à ce qu'on va faire.
 */
function Pastille({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <motion.span
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 25 }}
      // `min-w` plutôt que `w` : un cercle pour un chiffre, une pilule
      // dès qu'il y en a deux, sans jamais rogner le texte.
      className="absolute -top-1 left-1/2 ml-1 min-w-[17px] h-[17px] px-1
                 rounded-full bg-destructive text-destructive-foreground
                 text-[10px] font-bold leading-none
                 flex items-center justify-center
                 ring-2 ring-background tabular-nums"
      aria-hidden
    >
      {n > 99 ? "99+" : n}
    </motion.span>
  );
}

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const badges = useNavBadges();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-background/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-2xl mx-auto grid grid-cols-5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.exact
            ? pathname === item.to
            : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className="relative flex flex-col items-center justify-center py-2.5 gap-1 group"
            >
              {active && (
                <motion.span
                  layoutId="bnav-active"
                  className="absolute top-0 h-0.5 w-10 bg-gradient-to-r from-primary to-primary/60 rounded-full"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              {/* La pastille se positionne sur l'ICÔNE, pas sur le lien :
                  ancrée au conteneur, elle flotterait au-dessus du
                  libellé sur les écrans étroits. */}
              <span className="relative">
                <Icon
                  className={`w-5 h-5 transition-colors ${
                    active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                  }`}
                  strokeWidth={active ? 2.5 : 2}
                />
                {item.badge && <Pastille n={badges[item.badge]} />}
              </span>
              <span
                className={`text-[10px] font-medium tracking-wide ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {item.label}
              </span>
              {/* Le compte lu par les lecteurs d'écran : la pastille est
                  `aria-hidden`, sans quoi « 3 » serait annoncé comme un
                  texte isolé, sans rapport avec le lien. */}
              {item.badge && badges[item.badge] > 0 && (
                <span className="sr-only">
                  {badges[item.badge]} non lu{badges[item.badge] > 1 ? "s" : ""}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

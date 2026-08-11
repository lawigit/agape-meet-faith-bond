import { Link, useRouterState } from "@tanstack/react-router";
import { LifeBuoy, UsersRound } from "lucide-react";
import { useMyPermissions } from "@/lib/permissions";

/**
 * Support et Équipe réunis sous une seule entrée de menu.
 *
 * Les deux traitent des personnes qui font tourner l'application : celles
 * qui posent des questions, et celles qui y répondent. Deux entrées
 * distinctes allongeaient la barre latérale sans rien séparer d'utile.
 *
 * LES DEUX URL SONT CONSERVÉES. Fusionner l'affichage ne veut pas dire
 * fusionner les pages : un lien enregistré vers /admin/equipe continue de
 * fonctionner, et chaque onglet garde son adresse propre.
 *
 * L'onglet Équipe n'apparaît qu'avec la permission correspondante. Elle
 * n'appartient qu'au rôle administrateur — un agent de support voit donc
 * l'entrée de menu, mais jamais la composition de l'équipe.
 */
export function OngletsEquipe() {
  const perms = useMyPermissions();
  const chemin = useRouterState({ select: s => s.location.pathname });

  const onglets = [
    { to: "/admin/support", label: "Demandes d'aide", icone: LifeBuoy, perm: "support" },
    { to: "/admin/equipe", label: "Équipe", icone: UsersRound, perm: "equipe" },
  ].filter(o => perms?.permissions.includes(o.perm as any));

  // Un seul onglet visible n'est pas un choix : ne rien afficher.
  if (onglets.length < 2) return null;

  return (
    <div className="flex gap-1 p-1 rounded-2xl bg-secondary/60 w-fit">
      {onglets.map(o => {
        const actif = chemin === o.to;
        return (
          <Link
            key={o.to}
            to={o.to}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
              actif ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}>
            <o.icone className="w-4 h-4" />
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}

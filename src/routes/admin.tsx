import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, ShieldAlert, CreditCard, Megaphone, Settings, LogOut, BarChart3, LifeBuoy, FileText, UsersRound, Radio, Gift } from "lucide-react";
import { fetchMyPermissions, ROLE_LABELS, type MyPermissions, type Permission } from "@/lib/permissions";
import logo from "@/assets/logo.png";
import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
});

// Chaque entrée porte la permission qu'elle exige. Le menu ne fait que
// refléter les droits : chaque fonction serveur les revérifie de son côté,
// masquer un lien n'ayant jamais empêché personne d'appeler l'API.
//
// « Vue d'ensemble » n'exige rien : elle est le point d'entrée de toute
// l'équipe. Ses chiffres financiers restent servis par des fonctions qui,
// elles, exigent le rôle administrateur.
const adminMenus: {
  to: string; label: string; icon: any; exact?: boolean; perm?: Permission;
}[] = [
  { to: "/admin", label: "Vue d'ensemble", icon: LayoutDashboard, exact: true },
  { to: "/admin/utilisateurs", label: "Utilisateurs", icon: Users, perm: "membres" },
  { to: "/admin/moderation", label: "Modération", icon: ShieldAlert, perm: "moderation" },
  { to: "/admin/abonnements", label: "Abonnements", icon: CreditCard, perm: "finances" },
  { to: "/admin/contenus", label: "Contenus", icon: FileText, perm: "contenus" },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3, perm: "finances" },
  { to: "/admin/support", label: "Support", icon: LifeBuoy, perm: "support" },
  // Menu PRINCIPAL, au même niveau que les autres — et non un sous-menu de
  // Marketing : Pixel, Conversions API, audiences et attribution forment un
  // module autonome, avec sa propre navigation interne.
  { to: "/admin/meta-ads", label: "Meta Ads", icon: Radio, perm: "reglages" },
  { to: "/admin/marketing", label: "Marketing", icon: Megaphone, perm: "reglages" },
  // Sous « finances » et non « reglages » : le module engage des
  // versements réels, et la file des retraits doit rester entre les
  // mains de qui gère déjà l'argent.
  { to: "/admin/parrainage", label: "Parrainage", icon: Gift, perm: "finances" },
  { to: "/admin/equipe", label: "Équipe", icon: UsersRound, perm: "equipe" },
  { to: "/admin/parametres", label: "Paramètres", icon: Settings, perm: "reglages" },
];

function AdminLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [perms, setPerms] = useState<MyPermissions | null>(null);

  useEffect(() => {
    async function checkStaff() {
      const user = await getCurrentUser();

      // Pas de compte → on l'oriente vers l'inscription.
      // `replace: true` retire /admin de l'historique : le bouton Retour
      // ne le ramènera pas ici en boucle.
      if (!user) {
        navigate({ to: "/inscription", replace: true });
        return;
      }

      // Les droits sont décidés EN BASE, jamais ici. `my_permissions()` lit
      // profiles.role pour auth.uid(), et un trigger empêche quiconque de
      // modifier son propre rôle. Cet écran ne fait que refléter une
      // décision serveur : même contourné, il ne donnerait accès à rien,
      // chaque fonction revérifiant la permission qu'elle exige.
      const p = await fetchMyPermissions();

      if (!p.is_staff) {
        // Membre connecté sans droits : renvoyé à l'accueil sans un mot.
        // Un message du type « accès refusé » confirmerait qu'un
        // back-office existe à cette adresse, ce qui inviterait à insister.
        navigate({ to: "/accueil", replace: true });
        return;
      }

      setPerms(p);
    }
    checkStaff();
  }, [navigate]);

  const menus = adminMenus.filter(m => !m.perm || perms?.permissions.includes(m.perm));

  // Tant que le rôle n'est pas tranché — et pendant la redirection des
  // non-autorisés — on n'affiche qu'un écran neutre. Il ne doit rien
  // laisser deviner du contenu qui se trouve derrière.
  if (!perms) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        Chargement…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/20 flex font-sans text-foreground">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex flex-col hidden md:flex">
        <div className="p-6 flex items-center gap-3">
          <img src={logo} alt="AgapeMeet Admin" className="w-8 h-8 object-contain" />
          <div className="min-w-0">
            <span className="font-serif text-xl font-bold text-primary block leading-none">
              AgapeAdmin
            </span>
            {/* Le rôle est affiché : un agent doit savoir à quel titre il
                agit, et pourquoi certaines sections lui sont absentes. */}
            <span className="text-[11px] text-muted-foreground">
              {ROLE_LABELS[perms.role]}
            </span>
          </div>
        </div>
        <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto">
          {menus.map((item) => {
            const Icon = item.icon;
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm ${
                  active 
                    ? "bg-primary text-primary-foreground shadow-soft" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border">
          <button 
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/login" });
            }}
            className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors text-sm font-medium"
          >
            <LogOut className="w-5 h-5" />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header (Hidden on Desktop) */}
        <header className="md:hidden bg-card border-b border-border p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={logo} alt="AgapeMeet" className="w-8 h-8 object-contain" />
            <span className="font-serif font-bold text-primary">Admin</span>
          </div>
          <div className="text-sm text-muted-foreground">Ouvrez sur PC pour plus de confort</div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

import { createFileRoute, Outlet, Link, useNavigate } from "@tanstack/react-router";
import { BottomNav } from "@/components/app/BottomNav";
import { MenuParrainage } from "@/components/app/MenuParrainage";
import { Bell, Crown, Rocket, Shield, User } from "lucide-react";
import {
  BOOST_DURATION_MIN,
  boostErrorMessage,
  fetchBoostStatus,
  minutesLeft,
  startBoost,
  type BoostStatus,
} from "@/lib/boost";
import { SubscriptionProvider } from "@/lib/subscription";
import logo from "@/assets/logo.png";
import { useEffect, useState } from "react";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Settings, Languages, Package, CreditCard, Ban, Trash2, LogOut, MessageSquare, Heart, LifeBuoy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { usePresence } from "@/hooks/usePresence";
import { IncomingCallListener } from "@/components/app/IncomingCallListener";
import { BoostPicker } from "@/components/app/BoostPicker";
import { useIsAdmin } from "@/lib/auth";
import { useSetting } from "@/lib/appSettings";
import { MaintenanceScreen } from "@/components/MaintenanceScreen";
import { SuspendedScreen } from "@/components/SuspendedScreen";
import { InstallPrompt } from "@/components/app/InstallPrompt";
import { InstallMenuItem } from "@/components/app/InstallMenuItem";
import { DELETION_REASONS, motifErrorMessage, type DeletionReason } from "@/lib/motifs";

export const Route = createFileRoute("/_app")({
  // No beforeLoad — auth is checked client-side only to avoid SSR logout on refresh
  component: AppLayout,

  // `noindex` posé une seule fois, sur la mise en page : tout l'espace
  // connecté en hérite, y compris les routes ajoutées plus tard.
  //
  // C'est cette balise, et non `robots.txt`, qui fait sortir une page de
  // l'index. Un `Disallow` interdit la LECTURE : Google cesse alors de
  // venir, ne voit jamais le `noindex`, et garde l'URL indexée sans
  // contenu — l'avertissement « Indexée malgré le blocage par le fichier
  // robots.txt ». Pour désindexer, il faut au contraire laisser entrer.
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
});

/**
 * Bouton Boost de l'en-tête.
 * Pendant un boost actif, l'icône reste allumée avec le décompte —
 * sinon l'utilisateur ne saurait pas que son boost tourne.
 */
function BoostButton() {
  const [status, setStatus] = useState<BoostStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [, forceTick] = useState(0);
  const [pickerReason, setPickerReason] = useState<"plan" | "quota" | null>(null);

  const refresh = async () => setStatus(await fetchBoostStatus());

  useEffect(() => { refresh(); }, []);

  // Rafraîchit le décompte chaque minute tant qu'un boost tourne
  useEffect(() => {
    if (!status?.activeUntil) return;
    const t = setInterval(() => {
      if (minutesLeft(status.activeUntil) <= 0) refresh();
      else forceTick(n => n + 1);
    }, 60000);
    return () => clearInterval(t);
  }, [status?.activeUntil]);

  const active = minutesLeft(status?.activeUntil ?? null) > 0;

  const handleClick = async () => {
    if (busy) return;

    if (active) {
      toast.info(`Boost actif encore ${minutesLeft(status!.activeUntil)} min`, {
        description: "Votre profil est mis en avant dans les découvertes.",
      });
      return;
    }

    setBusy(true);
    const res = await startBoost();
    setBusy(false);

    if (res.ok) {
      toast.success(`Boost activé pour ${BOOST_DURATION_MIN} minutes 🚀`, {
        description: "Votre profil passe en tête des découvertes.",
      });
      refresh();
      return;
    }

    // Pas de Boost disponible → on propose l'achat plutôt qu'un simple refus
    if (res.reason === "plan" || res.reason === "quota") {
      setPickerReason(res.reason);
      return;
    }

    toast.error(boostErrorMessage(res.reason, res.expiresAt));
    refresh();
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={busy}
        aria-label="Boost"
        title={active ? `Boost actif — ${minutesLeft(status!.activeUntil)} min` : "Booster mon profil"}
        className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-transform hover:scale-105 disabled:opacity-60 ${
          active
            ? "bg-primary text-primary-foreground shadow-elegant"
            : "border border-border bg-background hover:bg-secondary"
        }`}
      >
        <Rocket className={`w-4 h-4 ${active ? "animate-pulse" : ""}`} />
        {active && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1 rounded-full bg-primary text-primary-foreground text-[8px] font-bold leading-tight">
            {minutesLeft(status!.activeUntil)}
          </span>
        )}
        {!active && status && status.left !== 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-gold border border-background" />
        )}
      </button>

      {pickerReason && (
        <BoostPicker reason={pickerReason} onClose={() => { setPickerReason(null); refresh(); }} />
      )}
    </>
  );
}

function AppLayout() {
  usePresence();
  
  const isAdmin = useIsAdmin();
  const maintenance = useSetting<boolean>("maintenance_mode", false);
  const [suspension, setSuspension] = useState<{
    suspended: boolean; until?: string; reason?: string; permanent?: boolean;
  } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteReason, setDeleteReason] = useState<DeletionReason | null>(null);
  const [deleteDetails, setDeleteDetails] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const navigate = useNavigate();

  const handleDeleteAccount = async () => {
    if (!deleteReason) {
      toast.error("Indiquez ce qui vous fait partir.");
      return;
    }
    if (deleteReason === "autre" && deleteDetails.trim().length < 10) {
      toast.error("Précisez votre raison en quelques mots.");
      return;
    }
    if (deleteConfirm !== "SUPPRIMER") {
      toast.error("Veuillez taper SUPPRIMER pour confirmer.");
      return;
    }

    setIsDeleting(true);
    try {
      // Une seule transaction côté base : enregistrement du motif PUIS
      // suppression. En deux requêtes depuis le navigateur, une coupure
      // entre les deux — ou l'onglet fermé aussitôt — laisserait un compte
      // supprimé sans la moindre explication.
      const { error } = await supabase.rpc("delete_my_account", {
        p_reason: deleteReason,
        p_details: deleteDetails.trim() || null,
      });
      if (error) throw error;

      await supabase.auth.signOut();
      navigate({ to: "/login" });
      toast.success(
        deleteReason === "trouve_partenaire"
          ? "Compte supprimé. Que Dieu bénisse votre union 🙏"
          : "Compte supprimé. Merci pour votre retour.",
      );
    } catch (e: any) {
      console.error("[suppression compte]", e);
      toast.error(motifErrorMessage(e));
    } finally {
      setIsDeleting(false);
    }
  };

  // Enregistrement du service worker.
  //
  // Ici et non à la racine : seuls les membres connectés reçoivent des
  // notifications, et l'enregistrer sur la vitrine publique ferait
  // télécharger un fichier inutile à chaque visiteur.
  //
  // Aucune demande d'autorisation à cette étape — elle part uniquement
  // du bouton dans les réglages. Demander au chargement fait refuser la
  // plupart des gens, et un refus est presque irréversible.
  useEffect(() => {
    import("@/lib/push").then(m => m.enregistrerServiceWorker());
    // Signale l'usage en mode installé — c'est ce qui rattrape iPhone,
    // où l'évènement `appinstalled` n'existe pas.
    import("@/lib/install").then(m => m.signalerSiInstalle());
  }, []);

  useEffect(() => {
    // This only runs in the browser, after hydration.
    // It reads the Supabase session from localStorage — the correct way.
    let cancelled = false;
    async function checkAuth() {
      try {
        const { supabase } = await import("@/lib/supabase");
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!session) {
          navigate({ to: "/login", replace: true });
        } else {
          setAuthed(true);
          setAuthChecked(true);

          // Vérifié à chaque ouverture : une suspension prononcée pendant
          // qu'une session est ouverte doit prendre effet au rechargement,
          // sans attendre l'expiration du jeton.
          supabase.rpc("my_suspension").then(({ data }: any) => {
            if (!cancelled && data) setSuspension(data);
          });

          // Fetch user avatar
          supabase
            .from("profiles")
            .select("photos")
            .eq("id", session.user.id)
            .single()
            .then(({ data }: any) => {
              if (data && data.photos && data.photos.length > 0) {
                setAvatarUrl(data.photos[0]);
              }
            });
        }
      } catch {
        if (!cancelled) navigate({ to: "/login", replace: true });
      }
    }
    checkAuth();

    // Also listen for auth state changes (logout from another tab, token expiry)
    let unsub: (() => void) | undefined;
    import("@/lib/supabase").then(({ supabase }) => {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event: any, session: any) => {
        if (cancelled) return;
        if (!session) {
          navigate({ to: "/login", replace: true });
        } else {
          setAuthed(true);
          setAuthChecked(true);
        }
      });
      unsub = () => subscription.unsubscribe();
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [navigate]);

  // Compte suspendu : l'écran remplace toute l'application. Il passe AVANT
  // le mode maintenance — un membre suspendu doit lire pourquoi, pas un
  // message d'indisponibilité qui l'enverrait ouvrir un ticket.
  if (suspension?.suspended) {
    return (
      <SuspendedScreen
        until={suspension.until}
        reason={suspension.reason}
        permanent={suspension.permanent}
      />
    );
  }

  // Mode maintenance : l'application est fermée aux membres, mais reste
  // ouverte aux administrateurs — sinon celui qui l'active se verrouillerait
  // lui-même dehors et ne pourrait plus le désactiver.
  // `undefined` signifie « pas encore connu » : on ne coupe l'accès qu'une
  // fois les deux réponses arrivées, jamais sur une supposition.
  if (maintenance === true && isAdmin === false) {
    return <MaintenanceScreen />;
  }

  // Show nothing while checking — prevents flash of protected content
  if (!authChecked || !authed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <img src={logo} alt="AgapeMeet" className="w-12 h-12 object-contain animate-pulse" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <SubscriptionProvider>
      {/* Sonne depuis n'importe quelle page de l'app */}
      <IncomingCallListener />
      <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30">
        <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b border-border/50">
          <div className="max-w-2xl mx-auto flex items-center justify-between px-4 py-3">
            <Link to="/" className="flex items-center gap-2">
              <img src={logo} alt="AgapeMeet" className="w-9 h-9 object-contain" />
              <span className="font-serif text-lg font-semibold">AgapeMeet</span>
            </Link>
            <div className="flex items-center gap-2">
              {/* Visible des seuls administrateurs. C'est la porte d'entrée
                  du back-office : aucun lien n'y mène ailleurs dans l'app. */}
              {isAdmin && (
                <Link
                  to="/admin"
                  aria-label="Administration"
                  title="Administration"
                  className="w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center shadow-soft transition-transform hover:scale-105"
                >
                  <Shield className="w-4 h-4" />
                </Link>
              )}
              <Link
                to="/abonnement"
                aria-label="Abonnement"
                title="Abonnement"
                className="w-9 h-9 rounded-full bg-gold text-gold-foreground flex items-center justify-center shadow-soft transition-transform hover:scale-105"
              >
                <Crown className="w-4 h-4" />
              </Link>
              <BoostButton />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Notifications"
                    className="relative w-9 h-9 rounded-full border border-border bg-background hover:bg-secondary flex items-center justify-center transition-transform hover:scale-105"
                  >
                    <Bell className="w-4 h-4" />
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 rounded-2xl shadow-elegant border-border/50 bg-background/95 backdrop-blur-xl p-0 mt-2">
                  <div className="px-4 py-3 border-b border-border/50 flex justify-between items-center">
                    <span className="font-semibold text-sm">Notifications</span>
                    <span className="text-xs text-primary font-medium cursor-pointer">Tout marquer comme lu</span>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
                    <DropdownMenuItem asChild className="p-3 m-1 rounded-xl cursor-pointer hover:bg-secondary flex items-start gap-3">
                      <Link to="/demandes">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <Heart className="w-4 h-4" fill="currentColor" />
                        </div>
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium leading-none">Nouveau Super Like !</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">Quelqu'un a eu un énorme coup de cœur pour vous.</p>
                          <p className="text-[10px] text-muted-foreground">Il y a 5 min</p>
                        </div>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="p-3 m-1 rounded-xl cursor-pointer hover:bg-secondary flex items-start gap-3">
                      <Link to="/messages">
                        <div className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                          <MessageSquare className="w-4 h-4" />
                        </div>
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium leading-none">Nouveau message</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">Sarah : "Salut ! J'ai vu que tu aimais..."</p>
                          <p className="text-[10px] text-muted-foreground">Il y a 1h</p>
                        </div>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="p-3 m-1 rounded-xl cursor-pointer hover:bg-secondary flex items-start gap-3">
                      <Link to="/parametres/securite">
                        <div className="w-8 h-8 rounded-full bg-gold/10 text-gold flex items-center justify-center shrink-0">
                          <Settings className="w-4 h-4" />
                        </div>
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium leading-none">Sécurisez votre compte</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">Complétez la vérification de votre profil.</p>
                          <p className="text-[10px] text-muted-foreground">Hier</p>
                        </div>
                      </Link>
                    </DropdownMenuItem>
                  </div>
                  <div className="p-2 border-t border-border/50">
                    <Link to="/parametres/notifications" className="block text-center text-xs text-muted-foreground hover:text-foreground p-2 transition-colors">
                      Paramètres de notification
                    </Link>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Menu"
                    className="w-9 h-9 rounded-full border border-border bg-background hover:bg-secondary flex items-center justify-center overflow-hidden transition-transform hover:scale-105"
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-4 h-4" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 rounded-2xl shadow-elegant border-border/50 bg-background/95 backdrop-blur-xl p-2 mt-2">
                  <DropdownMenuLabel className="px-2 py-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Mon Compte
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-border/50" />
                  
                  <DropdownMenuItem asChild className="rounded-xl cursor-pointer hover:bg-primary/10">
                    <Link to="/profil" className="flex items-center gap-3 py-2.5 px-2">
                      <User className="w-4 h-4" />
                      <span className="font-medium">Mon profil</span>
                    </Link>
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem asChild className="rounded-xl cursor-pointer hover:bg-secondary">
                    <Link to="/abonnement" className="flex items-center gap-3 py-2.5 px-2">
                      <Crown className="w-4 h-4 text-gold" />
                      <span className="font-medium">Abonnement & Facturation</span>
                    </Link>
                  </DropdownMenuItem>

                  {/* Juste après l'abonnement : c'est là que le membre a
                      l'argent en tête. N'apparaît que si le programme
                      est ouvert ET qu'il y a droit. */}
                  <MenuParrainage />

                  <DropdownMenuSeparator className="bg-border/50 mt-2 mb-2" />
                  <DropdownMenuLabel className="px-2 py-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Paramètres
                  </DropdownMenuLabel>
                  
                  <DropdownMenuItem asChild className="rounded-xl cursor-pointer hover:bg-secondary">
                    <Link to="/parametres/securite" className="flex items-center gap-3 py-2.5 px-2">
                      <Settings className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">Sécurité</span>
                    </Link>
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem asChild className="rounded-xl cursor-pointer hover:bg-secondary">
                    <Link to="/parametres/notifications" className="flex items-center gap-3 py-2.5 px-2">
                      <Bell className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">Notifications</span>
                    </Link>
                  </DropdownMenuItem>
                  
                  {/* Disponible en permanence, contrairement au bandeau
                      qui n'apparaît qu'au 3ᵉ passage et se tait 60 jours
                      après un refus. Se retire d'elle-même une fois
                      l'application installée. */}
                  <InstallMenuItem />

                  <DropdownMenuItem asChild className="rounded-xl cursor-pointer hover:bg-secondary">
                    <Link to="/parametres/langue" className="flex items-center gap-3 py-2.5 px-2">
                      <Languages className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">Langue</span>
                    </Link>
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem asChild className="rounded-xl cursor-pointer hover:bg-secondary">
                    <Link to="/parametres/bloques" className="flex items-center gap-3 py-2.5 px-2">
                      <Ban className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">Profils bloqués</span>
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem asChild className="rounded-xl cursor-pointer hover:bg-secondary">
                    <Link to="/aide" className="flex items-center gap-3 py-2.5 px-2">
                      <LifeBuoy className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">Aide et support</span>
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator className="bg-border/50 mt-2 mb-2" />
                  
                  <DropdownMenuItem 
                    onSelect={(e) => {
                      e.preventDefault(); // Prevent dropdown from closing immediately which breaks dialog focus
                      setIsDeleteDialogOpen(true);
                    }}
                    className="rounded-xl cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <div className="flex items-center gap-3 py-2.5 px-2 w-full">
                      <Trash2 className="w-4 h-4" />
                      <span className="font-medium">Supprimer le compte</span>
                    </div>
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem 
                    onSelect={async () => {
                      await supabase.auth.signOut();
                      navigate({ to: "/login" });
                    }}
                    className="rounded-xl cursor-pointer hover:bg-secondary"
                  >
                    <div className="flex items-center gap-3 py-2.5 px-2 w-full">
                      <LogOut className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">Déconnexion</span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent className="w-[90vw] max-w-md rounded-3xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Êtes-vous absolument sûr ?</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-3">
                        <p>
                          Cette action est irréversible. Elle supprimera définitivement votre compte,
                          vos photos, vos matchs et vos messages.
                        </p>

                        {/* Le motif est demandé AVANT la confirmation : posé
                            après, il serait ignoré par quelqu'un dont la
                            décision est déjà exécutée. C'est la seule
                            information qu'on ne peut pas reconstituer
                            ensuite — le compte n'existe plus. */}
                        <div className="text-left">
                          <p className="font-medium text-foreground mb-2">
                            Qu'est-ce qui vous fait partir ?
                          </p>
                          <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                            {DELETION_REASONS.map(r => (
                              <button
                                key={r.key}
                                type="button"
                                onClick={() => setDeleteReason(r.key)}
                                className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${
                                  deleteReason === r.key
                                    ? "border-primary bg-primary/5"
                                    : "border-border hover:bg-secondary/50"
                                }`}
                              >
                                <span className="text-sm font-medium text-foreground">{r.label}</span>
                                {r.hint && (
                                  <span className="block text-[11px] text-muted-foreground mt-0.5">
                                    {r.hint}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>

                          <textarea
                            value={deleteDetails}
                            onChange={(e) => setDeleteDetails(e.target.value)}
                            rows={2}
                            maxLength={500}
                            placeholder={
                              deleteReason === "autre"
                                ? "Dites-nous en quelques mots (obligatoire)"
                                : "Un mot de plus, si vous le souhaitez"
                            }
                            className="mt-2 w-full px-3 py-2 rounded-xl bg-background border border-border text-sm resize-y text-foreground"
                          />
                        </div>

                        <p className="font-medium text-foreground">
                          Veuillez taper <strong className="text-destructive">SUPPRIMER</strong> pour confirmer.
                        </p>
                        <Input
                          value={deleteConfirm}
                          onChange={(e) => setDeleteConfirm(e.target.value)}
                          placeholder="SUPPRIMER"
                          className="mt-2"
                        />
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="mt-4 gap-2 sm:gap-0">
                    <AlertDialogCancel className="rounded-xl">Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => {
                        e.preventDefault();
                        handleDeleteAccount();
                      }}
                      className="rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                      disabled={isDeleting}
                    >
                      {isDeleting ? "Suppression..." : "Supprimer mon compte"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </header>
        <main className="max-w-2xl mx-auto pb-28">
          <Outlet />
        </main>
        <BottomNav />
        <InstallPrompt />
      </div>
    </SubscriptionProvider>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BellRing, Heart, Mail, MessageSquare, Eye, Users, Megaphone, ShieldCheck } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth";
import { PushToggle } from "@/components/app/PushToggle";
import { PushEngagement } from "@/components/app/PushEngagement";

export const Route = createFileRoute("/_app/parametres/notifications")({
  head: () => ({
    meta: [{ title: "Notifications — AgapeMeet" }],
  }),
  component: NotificationsPage,
});

/**
 * Préférences d'e-mail.
 *
 * Elles vivaient dans le localStorage — donc invisibles du serveur, qui
 * n'aurait pas pu les respecter au moment d'envoyer. Elles sont désormais
 * en base, dans `email_preferences`, lue par les Edge Functions avant
 * chaque envoi facultatif.
 */
type Prefs = {
  matches: boolean;
  messages: boolean;
  visitors: boolean;
  community: boolean;
  marketing: boolean;
};

const DEFAULTS: Prefs = {
  matches: true,
  messages: true,
  visitors: true,
  community: true,
  // Le marketing exige un consentement explicite : jamais activé d'office.
  marketing: false,
};

const ITEMS: { key: keyof Prefs; icon: any; label: string; hint: string }[] = [
  { key: "matches", icon: Heart, label: "Nouveaux matchs", hint: "Quand l'intérêt est réciproque" },
  { key: "messages", icon: MessageSquare, label: "Messages non lus", hint: "Un résumé par jour, jamais plus" },
  { key: "visitors", icon: Eye, label: "Visiteurs de votre profil", hint: "Récapitulatif hebdomadaire" },
  { key: "community", icon: Users, label: "Communauté", hint: "Réponses à vos publications" },
  { key: "marketing", icon: Megaphone, label: "Actualités et conseils", hint: "Nouveautés, articles, offres" },
];

function NotificationsPage() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const id = await getCurrentUserId();
      if (!id) { setLoading(false); return; }
      setUserId(id);

      const { data, error } = await supabase
        .from("email_preferences")
        .select("matches, messages, visitors, community, marketing")
        .eq("user_id", id)
        .maybeSingle();

      if (error) console.error("[notifications] chargement:", error);
      if (data) setPrefs(data as Prefs);
      setLoading(false);
    }
    load();
  }, []);

  const toggle = async (key: keyof Prefs) => {
    if (!userId) return;

    const previous = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);

    const { error } = await supabase
      .from("email_preferences")
      .upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });

    if (error) {
      console.error("[notifications] enregistrement:", error);
      setPrefs(previous); // on rétablit plutôt que d'afficher un choix non enregistré
      toast.error("Le réglage n'a pas pu être enregistré");
      return;
    }
    toast.success("Préférences enregistrées");
  };

  return (
    <div className="px-4 pt-4 pb-12 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link to="/accueil" className="w-10 h-10 rounded-full border border-border flex items-center justify-center hover:bg-secondary transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="font-serif text-2xl font-semibold">Notifications</h1>
      </div>

      <div className="flex flex-col items-center justify-center py-4 mb-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <BellRing className="w-8 h-8 text-primary" />
        </div>
        <p className="text-sm text-center text-muted-foreground px-4">
          Choisissez comment nous vous prévenons.
        </p>
      </div>

      {/* Le push d'abord : c'est l'immédiat. Les e-mails viennent après,
          ils relèvent du récapitulatif. */}
      <div className="mb-6 space-y-3">
        <PushToggle />
        {/* Réglage SÉPARÉ du push transactionnel. Quelqu'un peut vouloir
            être averti de ses messages sans recevoir de relance : les
            confondre ferait perdre les deux au premier agacement — et un
            refus de notifications, lui, est définitif. */}
        <PushEngagement />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 rounded-2xl bg-secondary animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="bg-card border border-border/50 rounded-3xl p-5 shadow-soft">
            <div className="flex items-center gap-3 mb-5">
              <Mail className="w-5 h-5 text-primary" />
              <h2 className="font-serif text-lg font-medium">E-mails</h2>
            </div>

            <div className="space-y-5">
              {ITEMS.map((item, i) => (
                <div key={item.key}>
                  {i > 0 && <div className="h-px bg-border/50 w-full mb-5" />}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <item.icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.hint}</p>
                      </div>
                    </div>
                    <Switch checked={prefs[item.key]} onCheckedChange={() => toggle(item.key)} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ce que l'utilisateur ne peut pas désactiver — annoncé clairement
              plutôt que découvert dans sa boîte mail. */}
          <div className="mt-4 rounded-2xl border border-border/60 bg-secondary/40 p-4 flex gap-3">
            <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Toujours envoyés</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Les confirmations de paiement et les alertes de sécurité de votre compte
                vous parviennent quoi qu'il arrive. Ces messages ne relèvent pas de la
                prospection : ils concernent vos transactions et la protection de votre compte.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

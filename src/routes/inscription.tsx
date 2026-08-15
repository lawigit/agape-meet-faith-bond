import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useState } from "react";
import { Eye, EyeOff, User, Mail, Lock, CalendarDays, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import logoAsset from "@/assets/logo.png";
import { toast } from "sonner";
import { useSetting } from "@/lib/appSettings";

export const Route = createFileRoute("/inscription")({
  head: () => ({
    meta: [
      { title: "Créer votre compte — AgapeMeet" },
      {
        name: "description",
        content:
          "Créez votre compte AgapeMeet gratuitement et rejoignez une communauté de chrétiens qui cherchent une relation sérieuse orientée vers le mariage.",
      },
      { property: "og:title", content: "Créer votre compte — AgapeMeet" },
      { property: "og:url", content: "https://agapemeet.com/inscription" },
      { property: "og:type", content: "website" },
    ],
    // Absolue, pour la même raison que sur la page d'accueil
    links: [{ rel: "canonical", href: "https://agapemeet.com/inscription" }],
  }),
  component: InscriptionPage,
});

function InscriptionPage() {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedCGU, setAcceptedCGU] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const registrationOpen = useSetting<boolean>("registration_open", true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Vérifié aussi ici, et pas seulement en désactivant le bouton :
    // le formulaire peut être soumis à la touche Entrée, et l'état a pu
    // changer entre l'ouverture de la page et l'envoi.
    if (registrationOpen === false) {
      toast.error("Les inscriptions sont momentanément fermées.");
      return;
    }

    // Messages distincts : « remplissez tous les champs » oblige à
    // chercher lequel manque.
    if (firstName.trim().length < 2) {
      toast.error("Votre prénom est requis");
      return;
    }
    if (lastName.trim().length < 2) {
      toast.error("Votre nom est requis");
      return;
    }
    if (!email.trim().includes("@")) {
      toast.error("L'adresse e-mail semble incomplète");
      return;
    }
    if (password.length < 6) {
      toast.error("Le mot de passe doit contenir au moins 6 caractères");
      return;
    }
    if (!acceptedCGU) {
      toast.error("Veuillez accepter les conditions d'utilisation");
      return;
    }

    setLoading(true);
    try {
      const { supabase } = await import("@/lib/supabase");

      const prenom = firstName.trim();
      const nom = lastName.trim();

      // 1. Inscription Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: prenom,
            last_name: nom,
          }
        }
      });

      if (authError) throw authError;

      // Stocker l'ID et les metadonnées dans sessionStorage
      // pour l'onboarding (même si l'email n'est pas encore confirmé)
      const userId = authData.user?.id || authData.session?.user?.id;
      if (userId) {
        sessionStorage.setItem("agape_pending_user_id", userId);
        sessionStorage.setItem("agape_pending_first_name", prenom);
        sessionStorage.setItem("agape_pending_last_name", nom);
      }
      
      toast.success("Compte créé avec succès !");
      navigate({ to: "/onboarding" });
    } catch (err: any) {
      toast.error("Erreur lors de l'inscription : " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/30 flex flex-col">
      <header className="absolute top-0 left-0 right-0 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logoAsset} alt="AgapeMeet" className="w-10 h-10 object-contain" />
            <span className="font-serif text-xl font-semibold">AgapeMeet</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-10">
            <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-foreground tracking-tight">
              Créez votre compte.
            </h1>
            <p className="text-muted-foreground mt-3 text-sm sm:text-base">
              En moins d'une minute. Sécurisé et sans engagement.
            </p>
          </div>

          {registrationOpen === false && (
            <div className="mb-6 rounded-2xl border border-gold/50 bg-gold/10 p-4 text-sm leading-relaxed">
              <p className="font-semibold">Les inscriptions sont momentanément fermées.</p>
              <p className="text-muted-foreground mt-1">
                Nous accueillons de nouveaux membres par vagues, afin que chacun
                trouve une communauté vivante. Revenez d'ici quelques jours — et
                si vous avez déjà un compte, vous pouvez{" "}
                <Link to="/login" className="text-primary underline underline-offset-2">
                  vous connecter
                </Link>
                .
              </p>
            </div>
          )}

          <div className="bg-card rounded-[2rem] shadow-elegant border border-border/50 p-8 sm:p-10">
            <form onSubmit={handleSubmit} className="space-y-6">

              {/* Deux champs distincts. Le champ unique « Nom complet »
                  était découpé sur le premier espace : « Jean-Baptiste
                  Kouassi N'Guessan » devenait prénom « Jean-Baptiste »
                  — correct par chance — mais « Marie Claire Diallo »
                  donnait le prénom « Marie » et le nom « Claire Diallo ».
                  Aucune heuristique ne peut trancher : seule la personne
                  concernée le sait. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstname" className="text-sm font-semibold">Prénom</Label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="firstname"
                      type="text"
                      autoComplete="given-name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Marie Claire"
                      required
                      className="pl-11 h-12 bg-background/50 focus:bg-background transition-colors text-base rounded-xl"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lastname" className="text-sm font-semibold">Nom</Label>
                  <Input
                    id="lastname"
                    type="text"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Diallo"
                    required
                    className="h-12 bg-background/50 focus:bg-background transition-colors text-base rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="votre@gmail.com"
                    required
                    className="pl-11 h-12 bg-background/50 focus:bg-background transition-colors text-base rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold">Mot de passe</Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="pl-11 pr-11 h-12 bg-background/50 focus:bg-background transition-colors text-base rounded-xl"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <label className="flex items-start gap-3 cursor-pointer group mt-2">
                <div className="relative mt-0.5 shrink-0">
                  <input
                    type="checkbox"
                    checked={acceptedCGU}
                    onChange={(e) => setAcceptedCGU(e.target.checked)}
                    className="peer sr-only"
                    required
                  />
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                    acceptedCGU
                      ? "bg-primary border-primary"
                      : "border-border bg-background group-hover:border-primary/50"
                  }`}>
                    {acceptedCGU && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                  </div>
                </div>
                {/* Les liens OUVRENT VRAIMENT les pages, dans un nouvel
                    onglet. Ils pointaient sur « # » avec un
                    `preventDefault()` : on faisait accepter des conditions
                    qu'il était impossible de lire. Un consentement à un
                    texte inaccessible ne vaut rien — ni juridiquement, ni
                    devant un membre qui conteste.

                    `stopPropagation` : sans lui, cliquer le lien
                    cocherait aussi la case, puisqu'il vit dans le
                    `<label>`. */}
                <span className="text-sm text-muted-foreground leading-relaxed select-none">
                  Je certifie avoir <strong className="text-foreground font-medium">18 ans ou plus</strong> et
                  j'accepte les{" "}
                  <Link
                    to="/conditions"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-primary hover:underline font-medium"
                  >
                    conditions d'utilisation
                  </Link>{" "}
                  ainsi que la{" "}
                  <Link
                    to="/confidentialite"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-primary hover:underline font-medium"
                  >
                    politique de confidentialité
                  </Link>{" "}
                  d'AgapeMeet.
                </span>
              </label>

              <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} className="pt-2">
                <Button
                  type="submit"
                  size="lg"
                  disabled={loading || !acceptedCGU || registrationOpen === false}
                  className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base shadow-soft"
                >
                  {registrationOpen === false
                    ? "Inscriptions fermées"
                    : loading ? "Création en cours..." : "Créer mon compte"}
                </Button>
              </motion.div>
            </form>

            <div className="mt-8 text-center">
              <p className="text-sm text-muted-foreground">
                Déjà un compte ?{" "}
                <Link to="/login" className="text-primary font-semibold hover:underline">
                  Se connecter
                </Link>
              </p>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

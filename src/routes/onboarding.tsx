import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect, useRef, useMemo, type ReactElement } from "react";
import { Heart, Search, Camera, Church, ArrowRight, ArrowLeft, Upload, X, Sparkles, Check } from "lucide-react";
import { Music2, Instagram, Facebook, Youtube, Users, MoreHorizontal, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoAsset from "@/assets/logo.png";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PaysSelect, VilleSelect } from "@/components/app/PaysVilleSelect";
import { DENOMINATIONS_CONNUES, MARITAL_STATUSES } from "@/lib/profilChamps";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { getSessionUser } from "@/lib/auth";
import { compresserImage } from "@/lib/image";

type Photo = { id: string; url: string; name: string };

// ---------- Gender icons (primary blue) ----------
function ManIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      {/* Head + shoulders silhouette with short hair */}
      <path
        d="M20 22c0-7 5.5-13 12-13s12 6 12 13c0 2-.4 4-1 6 1 .5 1.5 1.5 1.5 2.5 0 1.5-1 3-2.5 3.5C40.5 39 36.8 43 32 43s-8.5-4-10-9c-1.5-.5-2.5-2-2.5-3.5 0-1 .5-2 1.5-2.5-.6-2-1-4-1-6z"
        fill="currentColor"
      />
      <path
        d="M14 58c0-8 7-14 18-14s18 6 18 14v2H14v-2z"
        fill="currentColor"
      />
    </svg>
  );
}
function WomanIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      {/* Head + shoulders silhouette with long hair */}
      <path
        d="M18 34c0-3 1-5 2.5-6.5C19.5 26 19 24 19 22c0-8 5.8-14 13-14s13 6 13 14c0 2-.5 4-1.5 5.5C45 29 46 31 46 34c0 2-1 4-3 5-1.4 5-5.6 8.5-11 8.5s-9.6-3.5-11-8.5c-2-1-3-3-3-5z"
        fill="currentColor"
      />
      <path
        d="M14 60c0-9 8-15 18-15s18 6 18 15H14z"
        fill="currentColor"
      />
    </svg>
  );
}

function GenderChoice({
  active,
  onClick,
  label,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: (props: { className?: string }) => ReactElement;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col items-center justify-center gap-2 rounded-2xl border-2 py-5 px-4 transition-all ${
        active
          ? "border-primary bg-primary/5 shadow-elegant"
          : "border-border hover:border-primary/40 bg-background"
      }`}
      aria-pressed={active}
    >
      <Icon
        className={`w-10 h-10 transition-colors ${
          active ? "text-primary" : "text-primary/60 group-hover:text-primary"
        }`}
      />
      <span
        className={`text-sm font-medium ${
          active ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

type OnboardingData = {
  source: string;
  birthDate: string;
  gender: string;
  city: string;
  country: string;
  bio: string;
  denomination: string;
  practiceLevel: string;
  baptized: string;
  churchAttendance: string;
  seekingGender: string;
  maritalStatus: string;
  marriageIntent: string;
  hasChildren: string;
  wantsChildren: string;
  photos: Photo[];
};

const initialData: OnboardingData = {
  source: "",
  birthDate: "",
  gender: "",
  city: "",
  country: "",
  bio: "",
  denomination: "",
  practiceLevel: "",
  baptized: "",
  churchAttendance: "",
  seekingGender: "",
  maritalStatus: "",
  marriageIntent: "",
  hasChildren: "",
  wantsChildren: "",
  photos: [],
};

const steps = [
  { id: 1, title: "Profil", subtitle: "Faisons connaissance", icon: Heart },
  { id: 2, title: "Foi", subtitle: "Votre confession", icon: Church },
  { id: 3, title: "Recherche", subtitle: "Vos critères", icon: Search },
  { id: 4, title: "Photos", subtitle: "Montrez-vous", icon: Camera },
];

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Créer votre profil — AgapeMeet" },
      {
        name: "description",
        content:
          "Créez votre profil AgapeMeet en 4 étapes : identité, foi, critères de recherche et photos. Une rencontre chrétienne sérieuse commence ici.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Créer votre profil — AgapeMeet" },
      {
        property: "og:description",
        content:
          "Rejoignez AgapeMeet et créez votre profil en 4 étapes simples.",
      },
    ],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const [step, setStep] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    try {
      const saved = localStorage.getItem("agape_onboarding_step");
      return saved ? parseInt(saved, 10) : 1;
    } catch {
      return 1;
    }
  });
  const [data, setData] = useState<OnboardingData>(() => {
    if (typeof window === "undefined") return initialData;
    try {
      const saved = localStorage.getItem("agape_onboarding_data");
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...initialData, ...parsed, photos: [] };
      }
    } catch {}
    return initialData;
  });
  const [submitted, setSubmitted] = useState(false);

  // Sauvegarder dans localStorage à chaque changement
  useEffect(() => {
    try {
      localStorage.setItem("agape_onboarding_step", String(step));
    } catch {}
  }, [step]);

  useEffect(() => {
    // Ne pas sauvegarder les photos (fichiers locaux)
    const { photos, ...toSave } = data;
    try {
      localStorage.setItem("agape_onboarding_data", JSON.stringify(toSave));
    } catch {}
  }, [data]);

  const update = <K extends keyof OnboardingData>(
    key: K,
    value: OnboardingData[K],
  ) => setData((d) => ({ ...d, [key]: value }));

  const canNext = useMemo(() => {
    if (step === 1) {
      const isAdult = (() => {
        if (!data.birthDate) return false;
        const birth = new Date(data.birthDate);
        const today = new Date();
        const age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        return age > 18 || (age === 18 && m >= 0 && (m > 0 || today.getDate() >= birth.getDate()));
      })();
      return (
        data.birthDate !== "" &&
        isAdult &&
        data.gender !== "" &&
        data.city.trim().length >= 2 &&
        data.country !== "" &&
        data.bio.trim().length >= 10
      );
    }
    if (step === 2)
      return (
        // .trim() : « Autre » ouvre un champ libre, et des espaces seuls
        // laisseraient passer une confession vide.
        data.denomination.trim() !== "" &&
        data.practiceLevel !== "" &&
        data.baptized !== "" &&
        data.churchAttendance !== ""
      );
    if (step === 3)
      return (
        data.seekingGender !== "" &&
        data.maritalStatus !== "" &&
        data.marriageIntent !== "" &&
        data.hasChildren !== "" &&
        data.wantsChildren !== ""
      );
    if (step === 4) return data.photos.length >= 1;
    return false;
  }, [step, data]);

  const progress = (step / steps.length) * 100;

  const handleNext = async () => {
    if (!canNext) {
      toast.error("Veuillez compléter tous les champs requis");
      return;
    }
    if (step < 4) {
      setStep(step + 1);
    } else {
      try {
        const { supabase } = await import('@/lib/supabase');
        
        // Récupérer la session active (getSession inclut le token JWT pour RLS)
        let userId: string | null = null;
        let firstName = "";
        let lastName = "";

        // 1. Essayer la session active
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          userId = session.user.id;
          firstName = session.user.user_metadata?.first_name || "";
          lastName = session.user.user_metadata?.last_name || "";
        } else {
          // 2. Fallback : tenter de récupérer l'utilisateur (refreshToken)
          const user = await getSessionUser();
          if (user) {
            userId = user.id;
            firstName = user.user_metadata?.first_name || "";
            lastName = user.user_metadata?.last_name || "";
          } else {
            // 3. Dernier recours : sessionStorage (email non confirmé)
            if (typeof window !== "undefined") {
              try {
                userId = sessionStorage.getItem("agape_pending_user_id");
                firstName = sessionStorage.getItem("agape_pending_first_name") || "";
                lastName = sessionStorage.getItem("agape_pending_last_name") || "";
              } catch {}
            }
          }
        }

        if (!userId) throw new Error("Erreur: Utilisateur non connecté. Veuillez vous inscrire d'abord.");

        toast.info("Enregistrement du profil en cours...", { id: "saving" });

        const uploadedPhotos = [];
        let dernierEchec: string | null = null;

        for (const [index, photo] of data.photos.entries()) {
          try {
            const res = await fetch(photo.url);
            const blob = await res.blob();

            /* Compression avant envoi. C'est la PREMIÈRE photo de chaque
               membre : celle qui apparaîtra dans toutes les vignettes,
               et donc celle qui pèse le plus sur la vitesse ressentie
               par tous les autres. */
            const compressee = await compresserImage(
              new File([blob], photo.name, { type: blob.type }),
            );

            const ext = compressee.name.split('.').pop() || 'jpg';
            const filePath = `${userId}/${Date.now()}-${index}.${ext}`;

            const { error: uploadError } = await supabase.storage
              .from('photos')
              .upload(filePath, compressee, {
          // Un an. Le chemin contient `Date.now()` : ce fichier ne
          // changera JAMAIS de contenu. Le défaut de Supabase est une
          // heure — chaque membre re-téléchargeait donc les mêmes
          // visages toutes les heures, ce qui a fait exploser l'egress.
          cacheControl: "31536000",
                contentType: compressee.type,
              });

            if (uploadError) {
              // L'erreur était SILENCIEUSEMENT ignorée : `if (!uploadError)`
              // sans branche `else`. Un échec de stockage laissait donc
              // l'inscription se terminer avec `photos: []`.
              console.error("[onboarding] téléversement refusé :", uploadError);
              dernierEchec = uploadError.message;
              continue;
            }

            const { data: publicUrlData } = supabase.storage.from('photos').getPublicUrl(filePath);
            uploadedPhotos.push(publicUrlData.publicUrl);
          } catch (e: any) {
            console.error("[onboarding] téléversement impossible :", e);
            dernierEchec = e?.message ?? "erreur réseau";
          }
        }

        // AUCUNE photo n'est passée : on interrompt au lieu de créer un
        // profil vide. Sans cela, le membre termine son inscription
        // convaincu d'avoir mis sa photo, ne comprend pas pourquoi
        // personne ne le like, et repart au bout de quelques jours.
        if (uploadedPhotos.length === 0) {
          toast.dismiss("saving");
          toast.error("Votre photo n'a pas pu être envoyée", {
            description: dernierEchec
              ? `${dernierEchec} — vérifiez votre connexion et réessayez.`
              : "Vérifiez votre connexion et réessayez.",
            duration: 8000,
          });
          // On reste à l'étape 4 : les fichiers sélectionnés sont toujours
          // en mémoire, un second clic suffit à réessayer.
          return;
        }

        // Certaines sont passées, d'autres non : on continue, mais on le dit.
        if (uploadedPhotos.length < data.photos.length) {
          toast.warning(
            `${data.photos.length - uploadedPhotos.length} photo(s) n'ont pas pu être envoyées`,
            { description: "Vous pourrez les ajouter depuis votre profil." },
          );
        }

        const { error: profileError } = await supabase.from('profiles').insert({
          id: userId,
          first_name: firstName,
          last_name: lastName,
          birth_date: data.birthDate,
          gender: data.gender,
          city: data.city,
          country: data.country,
          bio: data.bio,
          denomination: data.denomination.trim(),
          practice_level: data.practiceLevel,
          baptized: data.baptized,
          church_attendance: data.churchAttendance,
          seeking_gender: data.seekingGender,
          marital_status: data.maritalStatus,
          marriage_intent: data.marriageIntent,
          has_children: data.hasChildren,
          wants_children: data.wantsChildren,
          // La question « comment nous avez-vous connus ? » était posée à
          // chaque inscription, affichée, puis jetée : aucune colonne ne
          // la recevait. C'est pourtant la seule donnée qui dit où placer
          // un budget publicitaire.
          acquisition_source: data.source || null,
          photos: uploadedPhotos
        });

        if (profileError) throw profileError;

        // Le compte existe RÉELLEMENT à partir d'ici : le profil est
        // écrit en base. Déclencher plus tôt — au clic sur « Créer mon
        // compte » — compterait des inscriptions qui n'aboutissent pas.
        //
        // Import dynamique : le suivi publicitaire ne doit pas alourdir
        // le fragment servi à chaque visiteur.
        // Le parrain est rattaché ici, et nulle part ailleurs. Le lien
        // filleul → parrain se pose une seule fois, à la naissance du
        // compte : plus tard, n'importe qui pourrait se faire attribuer
        // un membre déjà inscrit.
        import("@/lib/parrainage").then(m => m.rattacherParrain());

        import("@/lib/meta").then(async m => {
          await m.rattacherProvenance();
          await m.suivreMeta("CompleteRegistration");

          // Un profil déjà complet à l'inscription : l'événement part
          // aussi maintenant, sinon il ne partirait jamais pour ces
          // membres-là.
          const { data: pct } = await supabase.rpc("my_profile_completion");
          if (typeof pct === "number" && pct >= 60) await m.suivreMeta("CompleteProfile");
        });

        toast.dismiss("saving");
        // Nettoyer sessionStorage et localStorage après enregistrement réussi
        if (typeof window !== "undefined") {
          try {
            sessionStorage.removeItem("agape_pending_user_id");
            sessionStorage.removeItem("agape_pending_first_name");
            sessionStorage.removeItem("agape_pending_last_name");
            localStorage.removeItem("agape_onboarding_step");
            localStorage.removeItem("agape_onboarding_data");
          } catch {}
        }
        setSubmitted(true);
        toast.success("Profil créé avec succès !");

      } catch (error: any) {
        toast.dismiss("saving");
        toast.error("Erreur lors de l'inscription : " + error.message);
      }
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  if (submitted) return <SuccessScreen data={data} />;

  if (!data.source)
    return (
      <SourceScreen
        onSelect={(s) => update("source", s)}
        onBack={() => {}} // Could redirect to home or login if needed
      />
    );

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/30">
      <header className="border-b border-border/40 backdrop-blur-md bg-background/80 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <img src={logoAsset} alt="AgapeMeet" className="w-10 h-10 object-contain" />
            <span className="font-serif text-xl font-semibold">AgapeMeet</span>
          </Link>
          <span className="text-sm text-muted-foreground">
            Étape {step} <span className="text-foreground/40">/ {steps.length}</span>
          </span>
        </div>
      </header>

      {/* Progress */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-8">
        <div className="hidden sm:flex items-center justify-between mb-6">
          {steps.map((s, i) => {
            const active = step === s.id;
            const done = step > s.id;
            const Icon = s.icon;
            return (
              <div key={s.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all ${
                      done
                        ? "bg-primary border-primary text-primary-foreground"
                        : active
                          ? "bg-background border-primary text-primary shadow-elegant scale-110"
                          : "bg-background border-border text-muted-foreground"
                    }`}
                  >
                    {done ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <div className="mt-2 text-center">
                    <div
                      className={`text-sm font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {s.title}
                    </div>
                    <div className="text-xs text-muted-foreground hidden md:block">
                      {s.subtitle}
                    </div>
                  </div>
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 mb-6 transition-colors ${
                      done ? "bg-primary" : "bg-border"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="sm:hidden mb-6">
          <Progress value={progress} className="h-2" />
          <div className="mt-2 text-sm text-muted-foreground">
            {steps[step - 1].title} — {steps[step - 1].subtitle}
          </div>
        </div>
      </div>

      {/* Card */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 pb-24">
        <div className="bg-card rounded-3xl shadow-elegant border border-border/50 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25 }}
              className="p-6 sm:p-10"
            >
              {step === 1 && <StepProfile data={data} update={update} />}
              {step === 2 && <StepFaith data={data} update={update} />}
              {step === 3 && <StepSearch data={data} update={update} />}
              {step === 4 && <StepPhotos data={data} update={update} />}
            </motion.div>
          </AnimatePresence>

          <div className="px-6 sm:px-10 py-5 border-t border-border/50 bg-secondary/30 flex items-center justify-between">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }}>
              <Button
                type="button"
                variant="ghost"
                onClick={handleBack}
                disabled={step === 1}
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }}>
              <Button
                type="button"
                onClick={handleNext}
                size="lg"
                className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:opacity-95 shadow-elegant"
              >
                {step === 4 ? "Terminer" : "Continuer"}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </motion.div>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Vos informations sont confidentielles et servent uniquement à vous
          proposer des profils compatibles.
        </p>
      </main>
    </div>
  );
}

// ---------- Step 1 : Profile ----------
function StepProfile({
  data,
  update,
}: {
  data: OnboardingData;
  update: <K extends keyof OnboardingData>(k: K, v: OnboardingData[K]) => void;
}) {
  return (
    <div>
      <StepHeader
        eyebrow="Étape 1"
        title="Votre Profil"
        description="Ces informations apparaîtront publiquement sur votre profil."
      />
      <div className="grid sm:grid-cols-2 gap-5 mt-8">
        <div className="sm:col-span-2">
          <Field label="Date de naissance" htmlFor="birthDate">
            <Input
              id="birthDate"
              type="date"
              value={data.birthDate}
              max={new Date(
                new Date().setFullYear(new Date().getFullYear() - 18),
              )
                .toISOString()
                .split("T")[0]}
              onChange={(e) => update("birthDate", e.target.value)}
            />
          </Field>
          {data.birthDate && (() => {
            const birth = new Date(data.birthDate);
            const today = new Date();
            const age = today.getFullYear() - birth.getFullYear();
            const m = today.getMonth() - birth.getMonth();
            const isAdult = age > 18 || (age === 18 && m >= 0 && (m > 0 || today.getDate() >= birth.getDate()));
            if (!isAdult) return (
              <div className="mt-2 flex items-center gap-2 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm font-medium">
                <span>⛔</span>
                <span>Vous devez avoir au moins <strong>18 ans</strong> pour vous inscrire sur AgapeMeet.</span>
              </div>
            );
            return null;
          })()}
        </div>
        <div className="sm:col-span-2">
          <Field label="Genre">
            <div className="grid grid-cols-2 gap-3">
              <GenderChoice
                active={data.gender === "female"}
                onClick={() => update("gender", "female")}
                label="Femme"
                icon={WomanIcon}
              />
              <GenderChoice
                active={data.gender === "male"}
                onClick={() => update("gender", "male")}
                label="Homme"
                icon={ManIcon}
              />
            </div>
          </Field>
        </div>
        {/* Pays d'abord : la liste des villes en dépend. L'ordre inverse
            obligeait à saisir une ville « à l'aveugle », puis à changer de
            pays — sans que la ville soit remise en cause. */}
        <Field label="Pays" htmlFor="country">
          <PaysSelect
            id="country"
            value={data.country}
            onChange={(pays) => {
              // Changer de pays invalide la ville : « Abidjan, Sénégal »
              // n'a aucun sens, et le filtre par pays s'en trouverait
              // faussé.
              if (pays !== data.country) update("city", "");
              update("country", pays);
            }}
          />
        </Field>
        <Field label="Ville" htmlFor="city">
          <VilleSelect
            id="city"
            value={data.city}
            pays={data.country}
            onChange={(v) => update("city", v)}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Présentation" htmlFor="bio">
            <Textarea
              id="bio"
              maxLength={500}
              value={data.bio}
              onChange={(e) => update("bio", e.target.value)}
              placeholder="Parlez de vous, vos passions, votre foi, ce que vous recherchez..."
              rows={4}
            />
            <div className="text-xs text-muted-foreground text-right mt-1">
              {data.bio.length}/500
            </div>
          </Field>
        </div>
      </div>
    </div>
  );
}

// ---------- Step 2 : Faith ----------
function StepFaith({
  data,
  update,
}: {
  data: OnboardingData;
  update: <K extends keyof OnboardingData>(k: K, v: OnboardingData[K]) => void;
}) {
  // « Autre » n'est pas une confession : c'est l'aveu qu'on n'a pas su
  // proposer la sienne. Un profil « Autre » ne dit rien à personne, et le
  // filtre par dénomination le range dans un fourre-tout. Ce qui est
  // enregistré est donc toujours la dénomination réelle.
  const estAutre =
    data.denomination !== "" && !DENOMINATIONS_CONNUES.includes(data.denomination);

  // État séparé : à l'instant du clic sur « Autre », le champ est vide,
  // donc `estAutre` est faux — la puce paraîtrait inactive.
  const [autreOuvert, setAutreOuvert] = useState(estAutre);

  return (
    <div>
      <StepHeader
        eyebrow="Étape 2"
        title="Votre foi"
        description="Le cœur de votre profil : votre relation avec Dieu."
      />
      <div className="grid gap-6 mt-8">
        <Field label="Confession / Dénomination">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {DENOMINATIONS_CONNUES.map((d) => (
              <ChoiceChip
                key={d}
                active={data.denomination === d}
                onClick={() => {
                  setAutreOuvert(false);
                  update("denomination", d);
                }}
                label={d}
              />
            ))}
            <ChoiceChip
              active={autreOuvert || estAutre}
              onClick={() => {
                setAutreOuvert(true);
                // Le choix précédent est effacé : le laisser afficherait
                // « Baptiste » coché sous un champ libre en cours de saisie.
                if (!estAutre) update("denomination", "");
              }}
              label="Autre"
            />
          </div>

          {(autreOuvert || estAutre) && (
            <div className="mt-3">
              <Input
                autoFocus
                maxLength={60}
                value={estAutre ? data.denomination : ""}
                onChange={(e) => update("denomination", e.target.value)}
                placeholder="Assemblées de Dieu, Église du Christ, Anglicane…"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Écrivez le nom de votre église ou dénomination. Il apparaîtra
                sur votre profil et permettra aux membres de la même confession
                de vous trouver.
              </p>
            </div>
          )}
        </Field>

        <Field label="Niveau de pratique">
          <div className="grid sm:grid-cols-2 gap-2">
            {[
              { v: "tres-pratiquant", l: "Très pratiquant" },
              { v: "pratiquant", l: "Pratiquant" },
              { v: "croyant", l: "Croyant, peu pratiquant" },
              { v: "en-recherche", l: "En recherche spirituelle" },
            ].map((o) => (
              <ChoiceChip
                key={o.v}
                active={data.practiceLevel === o.v}
                onClick={() => update("practiceLevel", o.v)}
                label={o.l}
              />
            ))}
          </div>
        </Field>

        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Baptisé(e) ?">
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: "oui", l: "Oui" },
                { v: "non", l: "Non" },
              ].map((o) => (
                <ChoiceChip
                  key={o.v}
                  active={data.baptized === o.v}
                  onClick={() => update("baptized", o.v)}
                  label={o.l}
                />
              ))}
            </div>
          </Field>
          <Field label="Fréquence à l'église">
            <Select
              value={data.churchAttendance}
              onValueChange={(v) => update("churchAttendance", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="plusieurs-semaine">Plusieurs fois / semaine</SelectItem>
                <SelectItem value="hebdo">Chaque semaine</SelectItem>
                <SelectItem value="mensuel">Quelques fois par mois</SelectItem>
                <SelectItem value="occasionnel">Occasionnellement</SelectItem>
                <SelectItem value="rarement">Rarement</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>
    </div>
  );
}

// ---------- Step 3 : Search ----------
function StepSearch({
  data,
  update,
}: {
  data: OnboardingData;
  update: <K extends keyof OnboardingData>(k: K, v: OnboardingData[K]) => void;
}) {
  return (
    <div>
      <StepHeader
        eyebrow="Étape 3"
        title="Vos critères de recherche"
        description="Aidez-nous à vous proposer les profils les plus compatibles."
      />
      <div className="grid gap-6 mt-8">
        <Field label="Je recherche">
          <div className="grid grid-cols-2 gap-3">
            <GenderChoice
              active={data.seekingGender === "female"}
              onClick={() => update("seekingGender", "female")}
              label="Une femme"
              icon={WomanIcon}
            />
            <GenderChoice
              active={data.seekingGender === "male"}
              onClick={() => update("seekingGender", "male")}
              label="Un homme"
              icon={ManIcon}
            />
          </div>
        </Field>

        {/* Placée juste après « Je recherche » : c'est le premier critère
            qu'un membre orienté vers le mariage vérifie, avant même
            l'échéance. « Marié(e) » n'y figure pas — la contrainte CHECK
            de la migration 40 le refuse aussi en base. */}
        <Field label="Votre situation matrimoniale">
          <div className="grid sm:grid-cols-3 gap-2">
            {MARITAL_STATUSES.map((s) => (
              <ChoiceChip
                key={s.key}
                active={data.maritalStatus === s.key}
                onClick={() => update("maritalStatus", s.key)}
                label={s.label}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Séparé(e) signifie que l'union n'est pas encore dissoute ;
            « mariage annulé » qu'une annulation religieuse a été prononcée.
          </p>
        </Field>

        <Field label="Intention par rapport au mariage">
          <div className="grid sm:grid-cols-3 gap-2">
            {[
              { v: "1-2ans", l: "Dans 1 à 2 ans" },
              { v: "2-5ans", l: "Dans 2 à 5 ans" },
              { v: "ouvert", l: "Ouvert, sans échéance" },
            ].map((o) => (
              <ChoiceChip
                key={o.v}
                active={data.marriageIntent === o.v}
                onClick={() => update("marriageIntent", o.v)}
                label={o.l}
              />
            ))}
          </div>
        </Field>

        <Field label="Avez-vous des enfants ?">
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
            {[
              { v: "oui", l: "Oui" },
              { v: "non", l: "Non" },
            ].map((o) => (
              <ChoiceChip
                key={o.v}
                active={data.hasChildren === o.v}
                onClick={() => update("hasChildren", o.v)}
                label={o.l}
              />
            ))}
          </div>
        </Field>

        <Field label="Souhaitez-vous avoir des enfants ?">
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: "oui", l: "Oui" },
              { v: "peut-etre", l: "Peut-être" },
              { v: "non", l: "Non" },
            ].map((o) => (
              <ChoiceChip
                key={o.v}
                active={data.wantsChildren === o.v}
                onClick={() => update("wantsChildren", o.v)}
                label={o.l}
              />
            ))}
          </div>
        </Field>
      </div>
    </div>
  );
}

// ---------- Step 4 : Photos ----------
function StepPhotos({
  data,
  update,
}: {
  data: OnboardingData;
  update: <K extends keyof OnboardingData>(k: K, v: OnboardingData[K]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const GenderAvatar =
    data.gender === "female" ? WomanIcon : data.gender === "male" ? ManIcon : null;

  const photo = data.photos[0] ?? null;

  /**
   * Une seule photo à l'inscription.
   *
   * L'étape affichait six emplacements dont cinq verrouillés : on
   * demandait un effort en montrant surtout ce qui était refusé, juste
   * avant la dernière validation. La galerie complète — photos
   * supplémentaires et vidéo — vit dans « Mon profil », une fois le
   * compte créé.
   */
  const handleFile = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Ce fichier n'est pas une image.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Image trop volumineuse", {
        description: "8 Mo maximum. Réduisez-la ou choisissez une autre photo.",
      });
      return;
    }

    const r = new FileReader();
    r.onload = () =>
      update("photos", [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          url: String(r.result),
          name: file.name,
        },
      ]);
    r.onerror = () => toast.error("Cette image n'a pas pu être lue.");
    r.readAsDataURL(file);
  };

  return (
    <div>
      <StepHeader
        eyebrow="Étape 4"
        title="Votre photo de profil"
        description="Une seule photo suffit pour commencer. Vous en ajouterez d'autres depuis votre profil."
      />

      {/* Un seul emplacement, centré et large : c'est LA photo que les
          autres membres verront en premier. */}
      <div className="mt-8 max-w-[15rem] mx-auto">
        {photo ? (
          <div className="relative aspect-[3/4] rounded-2xl overflow-hidden border border-border/60">
            <img src={photo.url} alt="Votre photo de profil" className="w-full h-full object-cover" />
            <button
              type="button"
              aria-label="Retirer la photo"
              onClick={() => update("photos", [])}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-background/90 hover:bg-background flex items-center justify-center shadow-soft transition"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="absolute inset-x-0 bottom-0 py-2.5 bg-background/90 backdrop-blur-sm text-sm font-medium hover:bg-background transition"
            >
              Changer de photo
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full aspect-[3/4] rounded-2xl border-2 border-dashed border-border hover:border-primary hover:bg-secondary/40 transition-all flex flex-col items-center justify-center gap-3 text-muted-foreground hover:text-primary"
          >
            {GenderAvatar ? (
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center ring-4 ring-primary/10">
                <GenderAvatar className="w-10 h-10 text-primary" />
              </div>
            ) : (
              <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center">
                <Upload className="w-6 h-6" />
              </div>
            )}
            <span className="text-sm font-semibold">Ajouter ma photo</span>
            <span className="text-xs">JPG ou PNG · 8 Mo maximum</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="mt-6 rounded-xl bg-secondary/50 border border-border/50 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">Une bonne photo principale</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Un portrait clair et souriant, votre visage bien visible.</li>
          <li>Une photo récente, qui vous ressemble aujourd'hui.</li>
          <li>Ni lunettes de soleil, ni photo de groupe.</li>
        </ul>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Vos autres photos et votre vidéo de présentation s'ajoutent depuis
        <span className="font-medium text-foreground"> Mon profil</span>, une
        fois votre compte créé.
      </p>
    </div>
  );
}

// ---------- Success ----------
function SuccessScreen({ data }: { data: OnboardingData }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-b from-background to-secondary/40">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-lg w-full bg-card rounded-3xl shadow-elegant border border-border/50 p-10 text-center"
      >
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-primary/70 mx-auto flex items-center justify-center shadow-elegant">
          <Sparkles className="w-10 h-10 text-primary-foreground" />
        </div>
        <h1 className="font-serif text-3xl mt-6">
          Bienvenue !
        </h1>
        <p className="text-muted-foreground mt-3">
          Votre profil AgapeMeet est prêt. Nous préparons vos premières
          suggestions de compatibilité.
        </p>
        {/* Une seule sortie : renvoyer vers la vitrine publique juste
            après l'inscription ferait sortir de l'application le membre
            qu'on vient d'y faire entrer. */}
        <div className="mt-8">
          <Link to="/accueil">
            <Button
              size="lg"
              className="bg-gradient-to-r from-primary to-primary/80 shadow-elegant w-full sm:w-auto"
            >
              Découvrir des profils
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

// ---------- Shared ----------
function StepHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center sm:text-left">
      <div className="text-xs uppercase tracking-widest text-primary font-semibold">
        {eyebrow}
      </div>
      <h2 className="font-serif text-3xl sm:text-4xl mt-2">{title}</h2>
      <p className="text-muted-foreground mt-2">{description}</p>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor} className="mb-2 block text-sm font-medium">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ChoiceChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`px-4 py-3 rounded-xl text-sm font-medium border transition-all text-left ${
        active
          ? "border-primary bg-primary/5 text-foreground shadow-soft"
          : "border-border bg-background hover:border-primary/40 hover:bg-secondary/40 text-foreground/80"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        {label}
        {active && <Check className="w-4 h-4 text-primary shrink-0" />}
      </span>
    </motion.button>
  );
}

// ---------- Source (pre-step) ----------
function SourceScreen({ onSelect, onBack }: { onSelect: (s: string) => void; onBack: () => void }) {
  const options: { id: string; label: string; icon: ReactElement; color: string }[] = [
    { id: "tiktok", label: "TikTok", icon: <Music2 className="w-6 h-6" />, color: "bg-foreground text-background" },
    { id: "instagram", label: "Instagram", icon: <Instagram className="w-6 h-6" />, color: "bg-gradient-to-tr from-fuchsia-500 via-pink-500 to-amber-400 text-white" },
    { id: "facebook", label: "Facebook", icon: <Facebook className="w-6 h-6" />, color: "bg-[#1877F2] text-white" },
    { id: "youtube", label: "YouTube", icon: <Youtube className="w-6 h-6" />, color: "bg-[#FF0000] text-white" },
    // WhatsApp est vraisemblablement le premier canal réel sur ce marché :
    // un lien partagé dans un groupe d'église circule plus qu'une
    // publicité. Sans cette entrée, ces membres se rangeaient dans
    // « Autre » — la case qui n'apprend rien.
    { id: "whatsapp", label: "WhatsApp", icon: <MessageCircle className="w-6 h-6" />, color: "bg-[#25D366] text-white" },
    { id: "recommandation", label: "Une recommandation", icon: <Users className="w-6 h-6" />, color: "bg-primary text-primary-foreground" },
    { id: "autre", label: "Autre", icon: <MoreHorizontal className="w-6 h-6" />, color: "bg-primary/10 text-primary" },
  ];
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/30">
      <header className="border-b border-border/40 backdrop-blur-md bg-background/80 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <img src={logoAsset} alt="AgapeMeet" className="w-10 h-10 object-contain" />
            <span className="font-serif text-xl font-semibold">AgapeMeet</span>
          </Link>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour
          </button>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-10 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-card rounded-3xl shadow-elegant border border-border/50 p-6 sm:p-10"
        >
          <div className="text-center mb-8">
            <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-foreground">
              Comment nous as-tu découvert ?
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">Dis-nous d'où tu viens 😊</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {options.map((o) => (
              <motion.button
                key={o.id}
                type="button"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSelect(o.id)}
                className="group flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-border hover:border-primary/50 bg-background hover:bg-primary/5 py-6 px-4 transition-all shadow-soft hover:shadow-elegant"
              >
                <span className={`w-12 h-12 rounded-xl flex items-center justify-center ${o.color}`}>
                  {o.icon}
                </span>
                <span className="text-sm font-medium text-foreground text-center">
                  {o.label}
                </span>
              </motion.button>
            ))}
          </div>
        </motion.div>
        <p className="text-center text-xs text-muted-foreground mt-6">
          Cela nous aide à mieux vous connaître.
        </p>
      </main>
    </div>
  );
}

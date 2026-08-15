import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { Save, Camera, X, Upload, Trash2, ArrowLeft, Lock, Crown, Video } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { PaysSelect, VilleSelect } from "@/components/app/PaysVilleSelect";
import { publicPlanOf, type PublicPlan } from "@/lib/badges";
import { Textarea } from "@/components/ui/textarea";
import { TagPicker } from "@/components/app/TagPicker";
import {
  EMPTY_EXTRAS, EDUCATION_LEVELS, INTEREST_SUGGESTIONS, QUALITY_SUGGESTIONS,
  FLAW_SUGGESTIONS, DEALBREAKER_SUGGESTIONS, LIST_LIMITS, formatHeight,
  MARITAL_STATUSES, DENOMINATIONS_CONNUES, estDenominationLibre,
} from "@/lib/profilChamps";

/**
 * Combien de photos par formule.
 *
 * Ces valeurs reprennent ce que l'inscription annonce depuis toujours :
 * une photo en Gratuit, cinq en Premium.
 */
const PHOTOS_GRATUIT = 1;
const PHOTOS_PREMIUM = 5;

export const Route = createFileRoute("/_app/profil")({
  head: () => ({
    meta: [{ title: "Mon Profil — AgapeMeet" }],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [completion, setCompletion] = useState<number | null>(null);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    bio: "",
    city: "",
    country: "",
    birth_date: "",
    gender: "",
    denomination: "",
    practice_level: "",
    baptized: "",
    church_attendance: "",
    seeking_gender: "",
    marriage_intent: "",
    has_children: "",
    wants_children: "",
    photos: [] as string[],
    // Champs complémentaires — remplis après l'inscription
    ...EMPTY_EXTRAS,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  /**
   * Nombre de photos autorisé.
   *
   * L'ancienne limite était `< 6` en dur, identique pour tous — alors que
   * l'inscription annonçait « Passez Premium pour plus de photos ». La
   * promesse payante ne correspondait donc à aucune restriction réelle.
   */
  const [plan, setPlan] = useState<PublicPlan>(null);
  const maxPhotos = plan === null ? PHOTOS_GRATUIT : PHOTOS_PREMIUM;

  useEffect(() => {
    async function load() {
      const user = await getCurrentUser();
      if (!user) {
        navigate({ to: "/login" });
        return;
      }
      setUserId(user.id);
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (data) {
        setForm({
          first_name: data.first_name || "",
          last_name: data.last_name || "",
          bio: data.bio || "",
          city: data.city || "",
          country: data.country || "",
          birth_date: data.birth_date || "",
          gender: data.gender || "",
          denomination: data.denomination || "",
          practice_level: data.practice_level || "",
          baptized: data.baptized || "",
          church_attendance: data.church_attendance || "",
          seeking_gender: data.seeking_gender || "all",
          marriage_intent: data.marriage_intent || "",
          has_children: data.has_children || "",
          wants_children: data.wants_children || "",
          photos: data.photos || [],
          marital_status: data.marital_status || "",
          marriage_vision: data.marriage_vision || "",
          looking_for: data.looking_for || "",
          education: data.education || "",
          height_cm: data.height_cm ?? null,
          interests: data.interests || [],
          qualities: data.qualities || [],
          flaws: data.flaws || [],
          dealbreakers: data.dealbreakers || [],
        });
      }
      // Le badge dit QUOI, la date dit JUSQU'À QUAND : un abonnement
      // expiré ne doit pas laisser six emplacements ouverts.
      if (data) setPlan(publicPlanOf(data));

      const { data: pct } = await supabase.rpc("my_profile_completion");
      if (typeof pct === "number") setCompletion(pct);

      setLoading(false);
    }
    load();
  }, [navigate]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!userId) return;
      
      const { error } = await supabase.from('profiles').update({
        first_name: form.first_name,
        last_name: form.last_name,
        bio: form.bio,
        city: form.city,
        country: form.country,
        birth_date: form.birth_date,
        gender: form.gender,
        denomination: form.denomination.trim(),
        practice_level: form.practice_level,
        baptized: form.baptized,
        church_attendance: form.church_attendance,
        seeking_gender: form.seeking_gender,
        marriage_intent: form.marriage_intent,
        has_children: form.has_children,
        wants_children: form.wants_children,
        photos: form.photos,
        marital_status: form.marital_status || null,
        marriage_vision: form.marriage_vision.trim() || null,
        looking_for: form.looking_for.trim() || null,
        education: form.education || null,
        height_cm: form.height_cm || null,
        interests: form.interests,
        qualities: form.qualities,
        flaws: form.flaws,
        dealbreakers: form.dealbreakers,
      }).eq('id', userId);

      if (error) throw error;

      // Le pourcentage vient de la base, pas d'un calcul local : c'est la
      // même définition que sur la page d'accueil, donc le même chiffre.
      const { data: pct } = await supabase.rpc("my_profile_completion");
      if (typeof pct === "number") setCompletion(pct);

      toast.success("Profil mis à jour !");
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de la mise à jour");
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !userId) return;
    const file = e.target.files[0];

    // Quick validation
    if (!file.type.startsWith('image/')) {
      toast.error("Veuillez sélectionner une image valide.");
      return;
    }

    // Vérifié ici aussi, et pas seulement en masquant le bouton : rien
    // n'empêche d'atteindre ce point autrement.
    if (form.photos.length >= maxPhotos) {
      toast.error(`Vous avez atteint ${maxPhotos} photo${maxPhotos > 1 ? "s" : ""}.`);
      return;
    }

    setUploadingImage(true);
    toast.info("Upload en cours...", { id: "uploading" });
    
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const filePath = `${userId}/${Date.now()}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(filePath, file, { contentType: file.type });
        
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('photos').getPublicUrl(filePath);
      
      const newPhotos = [...form.photos, publicUrlData.publicUrl];
      setForm({ ...form, photos: newPhotos });
      
      // Auto-save photos
      await supabase.from('profiles').update({ photos: newPhotos }).eq('id', userId);
      
      toast.success("Photo ajoutée avec succès");
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de l'upload de l'image");
    } finally {
      toast.dismiss("uploading");
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /** Promeut une photo en principale, sans avoir à tout réenvoyer. */
  const setMainPhoto = async (index: number) => {
    if (!userId || index === 0) return;
    const reordered = [...form.photos];
    const [choisie] = reordered.splice(index, 1);
    reordered.unshift(choisie);
    setForm({ ...form, photos: reordered });

    const { error } = await supabase
      .from("profiles")
      .update({ photos: reordered })
      .eq("id", userId);

    if (error) {
      // Remettre l'ordre précédent : laisser l'affichage montrer un
      // changement que la base a refusé serait pire que l'erreur.
      setForm({ ...form });
      toast.error("La photo principale n'a pas pu être changée");
      return;
    }
    toast.success("Photo principale mise à jour");
  };

  const removePhoto = async (index: number) => {
    if (!userId) return;
    const newPhotos = [...form.photos];
    newPhotos.splice(index, 1);
    setForm({ ...form, photos: newPhotos });
    
    try {
      await supabase.from('profiles').update({ photos: newPhotos }).eq('id', userId);
      toast.success("Photo supprimée");
    } catch (err) {
      toast.error("Erreur lors de la suppression");
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-pulse">Chargement...</div></div>;
  }

  return (
    <div className="px-4 pt-4 pb-12 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate({ to: "/accueil" })} className="w-10 h-10 rounded-full border border-border flex items-center justify-center hover:bg-secondary transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-serif text-2xl font-semibold">Mon Profil</h1>
      </div>

      {/* Le pourcentage est affiché ICI, là où l'on peut agir dessus. Sur
          la page d'accueil il informe ; sur cette page il motive. */}
      {completion !== null && (
        <div className="mb-6 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">Profil complété</span>
            <span className={`font-serif text-xl font-bold ${
              completion >= 80 ? "text-emerald-600" : completion >= 50 ? "text-gold" : "text-muted-foreground"
            }`}>
              {completion} %
            </span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                completion >= 80 ? "bg-emerald-500" : "bg-primary"
              }`}
              style={{ width: `${completion}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
            {completion >= 80
              ? "Votre profil est complet. Il inspire confiance au premier regard."
              : "Les profils complets reçoivent nettement plus de réponses. Les trois blocs en bas de page comptent pour un tiers du total."}
          </p>
        </div>
      )}


      {/* PHOTOS SECTION
          La galerie complète vit ici, plus à l'inscription : l'étape 4
          ne demande qu'une photo, et tout le reste — photos
          supplémentaires, choix de la principale, vidéo — se gère une
          fois le compte créé. */}
      <div className="mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold">Mes Photos</h2>
          <span className="text-xs text-muted-foreground">
            {form.photos.length}/{maxPhotos}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {form.photos.map((photo, idx) => (
            <div key={photo} className="relative aspect-[3/4] rounded-xl overflow-hidden bg-secondary group">
              <img src={photo} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
              {idx === 0 ? (
                <div className="absolute bottom-1 left-1 bg-primary/90 text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm">
                  PROFIL
                </div>
              ) : (
                /* « La première photo est votre photo principale » était
                   affiché sans aucun moyen de la changer : il fallait
                   supprimer les précédentes et tout réenvoyer. */
                <button
                  onClick={() => setMainPhoto(idx)}
                  className="absolute bottom-1 left-1 right-1 bg-background/85 backdrop-blur-sm text-[10px] font-semibold py-1 rounded hover:bg-background transition"
                >
                  Définir principale
                </button>
              )}
              <button
                onClick={() => removePhoto(idx)}
                aria-label={`Supprimer la photo ${idx + 1}`}
                className="absolute top-1 right-1 w-6 h-6 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-destructive transition-colors backdrop-blur-sm"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}

          {form.photos.length < maxPhotos && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
              className="aspect-[3/4] rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 hover:bg-secondary/50 hover:border-primary/50 transition-all text-muted-foreground"
            >
              {uploadingImage ? <span className="animate-spin text-xl">↻</span> : <Camera className="w-6 h-6" />}
              <span className="text-xs font-medium">Ajouter</span>
            </button>
          )}

          {/* Emplacements verrouillés : c'est ici que la proposition
              Premium a du sens — devant une galerie qu'on remplit — et
              non à l'inscription, avant même d'avoir vu l'application. */}
          {plan === null &&
            Array.from({ length: Math.max(0, PHOTOS_PREMIUM - maxPhotos) }).map((_, i) => (
              <button
                key={`verrou-${i}`}
                onClick={() =>
                  toast.info(`Passez Premium pour ajouter jusqu'à ${PHOTOS_PREMIUM} photos`, {
                    description: "Un profil avec plusieurs photos reçoit nettement plus de visites.",
                    action: { label: "Voir les offres", onClick: () => navigate({ to: "/abonnement" }) },
                  })
                }
                className="aspect-[3/4] rounded-xl border border-border bg-secondary/20 flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:bg-secondary/40 transition group"
              >
                <Lock className="w-4 h-4 group-hover:text-gold transition" />
                <span className="text-[10px] font-medium">Photo {maxPhotos + i + 1}</span>
                <span className="inline-flex items-center gap-0.5 text-[9px] text-gold font-bold bg-gold/10 px-1.5 py-0.5 rounded-full">
                  <Crown className="w-2.5 h-2.5" /> Premium
                </span>
              </button>
            ))}
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handlePhotoUpload}
          accept="image/*"
          className="hidden"
        />

        <p className="text-xs text-muted-foreground mt-2">
          La première photo est votre photo principale — c'est elle que les
          autres membres voient en premier.
        </p>

        {/* Vidéo de présentation — VIP.
            Panneau pleine largeur plutôt qu'une case dans la grille : une
            vidéo n'est pas une photo de plus, et la confondre avec les
            emplacements photo brouillerait les deux offres. */}
        <div
          className={`mt-4 rounded-2xl border p-4 ${
            plan === "vip"
              ? "border-gold/40 bg-gold/5"
              : "border-border bg-secondary/20"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`w-11 h-11 rounded-xl shrink-0 flex items-center justify-center ${
                plan === "vip" ? "bg-gold/15 text-gold" : "bg-secondary text-muted-foreground"
              }`}
            >
              {plan === "vip" ? <Video className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">Vidéo de présentation</h3>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gold bg-gold/10 border border-gold/25 px-2 py-0.5 rounded-full">
                  <Crown className="w-3 h-3" /> VIP
                </span>
              </div>

              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Quelques secondes face caméra en disent plus qu'une longue
                présentation écrite : votre voix, votre sourire, votre manière
                de parler de votre foi.
              </p>

              {plan === "vip" ? (
                /* Membre VIP : le droit est acquis, mais la fonction n'est
                   pas encore livrée. Afficher un bouton d'envoi qui
                   échouerait serait pire que l'annoncer. */
                <p className="text-xs mt-2.5 font-medium text-gold">
                  Inclus dans votre formule — disponible très prochainement.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate({ to: "/abonnement" })}
                  className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-gold hover:underline"
                >
                  <Crown className="w-3.5 h-3.5" />
                  Passer VIP pour l'activer
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6 bg-card border border-border/50 rounded-3xl p-5 sm:p-6 mb-6 shadow-soft">
        
        {/* IDENTITÉ */}
        <div className="space-y-4">
          <h3 className="font-serif text-lg font-medium text-primary">Identité</h3>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">Prénom</label>
              <Input 
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">Nom</label>
              <Input 
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              />
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">Date de naissance</label>
            <Input 
              type="date"
              value={form.birth_date}
              onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
            />
          </div>

          {/* Mêmes sélecteurs qu'à l'inscription. En saisie libre, « togo »
              ou « Côte d'ivoire » ne correspondaient plus au pays choisi à
              l'onboarding : plus de drapeau, et le filtre par pays cessait
              de remonter le profil. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">Pays</label>
              <PaysSelect
                value={form.country}
                onChange={(pays) =>
                  setForm({
                    ...form,
                    country: pays,
                    city: pays !== form.country ? "" : form.city,
                  })
                }
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">Ville</label>
              <VilleSelect
                value={form.city}
                pays={form.country}
                onChange={(v) => setForm({ ...form, city: v })}
              />
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">Genre</label>
            <select 
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
              className="w-full h-10 px-3 py-2 rounded-xl border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">Non précisé</option>
              <option value="male">Homme</option>
              <option value="female">Femme</option>
            </select>
          </div>
        </div>

        <div className="h-px bg-border/50 w-full" />

        {/* À PROPOS */}
        <div className="space-y-4">
          <h3 className="font-serif text-lg font-medium text-primary">À propos de moi</h3>
          <div>
            <Textarea 
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              className="w-full min-h-[100px] text-sm resize-none rounded-xl"
              placeholder="Décrivez-vous, parlez de vos passions, de votre foi..."
            />
          </div>
        </div>

        <div className="h-px bg-border/50 w-full" />

        {/* FOI */}
        <div className="space-y-4">
          <h3 className="font-serif text-lg font-medium text-primary">Foi & Pratique</h3>
          
          <div>
            <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">Confession / Dénomination</label>
            <select
              value={estDenominationLibre(form.denomination) ? "__autre__" : form.denomination}
              onChange={(e) =>
                setForm({
                  ...form,
                  // « Autre » ouvre la saisie : on vide pour que le champ
                  // libre parte vierge, sinon l'ancienne confession y
                  // resterait affichée.
                  denomination: e.target.value === "__autre__" ? " " : e.target.value,
                })
              }
              className="w-full h-10 px-3 py-2 rounded-xl border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">Non précisé</option>
              {DENOMINATIONS_CONNUES.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
              <option value="__autre__">Autre — préciser</option>
            </select>

            {estDenominationLibre(form.denomination) && (
              <Input
                autoFocus
                maxLength={60}
                value={form.denomination.trimStart()}
                onChange={(e) => setForm({ ...form, denomination: e.target.value })}
                placeholder="Assemblées de Dieu, Église du Christ, Anglicane…"
                className="mt-2"
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">Niveau de pratique</label>
            <select 
              value={form.practice_level}
              onChange={(e) => setForm({ ...form, practice_level: e.target.value })}
              className="w-full h-10 px-3 py-2 rounded-xl border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">Non précisé</option>
              <option value="pratiquant">Pratiquant régulier</option>
              <option value="occasionnel">Occasionnel</option>
              <option value="croyant">Croyant non pratiquant</option>
              <option value="decouverte">En découverte</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">Êtes-vous baptisé(e) ?</label>
            <select 
              value={form.baptized}
              onChange={(e) => setForm({ ...form, baptized: e.target.value })}
              className="w-full h-10 px-3 py-2 rounded-xl border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">Non précisé</option>
              <option value="oui">Oui</option>
              <option value="non">Non</option>
              <option value="prevu">Prévu prochainement</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">Fréquentation de l'église</label>
            <select 
              value={form.church_attendance}
              onChange={(e) => setForm({ ...form, church_attendance: e.target.value })}
              className="w-full h-10 px-3 py-2 rounded-xl border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">Non précisé</option>
              <option value="hebdomadaire">Toutes les semaines</option>
              <option value="mensuel">Quelques fois par mois</option>
              <option value="fetes">Seulement aux fêtes</option>
              <option value="jamais">Presque jamais</option>
            </select>
          </div>
        </div>

        <div className="h-px bg-border/50 w-full" />

        {/* RECHERCHE */}
        <div className="space-y-4">
          <h3 className="font-serif text-lg font-medium text-primary">Critères & Intentions</h3>
          
          <div>
            <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">Je recherche</label>
            <select 
              value={form.seeking_gender}
              onChange={(e) => setForm({ ...form, seeking_gender: e.target.value })}
              className="w-full h-10 px-3 py-2 rounded-xl border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="all">Peu importe</option>
              <option value="female">Des femmes</option>
              <option value="male">Des hommes</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">Intention de mariage</label>
            <select 
              value={form.marriage_intent}
              onChange={(e) => setForm({ ...form, marriage_intent: e.target.value })}
              className="w-full h-10 px-3 py-2 rounded-xl border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">Non précisé</option>
              <option value="serieux">Je cherche le mariage</option>
              <option value="ouvert">Je suis ouvert(e) à l'idée</option>
              <option value="pas_maintenant">Pas pour le moment</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">Avez-vous des enfants ?</label>
            <select 
              value={form.has_children}
              onChange={(e) => setForm({ ...form, has_children: e.target.value })}
              className="w-full h-10 px-3 py-2 rounded-xl border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">Non précisé</option>
              <option value="oui">Oui</option>
              <option value="non">Non</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">Voulez-vous des enfants ?</label>
            <select 
              value={form.wants_children}
              onChange={(e) => setForm({ ...form, wants_children: e.target.value })}
              className="w-full h-10 px-3 py-2 rounded-xl border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">Non précisé</option>
              <option value="oui">Oui</option>
              <option value="non">Non</option>
              <option value="ouvert">Je suis ouvert(e)</option>
              <option value="plus">Pas d'autres enfants</option>
            </select>
          </div>
        </div>

        {/* ── Mon chemin vers le mariage ───────────────────────── */}
        <GroupSection
          title="Mon chemin vers le mariage"
          hint="Où vous en êtes, ce qui vous met en marche, et ce sur quoi vous ne transigerez pas."
        >
          <Field
            label="Situation matrimoniale"
            hint="AgapeMeet s'adresse aux personnes libres de se marier."
          >
            <select
              value={form.marital_status}
              onChange={(e) => setForm({ ...form, marital_status: e.target.value })}
              className="w-full h-12 px-3 rounded-xl bg-background border border-border text-sm"
            >
              <option value="">Non précisé</option>
              {MARITAL_STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}{s.hint ? ` — ${s.hint}` : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Ma vision du mariage">
            <Textarea
              value={form.marriage_vision}
              onChange={(e) => setForm({ ...form, marriage_vision: e.target.value })}
              rows={4}
              maxLength={600}
              placeholder="Ce que représente le mariage pour vous, la place de la foi dans votre couple…"
              className="rounded-xl"
            />
            <Counter value={form.marriage_vision} max={600} />
          </Field>

          <Field label="Ce que je recherche">
            <Textarea
              value={form.looking_for}
              onChange={(e) => setForm({ ...form, looking_for: e.target.value })}
              rows={4}
              maxLength={600}
              placeholder="La personne que vous espérez rencontrer, ce qui compte le plus à vos yeux…"
              className="rounded-xl"
            />
            <Counter value={form.looking_for} max={600} />
          </Field>

          <Field
            label="Ce que je n'accepte pas"
            hint="Dit d'emblée, cela évite des conversations qui n'auraient pas abouti."
          >
            <TagPicker
              value={form.dealbreakers}
              onChange={(v) => setForm({ ...form, dealbreakers: v })}
              suggestions={DEALBREAKER_SUGGESTIONS}
              max={LIST_LIMITS.dealbreakers}
              placeholder="Autre chose…"
            />
          </Field>
        </GroupSection>

        {/* ── Qui je suis ──────────────────────────────────────── */}
        <GroupSection
          title="Qui je suis"
          hint="De quoi engager une conversation autrement que par « ça va ? »."
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Niveau d'études">
              <select
                value={form.education}
                onChange={(e) => setForm({ ...form, education: e.target.value })}
                className="w-full h-12 px-3 rounded-xl bg-background border border-border text-sm"
              >
                <option value="">Non précisé</option>
                {EDUCATION_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>

            <Field label="Taille">
              <div className="relative">
                <Input
                  type="number"
                  min={120}
                  max={250}
                  value={form.height_cm ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, height_cm: e.target.value ? Number(e.target.value) : null })
                  }
                  placeholder="170"
                  className="h-12 rounded-xl pr-10"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  cm
                </span>
              </div>
              {form.height_cm ? (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {formatHeight(form.height_cm)}
                </p>
              ) : null}
            </Field>
          </div>

          <Field label="Centres d'intérêt">
            <TagPicker
              value={form.interests}
              onChange={(v) => setForm({ ...form, interests: v })}
              suggestions={INTEREST_SUGGESTIONS}
              max={LIST_LIMITS.interests}
              placeholder="Une passion à vous…"
            />
          </Field>
        </GroupSection>

        {/* ── En toute sincérité ───────────────────────────────── */}
        <GroupSection
          title="En toute sincérité"
          hint="Reconnaître ses défauts inspire plus confiance qu'une liste de qualités."
        >
          <Field label="Mes qualités">
            <TagPicker
              value={form.qualities}
              onChange={(v) => setForm({ ...form, qualities: v })}
              suggestions={QUALITY_SUGGESTIONS}
              max={LIST_LIMITS.qualities}
            />
          </Field>

          <Field label="Mes défauts">
            <TagPicker
              value={form.flaws}
              onChange={(v) => setForm({ ...form, flaws: v })}
              suggestions={FLAW_SUGGESTIONS}
              max={LIST_LIMITS.flaws}
            />
          </Field>
        </GroupSection>

      </div>

      <div className="sticky bottom-20 z-10 pt-2 pb-4 bg-gradient-to-t from-background via-background to-transparent">
        <button 
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 h-14 rounded-2xl bg-primary text-primary-foreground font-semibold shadow-[0_8px_30px_rgb(0,0,0,0.12)] shadow-primary/20 hover:bg-primary/90 transition-colors"
        >
          {saving ? <span className="animate-spin text-xl">↻</span> : <Save className="w-5 h-5" />}
          Enregistrer toutes les modifications
        </button>
      </div>

    </div>
  );
}

// ─── Blocs du formulaire ──────────────────────────────────────────────────────
function GroupSection({ title, hint, children }: {
  title: string; hint: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-5">
      <div>
        <h2 className="font-serif text-lg font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
        {label}
      </label>
      {hint && <p className="text-[11px] text-muted-foreground mb-1.5 -mt-1">{hint}</p>}
      {children}
    </div>
  );
}

function Counter({ value, max }: { value: string; max: number }) {
  return (
    <p className="text-[11px] text-muted-foreground mt-1 text-right">
      {value.length}/{max}
    </p>
  );
}

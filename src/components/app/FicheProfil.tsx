import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { createPortal } from "react-dom";
import { X, MapPin, CheckCircle2, Church, Loader2, Baby, HeartHandshake } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { displayName } from "@/lib/utils";
import { Drapeau } from "@/components/app/Drapeau";
import { PlanBadge } from "@/components/app/PlanBadge";
import { ProfileExtrasBlocks } from "@/components/app/ProfileExtras";
import {
  PRACTICE_LABELS, BAPTIZED_LABELS, ATTENDANCE_LABELS,
  INTENT_LABELS, HAS_CHILDREN_LABELS, WANTS_CHILDREN_LABELS,
} from "@/lib/profilChamps";

/**
 * La fiche complète d'un membre — tout ce qu'il a rempli dans « Mon profil ».
 *
 * POURQUOI ELLE CHARGE ELLE-MÊME SES DONNÉES
 *
 * Une présentation complète demande une vingtaine de colonnes. Les faire
 * remonter par chaque écran qui ouvre une fiche alourdirait toutes les
 * listes — le fil de la communauté charge cinquante publications, ce
 * serait cinquante profils complets pour une seule fiche ouverte.
 *
 * Elle ne reçoit donc qu'un identifiant et va chercher le reste au clic.
 * Le coût est d'une requête, payée une fois, au moment où l'on regarde.
 *
 * LA LISTE DE COLONNES EST JUMELLE DE CELLE DE /profil
 *
 * Ce que le membre remplit doit être ce que les autres voient. Un champ
 * ajouté au formulaire et oublié ici serait rempli pour rien — et c'est
 * décourageant de renseigner sa vision du mariage sans qu'elle paraisse
 * nulle part.
 *
 * Ce qui reste dehors, volontairement : `seeking_gender` et les critères
 * de recherche. Ils servent à filtrer, pas à se présenter — afficher
 * « recherche : des femmes » sur une fiche ne dit rien de la personne.
 *
 * PORTAIL VERS `document.body`
 *
 * L'en-tête et plusieurs conteneurs portent `backdrop-blur`, qui crée un
 * bloc de référence pour les descendants en `position: fixed` : sans
 * portail, la fiche se retrouve rognée dans la carte qui l'a ouverte —
 * exactement le défaut qu'avait le panneau de Boost.
 */

const COLONNES =
  "id, first_name, last_name, bio, profession, city, country, birth_date, photos, is_verified, " +
  "denomination, practice_level, baptized, church_attendance, " +
  "marriage_intent, has_children, wants_children, " +
  "marital_status, marriage_vision, looking_for, education, height_cm, " +
  "interests, qualities, flaws, dealbreakers, " +
  "public_plan, premium_until, is_founder";

/** Repli si une colonne optionnelle manque : mieux vaut peu que rien. */
const COLONNES_MIN =
  "id, first_name, last_name, bio, city, country, birth_date, photos, is_verified, denomination";

function age(d: string | null | undefined) {
  if (!d) return 0;
  const b = new Date(d);
  if (Number.isNaN(b.getTime())) return 0;
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  const m = n.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a--;
  return a > 0 && a < 120 ? a : 0;
}

export function FicheProfil({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [p, setP] = useState<any>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    let annule = false;

    (async () => {
      let { data, error } = await supabase
        .from("profiles").select(COLONNES).eq("id", userId).maybeSingle();

      if (error) {
        // PostgREST rejette la requête ENTIÈRE si une seule colonne
        // demandée n'existe pas. Sans ce repli, une colonne absente
        // ouvrirait une fiche vide sans que rien ne l'explique.
        console.warn("[fiche] colonnes optionnelles absentes, repli :", error.message);
        ({ data } = await supabase
          .from("profiles").select(COLONNES_MIN).eq("id", userId).maybeSingle());
      }

      if (!annule) { setP(data); setChargement(false); }
    })();

    return () => { annule = true; };
  }, [userId]);

  // Le défilement de la page derrière la fiche est bloqué : sans cela, on
  // fait défiler le fil sous la fiche en croyant faire défiler la fiche.
  useEffect(() => {
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = avant; };
  }, []);

  const a = age(p?.birth_date);
  const photos: string[] = p?.photos ?? [];

  const foi = [
    p?.denomination && { label: "Dénomination", valeur: p.denomination },
    p?.practice_level && { label: "Pratique", valeur: PRACTICE_LABELS[p.practice_level] ?? p.practice_level },
    p?.baptized && { label: "Baptême", valeur: BAPTIZED_LABELS[p.baptized] ?? p.baptized },
    p?.church_attendance && { label: "À l'église", valeur: ATTENDANCE_LABELS[p.church_attendance] ?? p.church_attendance },
  ].filter(Boolean) as Array<{ label: string; valeur: string }>;

  const famille = [
    p?.marriage_intent && { label: "Intention", valeur: INTENT_LABELS[p.marriage_intent] ?? p.marriage_intent, icone: HeartHandshake },
    p?.has_children && { label: "A des enfants", valeur: HAS_CHILDREN_LABELS[p.has_children] ?? p.has_children, icone: Baby },
    p?.wants_children && { label: "Veut des enfants", valeur: WANTS_CHILDREN_LABELS[p.wants_children] ?? p.wants_children, icone: Baby },
  ].filter(Boolean) as Array<{ label: string; valeur: string; icone: typeof Baby }>;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[80] bg-background/95 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      {/* `stopPropagation` : sans lui, un clic sur une photo ou sur le
          texte refermerait la fiche qu'on vient d'ouvrir. */}
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 28, stiffness: 320 }}
        onClick={e => e.stopPropagation()}
        className="min-h-full max-w-md mx-auto bg-background pb-20 shadow-2xl"
      >
        {chargement ? (
          <div className="h-[60vh] flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Chargement du profil…</p>
          </div>
        ) : !p ? (
          <div className="h-[60vh] flex flex-col items-center justify-center gap-3 px-8 text-center">
            <p className="font-semibold">Profil indisponible</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Ce membre a peut-être supprimé son compte, ou choisi de ne plus
              apparaître.
            </p>
            <button onClick={onClose} className="mt-2 px-5 py-2.5 rounded-xl bg-secondary text-sm font-semibold">
              Fermer
            </button>
          </div>
        ) : (
          <>
            {/* Photo principale */}
            <div className="relative aspect-[3/4]">
              {photos[0] ? (
                <img src={photos[0]} alt={p.first_name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary/25 to-gold/25 flex items-center justify-center font-serif text-6xl font-semibold text-primary">
                  {(p.first_name || "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
              <button
                onClick={onClose}
                aria-label="Fermer"
                className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white hover:bg-black/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="absolute bottom-0 inset-x-0 p-5">
                <h2 className="font-serif text-3xl font-bold flex items-center gap-2">
                  <span className="truncate min-w-0">
                    {displayName(p.first_name, p.last_name)}{a > 0 && `, ${a}`}
                  </span>
                  {p.is_verified && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
                  <PlanBadge profile={p} compact />
                </h2>
                {/* La profession sous le nom, avant la ville : c'est ce
                    qu'on lit en second sur une fiche, et cela donne de
                    quoi engager la conversation autrement que par
                    « ça va ? ». */}
                {p.profession?.trim() && (
                  <p className="text-sm font-medium mt-1 truncate">{p.profession}</p>
                )}
                {(p.city || p.country) && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      {p.city}{p.city && p.country ? ", " : ""}{p.country}
                    </span>
                    <Drapeau pays={p.country} className="w-4 h-4 shrink-0" />
                  </p>
                )}
              </div>
            </div>

            {/* Photos suivantes — en bandeau, pas en grille : on parcourt
                d'un pouce sans repousser le texte hors de l'écran. */}
            {photos.length > 1 && (
              <div className="flex gap-2 px-5 pt-4 overflow-x-auto scrollbar-none">
                {photos.slice(1).map((ph, i) => (
                  <img key={i} src={ph} alt="" loading="lazy"
                       className="w-24 h-32 rounded-xl object-cover shrink-0 shadow-sm" />
                ))}
              </div>
            )}

            <div className="px-5 pt-5 space-y-6">
              {p.bio?.trim() && (
                <section>
                  <h3 className="font-serif text-lg font-semibold mb-2">À propos</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                    {p.bio}
                  </p>
                </section>
              )}

              {foi.length > 0 && (
                <section>
                  <h3 className="font-serif text-lg font-semibold mb-3 flex items-center gap-2">
                    <Church className="w-5 h-5 text-primary" /> Foi &amp; pratique
                  </h3>
                  <div className="rounded-2xl bg-secondary/30 border border-border/50 p-4 space-y-3">
                    {foi.map(f => (
                      <div key={f.label}>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                          {f.label}
                        </span>
                        <p className="font-medium text-sm">{f.valeur}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {famille.length > 0 && (
                <section>
                  <h3 className="font-serif text-lg font-semibold mb-3">Mariage &amp; famille</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {famille.map(f => {
                      const Icone = f.icone;
                      return (
                        <div key={f.label} className="flex items-center gap-3 rounded-xl bg-secondary/30 border border-border/50 px-4 py-2.5">
                          <Icone className="w-4 h-4 text-primary shrink-0" />
                          <div className="min-w-0">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                              {f.label}
                            </div>
                            <div className="text-sm font-medium truncate">{f.valeur}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>

            {/* Les trois blocs complémentaires — le même composant que sur
                /accueil et /decouvrir. Deux mises en page pour les mêmes
                données finiraient par se contredire. */}
            <div className="mt-6 border-t border-border/40">
              <ProfileExtrasBlocks
                p={{
                  marital_status: p.marital_status,
                  marriage_vision: p.marriage_vision,
                  looking_for: p.looking_for,
                  education: p.education,
                  height_cm: p.height_cm,
                  interests: p.interests,
                  qualities: p.qualities,
                  flaws: p.flaws,
                  dealbreakers: p.dealbreakers,
                }}
              />
            </div>
          </>
        )}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

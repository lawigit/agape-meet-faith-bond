import { motion } from "motion/react";
import { X, MapPin, CheckCircle2 } from "lucide-react";
import { displayName } from "@/lib/utils";

/**
 * Aperçu d'un profil — volontairement sobre.
 *
 * Deux vues de profil complètes existent déjà, dans /accueil et
 * /decouvrir, et elles ont divergé. Celle-ci ne montre que ce dont on a
 * besoin pour se faire une idée : les photos, l'âge, la ville, la
 * présentation. En dupliquer une troisième aussi fournie n'aurait fait
 * qu'aggraver l'écart entre les trois.
 */

export type ProfilApercu = {
  prenom: string;
  nom?: string | null;
  ville?: string | null;
  naissance?: string | null;
  photos?: string[] | null;
  bio?: string | null;
  verifie?: boolean;
};

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

export function ApercuProfil({
  profil, onClose,
}: { profil: ProfilApercu; onClose: () => void }) {
  const a = age(profil.naissance);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      {/* `stopPropagation` : sans lui, un clic sur la photo ou sur le
          texte refermerait la fiche qu'on vient d'ouvrir. */}
      <div className="min-h-full max-w-md mx-auto bg-background pb-16"
           onClick={e => e.stopPropagation()}>
        <div className="relative aspect-[3/4]">
          {profil.photos?.[0]
            ? <img src={profil.photos[0]} alt={profil.prenom} className="w-full h-full object-cover" />
            : <div className="w-full h-full bg-gradient-to-br from-primary/25 to-gold/25 flex items-center justify-center font-serif text-6xl font-semibold text-primary">
                {(profil.prenom || "?").charAt(0).toUpperCase()}
              </div>}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="absolute bottom-0 inset-x-0 p-5">
            <h2 className="font-serif text-3xl font-bold flex items-center gap-2">
              <span className="truncate min-w-0">
                {displayName(profil.prenom, profil.nom)}{a > 0 && `, ${a}`}
              </span>
              {profil.verifie && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
            </h2>
            {profil.ville && (
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                <MapPin className="w-3.5 h-3.5" /> {profil.ville}
              </p>
            )}
          </div>
        </div>

        {(profil.photos?.length ?? 0) > 1 && (
          <div className="flex gap-2 px-5 pt-4 overflow-x-auto scrollbar-none">
            {profil.photos!.slice(1).map((ph, i) => (
              <img key={i} src={ph} alt="" loading="lazy"
                   className="w-24 h-32 rounded-xl object-cover shrink-0" />
            ))}
          </div>
        )}

        {profil.bio && (
          <div className="px-5 pt-5">
            <h3 className="font-serif text-lg font-semibold mb-2">À propos</h3>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
              {profil.bio}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

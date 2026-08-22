import { useState } from "react";
import { Play, X } from "lucide-react";
import { useSetting } from "@/lib/appSettings";

/**
 * La vidéo « Comment ça marche ».
 *
 * POURQUOI ELLE EXISTE
 *
 * Sur 149 inscrits, 103 n'ont jamais fait un seul geste dans l'écran de
 * découverte. Ce ne sont pas des gens désintéressés : ils ont rempli
 * quatre étapes d'inscription et envoyé leurs photos. Ils ne savaient
 * simplement pas quoi faire ensuite, et beaucoup ont écrit pour demander
 * « comment trouver mon âme sœur ». Une démonstration filmée répond à
 * cette question mieux que n'importe quel texte.
 *
 * RIEN N'EST CHARGÉ AVANT LE CLIC
 *
 * C'est la contrainte décisive. Un lecteur YouTube posé sur la page,
 * c'est près d'un mégaoctet de scripts et plusieurs requêtes à des
 * domaines tiers — sur CHAQUE ouverture de l'écran, y compris pour les
 * membres qui ont déjà vu la vidéo dix fois.
 *
 * Tant qu'on n'a pas cliqué, il n'y a donc qu'UNE image : la miniature
 * servie par YouTube. Le lecteur n'apparaît qu'ensuite, et l'iframe
 * n'est créée qu'à ce moment-là.
 *
 * POURQUOI YOUTUBE ET NON NOTRE STOCKAGE
 *
 * Une vidéo de 30 Mo regardée par 149 membres, ce sont 4,5 Go de bande
 * passante — soit presque le quota mensuel complet, en une journée. Et
 * chaque nouvel inscrit la regarde à son tour. YouTube absorbe ce coût,
 * et adapte en plus la qualité aux réseaux mobiles.
 */

/** Accepte les trois formes : youtu.be, /watch?v=, /embed/. */
function idVideo(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|[?&]v=|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function VideoGuide({
  titre = "Comment utiliser AgapeMeet",
  sousTitre = "Trois minutes pour tout comprendre",
  onFermer,
}: {
  titre?: string;
  sousTitre?: string;
  /** Fourni : une croix apparaît. Absent : la carte est permanente. */
  onFermer?: () => void;
}) {
  const url = useSetting("video_guide_url", "");
  const [lecture, setLecture] = useState(false);

  const id = idVideo(url ?? "");
  // Réglage vide ou adresse méconnaissable : on n'affiche rien plutôt
  // qu'un cadre noir. Une carte cassée est pire qu'une carte absente.
  if (!id) return null;

  return (
    <div className="rounded-2xl overflow-hidden border border-border bg-card shadow-soft mb-5">
      <div className="relative aspect-video bg-black">
        {lecture ? (
          <iframe
            /* `autoplay=1` : le clic sur la miniature EST la demande de
               lecture. Obliger à cliquer une seconde fois sur le lecteur
               qui vient d'apparaître passe pour un défaut. */
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`}
            title={titre}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button
            onClick={() => setLecture(true)}
            aria-label={`Lancer la vidéo : ${titre}`}
            className="absolute inset-0 w-full h-full group"
          >
            {/* `hqdefault` et non `maxresdefault` : cette dernière n'existe
                pas pour toutes les vidéos et laisserait un cadre noir.
                Celle-ci existe toujours, et pèse quelques dizaines de Ko. */}
            <img
              src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
              alt=""
              aria-hidden
              loading="lazy"
              className="w-full h-full object-cover"
            />
            <span className="absolute inset-0 bg-black/25 group-hover:bg-black/10 transition-colors" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="w-16 h-16 rounded-full bg-primary text-primary-foreground
                               flex items-center justify-center shadow-elegant
                               group-hover:scale-110 transition-transform">
                <Play className="w-7 h-7 ml-1" fill="currentColor" />
              </span>
            </span>
          </button>
        )}

        {onFermer && !lecture && (
          <button
            onClick={onFermer}
            aria-label="Masquer la vidéo"
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 backdrop-blur
                       text-white flex items-center justify-center hover:bg-black/70 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="px-4 py-3">
        <p className="text-sm font-semibold">{titre}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sousTitre}</p>
      </div>
    </div>
  );
}

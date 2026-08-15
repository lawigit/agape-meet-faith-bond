/**
 * Compression des photos avant envoi.
 *
 * POURQUOI C'EST LE POINT LE PLUS RENTABLE DE TOUTE L'APPLICATION
 *
 * Un téléphone récent produit des photos de 3 000 à 4 000 pixels de
 * large, pesant 3 à 8 Mo. Ces fichiers partaient tels quels dans le
 * stockage, puis étaient renvoyés tels quels au navigateur — pour être
 * affichés dans une vignette de 224 pixels.
 *
 * Sur l'accueil, jusqu'à vingt-quatre vignettes s'affichent ensemble.
 * Cela représentait facilement cent mégaoctets à télécharger pour
 * remplir un écran. Sur une connexion mobile africaine, c'est ce qui
 * rend l'application « très lente » — pas le code.
 *
 * LE COMPROMIS RETENU
 *
 * 1 280 pixels sur le grand côté, qualité 0,82. C'est assez pour la
 * fiche profil en plein écran sur un téléphone haute densité, et cela
 * ramène un fichier de 4 Mo à environ 200 Ko — vingt fois moins.
 *
 * Descendre plus bas se verrait sur les visages, et sur une application
 * de rencontre la photo EST le produit : mieux vaut une seconde de plus
 * qu'un portrait pixelisé.
 *
 * CE QUI SE PASSE SI LA COMPRESSION ÉCHOUE
 *
 * Le fichier d'origine est envoyé. Un format exotique ou une image
 * corrompue ne doit jamais empêcher quelqu'un de compléter son profil :
 * mieux vaut une photo lourde qu'un membre bloqué.
 */

const LARGEUR_MAX = 1280;
const QUALITE = 0.82;

export async function compresserImage(fichier: File): Promise<File> {
  // Les GIF perdraient leur animation en passant par un canevas, et les
  // SVG n'ont rien à y gagner.
  if (!fichier.type.startsWith("image/") ||
      fichier.type === "image/gif" ||
      fichier.type === "image/svg+xml") {
    return fichier;
  }

  try {
    const bitmap = await creerBitmap(fichier);

    const ratio = Math.min(1, LARGEUR_MAX / Math.max(bitmap.width, bitmap.height));

    // Déjà assez petite ET déjà légère : la recompresser ne ferait que
    // dégrader l'image sans rien gagner.
    if (ratio === 1 && fichier.size < 400_000) {
      bitmap.close?.();
      return fichier;
    }

    const largeur = Math.round(bitmap.width * ratio);
    const hauteur = Math.round(bitmap.height * ratio);

    const canevas = document.createElement("canvas");
    canevas.width = largeur;
    canevas.height = hauteur;

    const ctx = canevas.getContext("2d");
    if (!ctx) return fichier;

    ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>(resolve =>
      canevas.toBlob(resolve, "image/jpeg", QUALITE),
    );

    // Si le résultat est plus lourd que l'original — cela arrive sur une
    // image déjà très optimisée — on garde l'original.
    if (!blob || blob.size >= fichier.size) return fichier;

    const nom = fichier.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nom, { type: "image/jpeg", lastModified: Date.now() });
  } catch (e) {
    console.debug("[image] compression ignorée", e);
    return fichier;
  }
}

/**
 * `createImageBitmap` corrige l'orientation EXIF tout seul ; le repli
 * par `<img>` sert aux navigateurs qui ne le proposent pas.
 */
async function creerBitmap(fichier: File): Promise<ImageBitmap & { close?: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(fichier, { imageOrientation: "from-image" } as any);
    } catch {
      // Certains navigateurs refusent l'option : on réessaie sans.
      return await createImageBitmap(fichier);
    }
  }

  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img as any); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image illisible")); };
    img.src = url;
  });
}

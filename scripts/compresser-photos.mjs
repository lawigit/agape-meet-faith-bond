/**
 * Reprise des photos déjà en ligne.
 * ---------------------------------------------------------------------
 * Les photos envoyées avant la compression automatique pèsent 3 à 8 Mo
 * pour être affichées dans des vignettes de 224 pixels. Ce script les
 * rattrape UNE FOIS ; le flux entrant, lui, est déjà compressé.
 *
 * LA QUALITÉ PASSE AVANT LE POIDS
 *
 * Sur une application de rencontre, la photo EST le produit. Le
 * traitement est donc conservateur :
 *
 *   • 1 600 px sur le grand côté — au-delà de ce que le plus grand
 *     téléphone affiche, donc invisible à l'œil ;
 *   • `fit: inside` — aucun recadrage, aucune déformation, le cadrage
 *     d'origine est conservé au pixel près ;
 *   • `withoutEnlargement` — une petite photo n'est jamais agrandie,
 *     ce qui la rendrait floue ;
 *   • `rotate()` sans argument — applique l'orientation EXIF puis
 *     l'efface. Sans cela, les photos prises à l'horizontale
 *     basculeraient de 90° : le défaut le plus visible qui soit ;
 *   • qualité 88 avec mozjpeg, et `chromaSubsampling 4:4:4` — la
 *     compression par défaut dégrade les teintes de peau, très voyant
 *     sur des portraits.
 *
 * Résultat typique : 4 Mo → 350 Ko, sans différence perceptible.
 *
 * SÉCURITÉ
 *
 * La clé de service est lue dans l'environnement, jamais écrite ici.
 * Elle donne un accès total à la base : elle ne doit figurer ni dans le
 * dépôt, ni dans un journal.
 *
 * USAGE
 *
 *   # 1. Simulation — n'écrit RIEN, affiche ce qui serait fait
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/compresser-photos.mjs
 *
 *   # 2. Application, avec sauvegarde des originaux
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/compresser-photos.mjs --appliquer
 *
 * Relançable sans risque : les photos déjà traitées sont ignorées.
 */

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const URL = process.env.SUPABASE_URL ?? "";
const CLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const APPLIQUER = process.argv.includes("--appliquer");

const BUCKET = "photos";
/** Où sont copiés les originaux avant remplacement. */
const PREFIXE_SAUVEGARDE = "_originaux";

const LARGEUR_MAX = 1600;
const QUALITE = 88;
/** En dessous, le gain ne vaut pas la perte de génération. */
const SEUIL_OCTETS = 400_000;
/** Un an. Le chemin porte un horodatage : le contenu ne change jamais. */
const CACHE_SECONDES = 31_536_000;

if (!URL || !CLE) {
  console.error(
    "\n  Variables manquantes.\n\n" +
    "  SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont attendues dans\n" +
    "  l'environnement. On les trouve dans Supabase → Settings → API.\n\n" +
    "  Ne les collez PAS dans ce fichier : il est versionné.\n",
  );
  process.exit(1);
}

const db = createClient(URL, CLE, { auth: { persistSession: false } });

/**
 * En-tête de cache actuel de chaque fichier, relevé pendant le listage.
 *
 * Supabase le renvoie dans `metadata.cacheControl`. Le lire ici évite
 * une requête par photo, et permet de ne réécrire que celles qui en ont
 * réellement besoin.
 */
const fichierMeta = new Map();

/** Le stockage range les photos par dossier d'utilisateur. */
async function listerToutesLesPhotos() {
  const fichiers = [];

  const { data: dossiers, error } = await db.storage
    .from(BUCKET).list("", { limit: 10_000 });

  if (error) throw new Error(`Lecture du bucket impossible : ${error.message}`);

  for (const d of dossiers ?? []) {
    // Les entrées sans `id` sont des dossiers.
    if (d.id) {
      fichiers.push(d.name);
      fichierMeta.set(d.name, d.metadata?.cacheControl ?? "");
      continue;
    }
    if (d.name === PREFIXE_SAUVEGARDE) continue;   // ne pas retraiter les sauvegardes

    const { data: dedans } = await db.storage
      .from(BUCKET).list(d.name, { limit: 10_000 });

    for (const f of dedans ?? []) {
      if (f.id) {
        const chemin = `${d.name}/${f.name}`;
        fichiers.push(chemin);
        fichierMeta.set(chemin, f.metadata?.cacheControl ?? "");
      }
    }
  }

  return fichiers;
}

function ko(n) {
  return `${Math.round(n / 1024)} Ko`;
}

async function main() {
  console.log(
    APPLIQUER
      ? "\n  MODE APPLICATION — les fichiers seront remplacés.\n"
      : "\n  SIMULATION — aucune écriture. Ajoutez --appliquer pour agir.\n",
  );

  const chemins = await listerToutesLesPhotos();
  console.log(`  ${chemins.length} fichier(s) trouvé(s)\n`);

  let traites = 0, ignores = 0, echecs = 0, recaches = 0;
  let avant = 0, apres = 0;

  for (const chemin of chemins) {
    try {
      const { data: blob, error } = await db.storage.from(BUCKET).download(chemin);
      if (error || !blob) { echecs++; console.log(`  ✗ ${chemin} — téléchargement impossible`); continue; }

      const original = Buffer.from(await blob.arrayBuffer());
      const meta = await sharp(original).metadata();

      const grandCote = Math.max(meta.width ?? 0, meta.height ?? 0);
      if (grandCote <= LARGEUR_MAX && original.length < SEUIL_OCTETS) {
        // Déjà légère — mais peut-être pas correctement mise en cache.
        //
        // `cacheControl` est figé au moment de l'envoi. Les photos
        // compressées par une exécution ANTÉRIEURE de ce script portent
        // encore le défaut de Supabase : une heure. Chaque membre les
        // re-télécharge donc toutes les heures, ce qui coûte plus cher
        // en bande passante que leur poids lui-même.
        //
        // On les réécrit à l'identique, uniquement pour corriger
        // l'en-tête. Aucune recompression : les octets sont ceux
        // d'origine, la qualité ne bouge pas d'un pixel.
        const cacheActuel = fichierMeta.get(chemin) || "";
        if (!APPLIQUER || cacheActuel.includes(String(CACHE_SECONDES))) {
          ignores++;
          continue;
        }

        const { error: eCache } = await db.storage
          .from(BUCKET)
          .upload(chemin, original, {
            contentType: blob.type || "image/jpeg",
            cacheControl: String(CACHE_SECONDES),
            upsert: true,
          });

        if (eCache) { echecs++; console.log(`      x ${chemin} — cache : ${eCache.message}`); }
        else { recaches++; console.log(`  ~ ${chemin} — cache 1 h -> 1 an`); }
        continue;
      }

      const compresse = await sharp(original)
        .rotate()                                   // orientation EXIF, puis effacée
        .resize({
          width: LARGEUR_MAX,
          height: LARGEUR_MAX,
          fit: "inside",                            // aucun recadrage
          withoutEnlargement: true,                 // jamais d'agrandissement
          kernel: sharp.kernel.lanczos3,            // le plus net des rééchantillonnages
        })
        .jpeg({ quality: QUALITE, mozjpeg: true, chromaSubsampling: "4:4:4" })
        .toBuffer();

      // Un résultat plus lourd que l'original n'a aucun intérêt.
      if (compresse.length >= original.length) {
        ignores++;
        continue;
      }

      avant += original.length;
      apres += compresse.length;

      console.log(
        `  ${APPLIQUER ? "→" : "·"} ${chemin}\n` +
        `      ${ko(original.length)} → ${ko(compresse.length)}` +
        `   (${grandCote}px → ${Math.min(grandCote, LARGEUR_MAX)}px)`,
      );

      if (APPLIQUER) {
        // SAUVEGARDE D'ABORD. Remplacer sans copie serait irréversible,
        // et il s'agit des photos personnelles de vos membres.
        const { error: eSauv } = await db.storage
          .from(BUCKET)
          .upload(`${PREFIXE_SAUVEGARDE}/${chemin}`, original, {
            contentType: blob.type || "image/jpeg",
            upsert: true,
          });

        if (eSauv) {
          echecs++;
          console.log(`      ✗ sauvegarde refusée, remplacement annulé : ${eSauv.message}`);
          continue;
        }

        const { error: eMaj } = await db.storage
          .from(BUCKET)
          .upload(chemin, compresse, {
            contentType: "image/jpeg",
            // Un an. Ce script est le SEUL moyen de corriger l'en-tête de
            // cache des photos déjà en ligne : `cacheControl` est figé au
            // moment de l'envoi, changer le code de l'application ne
            // touche que les envois à venir.
            cacheControl: "31536000",
            upsert: true,          // même chemin : les URL en base restent valides
          });

        if (eMaj) { echecs++; console.log(`      ✗ ${eMaj.message}`); continue; }
      }

      traites++;
    } catch (e) {
      echecs++;
      console.log(`  ✗ ${chemin} — ${e.message}`);
    }
  }

  const gain = avant > 0 ? Math.round((1 - apres / avant) * 100) : 0;

  console.log(
    `
  ${traites} compressée(s) · ${recaches} recachée(s) · ${ignores} inchangée(s) · ${echecs} échec(s)
` +
    `  ${ko(avant)} → ${ko(apres)}   soit ${gain} % de moins\n` +
    (APPLIQUER
      ? `  Originaux conservés dans « ${PREFIXE_SAUVEGARDE}/ ».\n` +
        `  Vérifiez quelques profils, puis supprimez ce dossier.\n`
      : `  Rien n'a été modifié. Relancez avec --appliquer pour agir.\n`),
  );
}

main().catch(e => { console.error("\n  Échec :", e.message, "\n"); process.exit(1); });

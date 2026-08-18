import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.116.0";

/**
 * Rédaction quotidienne des publications de la chaîne WhatsApp.
 *
 * POURQUOI UNE GÉNÉRATION, ET NON UNE BANQUE PLUS GRANDE
 *
 * Une banque, même de deux cents messages, finit par tourner : à deux
 * publications par jour, cent jours plus tard les abonnés relisent ce
 * qu'ils ont déjà lu. Sur une chaîne, la répétition ne se pardonne pas —
 * on se désabonne, et l'on ne revient pas.
 *
 * Cette fonction écrit chaque nuit de nouveaux messages et les verse
 * dans la banque. Le calendrier, lui, ne change pas : il continue de
 * piocher dans `whatsapp_modeles` sans savoir d'où viennent les textes.
 *
 * LA BANQUE DE DÉPART RESTE LE PLANCHER
 *
 * Si la clé API manque, si le quota est atteint, si Anthropic répond mal
 * — la fonction sort en silence et la chaîne continue de publier les 48
 * messages écrits à la main. Une panne de rédaction ne doit jamais se
 * traduire par un créneau vide.
 *
 * ⚠️ À DÉPLOYER AVEC --no-verify-jwt
 *    pg_cron appelle via pg_net, qui n'envoie aucun jeton Supabase.
 *
 *    npx supabase functions deploy whatsapp-redaction --no-verify-jwt
 *
 * ⚠️ SECRET REQUIS
 *    npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
 *    La clé ne doit jamais apparaître dans le dépôt ni dans le frontend.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SECRET = Deno.env.get("PUSH_SECRET") ?? "";

/** Combien de messages écrire à chaque passage, par moment. */
const PAR_PASSAGE = { matin: 3, soir: 4 };

/**
 * Les angles, et ce qu'ils recouvrent.
 *
 * La liste vit ici et non dans la base : elle décrit ce qu'on demande à
 * la rédaction, pas ce que la chaîne publie. Ajouter un angle, c'est
 * changer la commande — pas migrer une table.
 */
const ANGLES = {
  matin: [
    ["verset", "Un verset biblique, sa référence exacte, et deux phrases qui l'appliquent à la vie de quelqu'un qui cherche à se marier."],
    ["priere", "Une prière courte, à la première personne, sur le célibat, l'attente, la préparation du cœur ou la protection des couples."],
    ["promesse", "Une promesse de Dieu tirée de l'Écriture, avec une phrase qui la relie à la solitude, au découragement ou à l'espérance."],
    ["sagesse", "Un proverbe biblique appliqué à l'argent, au travail, à la parole donnée ou au choix d'un conjoint."],
    ["gratitude", "Une invitation à compter ce qui est déjà donné avant de demander autre chose."],
  ],
  soir: [
    ["attente", "Sur le célibat vécu comme un temps utile et non comme une salle d'attente."],
    ["caractere", "Ce qu'il faut travailler en soi avant d'être deux : pardon, budget, écoute, maîtrise de soi."],
    ["temoignage", "Une histoire brève et crédible de couple chrétien africain — âges, obstacle réel, ce qui a tenu. JAMAIS de nom de famille, jamais de détail identifiable."],
    ["question", "Une seule question ouverte posée à la communauté, qui appelle une réponse en commentaire."],
    ["discernement", "Comment reconnaître une relation saine d'une relation qui abîme, avec un signe concret et observable."],
    ["famille", "Sur les enfants, les belles-familles, les traditions et la place de la foi dans un foyer africain."],
    ["agape", "Un rappel d'AgapeMeet : profils vérifiés, communauté chrétienne, https://agapemeet.com. Vendeur mais jamais racoleur."],
  ],
} as const;

const CONSIGNES = `Tu écris pour la chaîne WhatsApp d'AgapeMeet, une application chrétienne
de rencontre en vue du mariage, destinée à l'Afrique francophone (Togo,
Bénin, Côte d'Ivoire, Cameroun, Sénégal, RDC).

LE LECTEUR
Un homme ou une femme de 25 à 45 ans, chrétien pratiquant, célibataire,
divorcé ou veuf. Il cherche le mariage, pas une aventure. Il lit sur son
téléphone, souvent debout, entre deux tâches.

LA FORME, IMPÉRATIVE
- Français correct, sans anglicismes, sans tutoiement collectif appuyé.
- 40 à 90 mots. Un message qu'on fait défiler n'est pas lu.
- Un titre court en gras WhatsApp (*astérisques simples*), avec un emoji.
- Des retours à la ligne qui aèrent : c'est ce qui rend un message lisible
  sur WhatsApp.
- Au maximum trois emojis dans tout le message.

LE FOND, IMPÉRATIF
- Chrétien, et uniquement chrétien. Les références sont bibliques :
  Ancien et Nouveau Testament, jamais le Coran, jamais « Allah »,
  « inch'Allah », « barakah » ni aucun vocabulaire d'une autre religion.
- Quand tu cites un verset, la référence doit être exacte et vérifiable
  (livre, chapitre, verset). Dans le doute, choisis un verset que tu
  connais avec certitude plutôt qu'un verset approximatif.
- Aucune promesse de résultat : ni « Dieu t'enverra quelqu'un cette
  année », ni « si tu pries assez, tu te marieras ».
- Aucune culpabilisation du célibat, du divorce ou du veuvage.
- Aucune statistique inventée, aucun faux témoignage attribué à une
  personne nommée.
- Rien de politique, rien d'ethnique, rien sur la sexualité explicite.

LE TON
Chaleureux et direct, comme un aîné dans la foi qui parle à quelqu'un
qu'il estime. Jamais moralisateur, jamais mièvre. Une idée par message,
pas trois.`;

/** Ce que le modèle doit renvoyer, contraint par le schéma. */
const SCHEMA = {
  type: "object",
  properties: {
    messages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          moment: { type: "string", enum: ["matin", "soir"] },
          angle: { type: "string" },
          contenu: { type: "string" },
        },
        required: ["moment", "angle", "contenu"],
        additionalProperties: false,
      },
    },
  },
  required: ["messages"],
  additionalProperties: false,
} as const;

serve(async (req: Request) => {
  // Même garde que les autres fonctions appelées par pg_cron : sans jeton
  // Supabase, c'est ce secret partagé qui distingue notre planificateur
  // de n'importe qui ayant trouvé l'URL.
  if (SECRET && req.headers.get("x-push-secret") !== SECRET) {
    return new Response("non autorisé", { status: 401 });
  }

  if (!ANTHROPIC_KEY) {
    // Silencieux et non bloquant : la banque écrite à la main suffit à
    // faire tourner la chaîne. Mieux vaut publier du déjà-vu que rien.
    console.warn("[whatsapp] ANTHROPIC_API_KEY absente — rédaction ignorée");
    return Response.json({ ok: true, ecrits: 0, raison: "cle_absente" });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

  // Les derniers messages en banque, pour interdire la redite. On envoie
  // les débuts seulement : cinquante textes entiers coûteraient plus en
  // jetons que les messages qu'on demande d'écrire.
  const { data: recents } = await db
    .from("whatsapp_modeles")
    .select("contenu")
    .order("id", { ascending: false })
    .limit(60);

  const aEviter = (recents ?? [])
    .map((m: { contenu: string }) => m.contenu.split("\n")[0].slice(0, 70))
    .join("\n");

  const demande = [
    `Écris ${PAR_PASSAGE.matin} messages du MATIN et ${PAR_PASSAGE.soir} messages du SOIR.`,
    "",
    "Angles du matin (choisis-en un différent par message) :",
    ...ANGLES.matin.map(([cle, desc]) => `- ${cle} : ${desc}`),
    "",
    "Angles du soir (choisis-en un différent par message) :",
    ...ANGLES.soir.map(([cle, desc]) => `- ${cle} : ${desc}`),
    "",
    "Le champ `angle` doit valoir exactement l'une des clés ci-dessus.",
    "",
    "Ces ouvertures existent déjà dans la chaîne. N'écris rien qui leur",
    "ressemble, ni sur le fond ni sur la forme :",
    aEviter || "(la banque est vide)",
  ].join("\n");

  try {
    const reponse = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 16000,
      // `medium` plutôt que le défaut : écrire sept messages courts n'est
      // pas un problème de raisonnement. Le niveau supérieur coûterait
      // chaque nuit sans rien améliorer de perceptible à la lecture.
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: SCHEMA },
      },
      system: CONSIGNES,
      messages: [{ role: "user", content: demande }],
    });

    // Les classificateurs peuvent décliner une demande : la réponse est un
    // 200 avec `content` vide. Lire `content[0]` sans ce test planterait.
    if (reponse.stop_reason === "refusal") {
      console.error("[whatsapp] demande déclinée:", reponse.stop_details);
      return Response.json({ ok: false, ecrits: 0, raison: "refus" });
    }

    const bloc = reponse.content.find((b) => b.type === "text");
    if (!bloc || bloc.type !== "text") {
      return Response.json({ ok: false, ecrits: 0, raison: "reponse_vide" });
    }

    const { messages } = JSON.parse(bloc.text) as {
      messages: Array<{ moment: string; angle: string; contenu: string }>;
    };

    // Dernier filet avant la base : le schéma garantit la forme, pas le
    // fond. Un message hors sujet religieux passerait le schéma sans
    // problème — et se retrouverait publié tel quel devant les abonnés.
    const INTERDITS = /allah|inch'?allah|coran|sourate|barakah|ramadan|mosqu/i;
    const propres = messages.filter(m => {
      if (!m.contenu?.trim()) return false;
      if (m.contenu.length < 60 || m.contenu.length > 900) return false;
      if (INTERDITS.test(m.contenu)) {
        console.warn("[whatsapp] message écarté (vocabulaire) :", m.angle);
        return false;
      }
      return m.moment === "matin" || m.moment === "soir";
    });

    if (propres.length === 0) {
      return Response.json({ ok: false, ecrits: 0, raison: "rien_de_valide" });
    }

    // Le versement passe par une fonction SQL, et non par un `upsert` :
    // l'unicité repose sur un index d'EXPRESSION (`md5(contenu)`), que
    // PostgREST ne sait pas désigner comme cible de conflit. La fonction
    // insère message par message, si bien qu'un doublon en écarte un
    // seul au lieu de faire retomber tout le lot.
    const { data: ecrits, error } = await db.rpc("ajouter_modeles_whatsapp", {
      p_messages: propres.map(m => ({
        moment: m.moment, angle: m.angle, contenu: m.contenu,
      })),
    });

    if (error) {
      console.error("[whatsapp] insertion:", error);
      return Response.json({ ok: false, ecrits: 0, raison: error.message });
    }

    // Le calendrier se remplit dans la foulée : les messages tout juste
    // écrits deviennent programmables sans attendre la tâche de 3 h.
    await db.rpc("programmer_whatsapp");

    return Response.json({
      ok: true,
      ecrits: ecrits ?? 0,
      ecartes: messages.length - propres.length,
    });
  } catch (e) {
    // Quota, panne réseau, indisponibilité : la chaîne continue sur la
    // banque existante. Une erreur de rédaction n'est pas une urgence.
    console.error("[whatsapp] rédaction impossible:", e);
    return Response.json({ ok: false, ecrits: 0, raison: String(e) });
  }
});

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTransactional, sendNotification, layout } from "../_shared/email.ts";

/**
 * E-mails de cycle de vie — une exécution par jour.
 *
 * La base répond à « qui doit recevoir quoi aujourd'hui ? » via
 * `lifecycle_targets()`. Cette fonction se contente de rédiger et
 * d'envoyer : aucune règle métier ici, sans quoi elles finiraient par
 * diverger de celles du SQL.
 *
 * ⚠️ À DÉPLOYER AVEC --no-verify-jwt
 *    pg_cron appelle via pg_net, qui n'envoie aucun jeton Supabase. Sans
 *    ce drapeau, la plateforme rejette l'appel par un 401 avant même que
 *    ce code s'exécute — et rien n'apparaît dans les journaux.
 *
 *    npx supabase functions deploy daily-lifecycle --no-verify-jwt
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://agapemeet.com";
const SECRET = Deno.env.get("PUSH_SECRET") ?? "";

type Cible = {
  user_id: string;
  email: string;
  prenom: string | null;
  modele: string;
  cle_unique: string;
  donnees: Record<string, any>;
};

/**
 * Un modèle = un sujet, un corps, un bouton, une catégorie.
 *
 * `transactional` n'est utilisé QUE pour ce qui touche à une transaction
 * — ici les échéances d'abonnement. Y ranger un message d'accueil
 * reviendrait à contourner le désabonnement, ce qui se paie en plaintes.
 */
function rediger(c: Cible): {
  sujet: string;
  html: string;
  categorie: "transactional" | "matches" | "messages" | "community" | "marketing";
  max?: number;
} | null {
  const p = c.prenom?.trim() || "";
  const bonjour = p ? `Bonjour ${p},` : "Bonjour,";
  const d = c.donnees ?? {};

  switch (c.modele) {
    case "bienvenue":
      return {
        sujet: "Bienvenue sur AgapeMeet 🕊️",
        categorie: "marketing",
        html: layout({
          title: "Bienvenue parmi nous",
          category: "marketing",
          body: `<p>${bonjour}</p>
            <p>Votre profil est en ligne. Ici, on ne cherche pas une distraction :
            chaque membre déclare sa confession et son intention de mariage avant
            le premier message.</p>
            <p><strong>Pour bien commencer :</strong> une photo nette où l'on voit
            votre visage, et quelques mots sur votre vision du mariage. Les profils
            complets reçoivent nettement plus de visites.</p>`,
          ctaLabel: "Découvrir des profils",
          ctaUrl: `${APP_URL}/decouvrir`,
        }),
      };

    case "profil_incomplet":
      return {
        sujet: "Votre profil est presque prêt",
        categorie: "marketing",
        html: layout({
          title: "Il manque peu de chose",
          category: "marketing",
          body: `<p>${bonjour}</p>
            <p>Votre profil est rempli à <strong>${d.completion ?? 0} %</strong>.
            En dessous de 60 %, il remonte peu dans les suggestions — et vous
            recevez donc peu de visites.</p>
            <p>Quelques minutes suffisent : votre vision du mariage, ce que vous
            recherchez, vos centres d'intérêt.</p>`,
          ctaLabel: "Compléter mon profil",
          ctaUrl: `${APP_URL}/profil`,
        }),
      };

    case "jamais_swipe":
      return {
        sujet: "Des profils vous attendent",
        categorie: "marketing",
        html: layout({
          title: "Vous n'avez encore vu personne",
          category: "marketing",
          body: `<p>${bonjour}</p>
            <p>Vous vous êtes inscrit il y a trois jours, mais vous n'avez pas
            encore parcouru les profils. C'est pourtant là que tout commence.</p>
            <p>Prenez cinq minutes. Vous serez peut-être surpris de qui partage
            votre foi près de chez vous.</p>`,
          ctaLabel: "Voir qui est là",
          ctaUrl: `${APP_URL}/decouvrir`,
        }),
      };

    /**
     * J+2 — la relance qui rapporte le plus, parce qu'elle ne vend rien.
     *
     * Elle raconte ce qui s'est RÉELLEMENT passé sur le profil. Les
     * nombres viennent de la base et ne sont jamais arrondis vers le
     * haut : un chiffre gonflé se découvre au premier clic et ruine la
     * confiance sur tous les envois suivants.
     *
     * À zéro vue, on ne prétend pas le contraire — on parle alors de ce
     * qui manque au profil. Mentir ici serait le plus court chemin vers
     * une plainte.
     */
    case "decouvrez_premium": {
      const vues = Number(c.donnees?.vues ?? 0);
      const likes = Number(c.donnees?.likes ?? 0);
      const active = vues > 0 || likes > 0;

      const chiffres = [
        vues > 0 ? `<strong style="color:#1f1720">${vues}</strong> personne${vues > 1 ? "s ont" : " a"} regardé votre profil` : null,
        likes > 0 ? `<strong style="color:#1f1720">${likes}</strong> vous ${likes > 1 ? "ont" : "a"} aimé` : null,
      ].filter(Boolean).join(" et ");

      return {
        sujet: active ? "On vous a remarqué sur AgapeMeet" : "Votre profil mérite d'être vu",
        categorie: "marketing",
        html: layout({
          title: active ? "Quelqu'un s'intéresse à vous" : "Faites-vous remarquer",
          category: "marketing",
          body: active
            ? `<p>${bonjour}</p>
               <p>En deux jours, ${chiffres}.</p>
               <p>Avec Premium, vous découvrez <strong style="color:#1f1720">qui</strong> —
               et vous pouvez répondre. Sans cela, ces personnes resteront
               des silhouettes floutées.</p>
               <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                      style="margin:18px 0 0;background:#faf7f8;border-radius:12px">
                 <tr><td style="padding:14px 16px;font-size:14px;color:#544a50">
                   Voir qui vous a aimé · Likes illimités · 5 Super Likes par jour ·
                   Un Boost offert · Filtres avancés
                 </td></tr>
               </table>`
            : `<p>${bonjour}</p>
               <p>Votre profil n'a pas encore été beaucoup vu. C'est normal
               les premiers jours — et cela se corrige vite.</p>
               <p>Une photo nette et une présentation sincère multiplient les
               visites. Un Boost place votre profil devant tous les autres
               pendant 24 heures.</p>`,
          ctaLabel: active ? "Découvrir qui" : "Compléter mon profil",
          ctaUrl: active ? `${APP_URL}/abonnement` : `${APP_URL}/profil`,
        }),
      };
    }

    /**
     * J+5 — les atouts, en clair.
     *
     * Trois jours après la précédente : deux arguments de vente collés
     * se lisent comme du harcèlement, et le plafond quotidien ne protège
     * pas d'une insistance étalée sur la semaine.
     */
    case "atouts_premium":
      return {
        sujet: "Ce que Premium change, concrètement",
        categorie: "marketing",
        html: layout({
          title: "Cinq choses que vous ne voyez pas",
          category: "marketing",
          body: `<p>${bonjour}</p>
            <p>En formule Gratuite, une partie de ce qui se passe autour de
            votre profil vous reste invisible :</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                   style="margin:16px 0;background:#faf7f8;border-radius:12px">
              <tr><td style="padding:14px 16px;font-size:14px;color:#544a50;line-height:1.7">
                • <strong style="color:#1f1720">Qui vous a aimé</strong> — les visages restent floutés<br>
                • <strong style="color:#1f1720">Qui visite votre profil</strong><br>
                • <strong style="color:#1f1720">Likes illimités</strong> — au lieu de 25 par jour<br>
                • <strong style="color:#1f1720">Messages illimités</strong> — au lieu de 5<br>
                • <strong style="color:#1f1720">Filtres avancés</strong> — confession, pratique, ville
              </td></tr>
            </table>
            <p>À partir de <strong style="color:#1f1720">2 500 FCFA</strong> pour
            quinze jours, sans engagement ni prélèvement automatique.</p>`,
          ctaLabel: "Voir les formules",
          ctaUrl: `${APP_URL}/abonnement`,
        }),
      };

    case "semaine_un":
      return {
        sujet: "Une semaine avec vous",
        categorie: "marketing",
        html: layout({
          title: "Ils se sont rencontrés ici",
          category: "marketing",
          body: `<p>${bonjour}</p>
            <p>Cela fait une semaine que vous nous avez rejoints. Plus de
            120 couples se sont mariés après s'être rencontrés sur AgapeMeet.</p>
            <p>Un conseil qui revient chez tous : ne vous précipitez pas.
            Prenez le temps de connaître la personne, sa famille, son assemblée.
            Une relation orientée vers le mariage ne se décide pas en trois
            échanges.</p>`,
          ctaLabel: "Lire le guide",
          ctaUrl: `${APP_URL}/guide`,
        }),
      };

    case "expire_3j":
    case "expire_1j": {
      const j = c.modele === "expire_3j" ? "trois jours" : "demain";
      return {
        // Échéance d'abonnement : transactionnel. Quelqu'un qui a payé
        // doit être prévenu de la fin de son accès, désabonné ou non.
        sujet: c.modele === "expire_3j"
          ? "Votre abonnement expire dans 3 jours"
          : "Votre abonnement expire demain",
        categorie: "transactional",
        html: layout({
          title: "Votre abonnement arrive à échéance",
          category: "transactional",
          body: `<p>${bonjour}</p>
            <p>Votre formule ${d.plan === "vip" ? "VIP" : "Premium"} prend fin
            <strong>${j}</strong>.</p>
            <p>Sans renouvellement, vous repassez à 5 messages par jour, sans
            appels ni filtres avancés. Vos conversations en cours restent
            accessibles.</p>`,
          ctaLabel: "Renouveler",
          ctaUrl: `${APP_URL}/abonnement`,
        }),
      };
    }

    case "expire_depuis":
      return {
        sujet: "Vos conversations vous attendent",
        categorie: "marketing",
        html: layout({
          title: "Votre abonnement a pris fin",
          category: "marketing",
          body: `<p>${bonjour}</p>
            <p>Depuis deux jours, vous êtes revenu à la formule Gratuite :
            5 messages par jour, sans appels ni filtres.</p>
            <p>Vos matchs et vos conversations sont intacts. Ils reprennent
            là où vous les avez laissés dès que vous reprenez un abonnement.</p>`,
          ctaLabel: "Voir les formules",
          ctaUrl: `${APP_URL}/abonnement`,
        }),
      };

    case "passer_premium":
      return {
        sujet: `Vous avez ${d.matchs ?? 3} conversations en attente`,
        categorie: "marketing",
        html: layout({
          title: "Cinq messages par jour, c'est peu",
          category: "marketing",
          body: `<p>${bonjour}</p>
            <p>Vous avez <strong>${d.matchs ?? 3} matchs</strong>. Avec la
            formule Gratuite, cela fait moins de deux messages par personne et
            par jour — de quoi laisser une conversation s'éteindre faute de
            pouvoir répondre.</p>
            <p>Premium ouvre les messages, les appels audio et les filtres
            avancés à partir de 2 500 FCFA.</p>`,
          ctaLabel: "Voir les formules",
          ctaUrl: `${APP_URL}/abonnement`,
        }),
      };

    case "reveil":
      return {
        sujet: d.likes > 0
          ? `${d.likes} personne${d.likes > 1 ? "s vous ont" : " vous a"} remarqué`
          : "Vous nous manquez",
        categorie: "marketing",
        html: layout({
          title: "Cela fait deux semaines",
          category: "marketing",
          body: `<p>${bonjour}</p>
            ${d.likes > 0
              ? `<p><strong>${d.likes} membre${d.likes > 1 ? "s" : ""}</strong>
                 ${d.likes > 1 ? "ont" : "a"} aimé votre profil pendant votre
                 absence. Vous pouvez voir qui, c'est gratuit.</p>`
              : `<p>De nouveaux membres se sont inscrits depuis votre dernière
                 visite, certains près de chez vous.</p>`}
            <p>Votre profil est toujours en ligne et vos conversations vous
            attendent.</p>`,
          ctaLabel: d.likes > 0 ? "Voir qui m'a aimé" : "Revenir sur AgapeMeet",
          ctaUrl: d.likes > 0 ? `${APP_URL}/demandes` : `${APP_URL}/accueil`,
        }),
      };

    case "messages_non_lus":
      return {
        sujet: `${d.n} message${d.n > 1 ? "s" : ""} non lu${d.n > 1 ? "s" : ""}`,
        categorie: "messages",
        // Un seul résumé par jour, jamais un e-mail par message.
        max: 1,
        html: layout({
          title: "Vous avez du courrier",
          category: "messages",
          body: `<p>${bonjour}</p>
            <p>Vous avez <strong>${d.n} message${d.n > 1 ? "s" : ""} non
            lu${d.n > 1 ? "s" : ""}</strong> de ${d.de} personne${d.de > 1 ? "s" : ""},
            reçu${d.n > 1 ? "s" : ""} ces dernières 24 heures.</p>
            <p>Une réponse rapide change tout : les conversations qui durent
            sont presque toujours celles qui ont démarré vite.</p>`,
          ctaLabel: "Lire mes messages",
          ctaUrl: `${APP_URL}/messages`,
        }),
      };

    default:
      return null;
  }
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const fourni = req.headers.get("x-push-secret") ?? "";
  if (!SECRET || fourni !== SECRET) {
    console.warn("[lifecycle] secret invalide");
    return new Response("Forbidden", { status: 403 });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: cibles, error } = await db.rpc("lifecycle_targets");
  if (error) {
    console.error("[lifecycle] lecture des cibles:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const liste = (cibles ?? []) as Cible[];
  const compte: Record<string, number> = {};
  let envoyes = 0, ignores = 0, echecs = 0;

  // En SÉRIE, volontairement. Resend limite le débit, et un pic d'envois
  // simultanés depuis une adresse neuve est le signal le plus sûr pour
  // se faire classer en indésirable.
  for (const c of liste) {
    const m = rediger(c);
    if (!m || !c.email) { ignores++; continue; }

    try {
      const res = m.categorie === "transactional"
        ? await sendTransactional({
            userId: c.user_id,
            to: c.email,
            subject: m.sujet,
            html: m.html,
            template: c.modele,
            dedupeKey: c.cle_unique,
          })
        : await sendNotification({
            userId: c.user_id,
            to: c.email,
            subject: m.sujet,
            html: m.html,
            category: m.categorie,
            template: c.modele,
            dedupeKey: c.cle_unique,
            maxPerDay: m.max,
          });

      if (res.ok) {
        envoyes++;
        compte[c.modele] = (compte[c.modele] ?? 0) + 1;
      } else {
        // Refusé par les garde-fous : désabonné, adresse écartée,
        // plafond atteint ou doublon. Ce n'est pas une erreur.
        ignores++;
      }
    } catch (e) {
      echecs++;
      console.error("[lifecycle]", c.modele, e);
    }

    // 120 ms entre deux envois : environ huit par seconde, largement
    // sous les limites de Resend, et un rythme qui ne ressemble pas à
    // celui d'un robot d'envoi en masse.
    await new Promise(r => setTimeout(r, 120));
  }

  const resume = { cibles: liste.length, envoyes, ignores, echecs, detail: compte };
  console.log("[lifecycle]", JSON.stringify(resume));

  return new Response(JSON.stringify(resume), {
    headers: { "Content-Type": "application/json" },
  });
});

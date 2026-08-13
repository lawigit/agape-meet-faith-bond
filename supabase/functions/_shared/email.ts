import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Envoi d'e-mails via Resend.
 *
 * À n'utiliser QUE côté serveur : la clé API autorise l'envoi depuis votre
 * domaine, elle ne doit jamais atteindre le navigateur.
 *
 * Les e-mails d'authentification (confirmation, mot de passe oublié) ne
 * passent PAS par ici : Supabase Auth les envoie via le SMTP Resend
 * configuré dans le tableau de bord. Les dupliquer créerait deux sources
 * de vérité pour le même message.
 *
 * Deux fonctions, deux régimes :
 *   sendTransactional — reçus, sécurité. Toujours envoyé, sans opt-out.
 *   sendNotification  — match, résumés, marketing. Soumis aux préférences,
 *                       au plafond quotidien et à la déduplication.
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("EMAIL_FROM") ?? "AgapeMeet <noreply@agapemeet.com>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://agapemeet.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export type EmailCategory =
  | "transactional"
  | "matches"
  | "messages"
  | "visitors"
  | "community"
  | "marketing";

export type SendResult = {
  ok: boolean;
  id?: string;
  /** Pourquoi l'envoi n'a pas eu lieu : suppressed, opted_out, rate_limited… */
  skipped?: string;
  error?: string;
};

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

/**
 * Marqueur posé par `layout()` quand le jeton n'est pas encore connu, puis
 * résolu par `sendNotification`. Volontairement improbable dans un contenu
 * rédigé : il ne doit jamais être remplacé par accident.
 */
const UNSUB_PLACEHOLDER = "__AGAPE_UNSUB_URL__";

/** URL de désabonnement en un clic — sans connexion, comme l'exige Gmail. */
export function unsubscribeUrl(token: string, category: EmailCategory | "all" = "all") {
  return `${SUPABASE_URL}/functions/v1/unsubscribe?token=${token}&category=${category}`;
}

// ─── Envoi bas niveau ──────────────────────────────────────────────────────
/**
 * Ne lève JAMAIS. Un e-mail est un effet secondaire : faire échouer un
 * paiement déjà encaissé parce que la confirmation n'est pas partie serait
 * absurde. L'appelant décide quoi faire du résultat.
 */
async function deliver(params: {
  to: string;
  subject: string;
  html: string;
  unsubToken?: string;
  category: EmailCategory;
}): Promise<SendResult> {
  if (!RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY absente — envoi ignoré");
    return { ok: false, error: "not_configured" };
  }

  // En-têtes exigés depuis 2024 par Gmail et Yahoo pour les expéditeurs de
  // volume. Leur absence fait basculer les messages en indésirables.
  const headers: Record<string, string> = {};
  if (params.unsubToken && params.category !== "transactional") {
    const url = unsubscribeUrl(params.unsubToken, params.category);
    headers["List-Unsubscribe"] = `<${url}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        ...(Object.keys(headers).length ? { headers } : {}),
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      console.error("[email] Resend a refusé:", res.status, json);
      return { ok: false, error: json?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, id: json?.id };
  } catch (err) {
    console.error("[email] erreur réseau:", err);
    return { ok: false, error: "network" };
  }
}

async function logSent(params: {
  userId?: string | null;
  email: string;
  category: EmailCategory;
  template: string;
  dedupeKey?: string;
  resendId?: string;
}) {
  const { error } = await admin().from("email_log").insert({
    user_id: params.userId ?? null,
    email: params.email.toLowerCase(),
    category: params.category,
    template: params.template,
    dedupe_key: params.dedupeKey ?? null,
    resend_id: params.resendId ?? null,
  });
  if (error && error.code !== "23505") console.error("[email] journal:", error);
}

// ─── Transactionnel ────────────────────────────────────────────────────────
/**
 * Reçus de paiement, alertes de sécurité, changements de compte.
 * Aucun opt-out : ces messages concernent une transaction ou la sécurité,
 * et la loi les distingue explicitement de la prospection.
 * Seule la liste de suppression peut les bloquer.
 */
export async function sendTransactional(params: {
  userId?: string | null;
  to: string;
  subject: string;
  html: string;
  template: string;
  dedupeKey?: string;
}): Promise<SendResult> {
  const { data: check } = await admin().rpc("can_send_email", {
    p_user_id: params.userId ?? null,
    p_email: params.to,
    p_category: "transactional",
    p_dedupe_key: params.dedupeKey ?? null,
  });

  if (check && check.send === false) {
    return { ok: false, skipped: check.reason };
  }

  const res = await deliver({
    to: params.to,
    subject: params.subject,
    html: params.html,
    category: "transactional",
  });

  if (res.ok) {
    await logSent({
      userId: params.userId,
      email: params.to,
      category: "transactional",
      template: params.template,
      dedupeKey: params.dedupeKey,
      resendId: res.id,
    });
  }
  return res;
}

// ─── Notifications ─────────────────────────────────────────────────────────
/**
 * Match, résumés, marketing. Vérifie dans l'ordre : suppression,
 * préférence de catégorie, plafond quotidien, déduplication.
 *
 * Le plafond par défaut est volontairement bas. Dix conversations actives
 * produiraient dix e-mails, et c'est exactement ainsi qu'on déclenche des
 * plaintes — lesquelles finissent par empêcher les e-mails d'inscription
 * d'arriver, puisqu'ils partent du même domaine.
 */
export async function sendNotification(params: {
  userId: string;
  to: string;
  subject: string;
  html: string;
  category: Exclude<EmailCategory, "transactional">;
  template: string;
  dedupeKey?: string;
  maxPerDay?: number;
}): Promise<SendResult> {
  const db = admin();

  const { data: check } = await db.rpc("can_send_email", {
    p_user_id: params.userId,
    p_email: params.to,
    p_category: params.category,
    p_dedupe_key: params.dedupeKey ?? null,
    p_max_per_day: params.maxPerDay ?? 3,
  });

  if (check && check.send === false) {
    console.log(`[email] ${params.template} non envoyé : ${check.reason}`);
    return { ok: false, skipped: check.reason };
  }

  const { data: profile } = await db
    .from("profiles")
    .select("unsubscribe_token")
    .eq("id", params.userId)
    .single();

  // Le gabarit a pu poser un marqueur faute de connaître le jeton au moment
  // de sa construction. C'est ici, et seulement ici, qu'il est résolu.
  const token = profile?.unsubscribe_token;
  const html = params.html.includes(UNSUB_PLACEHOLDER)
    ? params.html.split(UNSUB_PLACEHOLDER).join(
        token
          ? unsubscribeUrl(token, params.category)
          : `${APP_URL}/parametres/notifications`,
      )
    : params.html;

  const res = await deliver({
    to: params.to,
    subject: params.subject,
    html,
    category: params.category,
    unsubToken: token,
  });

  if (res.ok) {
    await logSent({
      userId: params.userId,
      email: params.to,
      category: params.category,
      template: params.template,
      dedupeKey: params.dedupeKey,
      resendId: res.id,
    });
  }
  return res;
}

// ─── Gabarit ───────────────────────────────────────────────────────────────
/**
 * HTML en tableaux avec styles en ligne.
 *
 * Ce n'est pas de la négligence : les clients de messagerie ignorent
 * largement les feuilles de style et le CSS moderne, en particulier Outlook
 * et les webmails africains. C'est la seule approche fiable partout.
 */
export function layout(opts: {
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  unsubToken?: string;
  category?: EmailCategory;
}): string {
  const cta = opts.ctaLabel && opts.ctaUrl
    ? `<tr><td align="center" style="padding:8px 0 24px">
         <a href="${opts.ctaUrl}"
            style="display:inline-block;background:#7c3f5d;color:#ffffff;text-decoration:none;
                   padding:13px 28px;border-radius:999px;font-weight:600;font-size:15px">
           ${opts.ctaLabel}
         </a>
       </td></tr>`
    : "";

  // Le lien de désabonnement n'apparaît que sur les envois facultatifs :
  // proposer de se désabonner d'un reçu de paiement n'aurait pas de sens.
  //
  // L'appelant construit souvent le HTML sans connaître le jeton, qui n'est
  // lu qu'au moment de l'envoi. Dans ce cas on pose un marqueur que
  // `sendNotification` remplacera : sans quoi l'en-tête List-Unsubscribe
  // serait présent mais le lien visible absent — or Gmail exige les deux
  // pour les expéditeurs de volume.
  const optional = opts.category && opts.category !== "transactional";
  const unsub = !optional
    ? ""
    : `<br><a href="${opts.unsubToken ? unsubscribeUrl(opts.unsubToken, opts.category!) : UNSUB_PLACEHOLDER}"
             style="color:#8b7f86;text-decoration:underline">
         Ne plus recevoir ce type d'e-mail
       </a>`;

  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#faf7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f8;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #efe6ea">

        <tr><td align="center" style="padding:28px 24px 8px">
          <div style="font-size:22px;font-weight:700;color:#7c3f5d;letter-spacing:-0.3px">
            Agape<span style="color:#c9a227">Meet</span>
          </div>
        </td></tr>

        <tr><td style="padding:8px 32px 4px">
          <h1 style="margin:0;font-size:20px;line-height:1.35;color:#1f1720;font-weight:700">${opts.title}</h1>
        </td></tr>

        <tr><td style="padding:12px 32px 20px;font-size:15px;line-height:1.65;color:#544a50">
          ${opts.body}
        </td></tr>

        ${cta}

        <tr><td style="padding:18px 32px 26px;border-top:1px solid #f2eaee;font-size:12px;line-height:1.6;color:#8b7f86">
          Vous recevez cet e-mail parce que vous êtes membre d'AgapeMeet.<br>
          <a href="${APP_URL}/parametres/notifications" style="color:#7c3f5d">Gérer mes notifications</a>${unsub}
        </td></tr>

      </table>
      <div style="max-width:520px;margin-top:14px;font-size:11px;color:#a2969d;text-align:center">
        AgapeMeet — la rencontre chrétienne orientée vers le mariage
      </div>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Modèles ───────────────────────────────────────────────────────────────

export function subscriptionConfirmedEmail(params: {
  firstName: string;
  planLabel: string;
  durationLabel: string;
  amountXOF: number;
  expiresAt?: string | null;
}) {
  const amount = new Intl.NumberFormat("fr-FR").format(params.amountXOF) + " FCFA";
  const until = params.expiresAt
    ? `<p style="margin:12px 0 0">Votre accès est actif jusqu'au <strong>${new Date(params.expiresAt)
        .toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</strong>.</p>`
    : "";

  return {
    subject: `Votre ${params.planLabel} est activé — AgapeMeet`,
    html: layout({
      title: `Merci ${params.firstName}, c'est activé`,
      body: `
        <p style="margin:0">Votre paiement a bien été reçu et votre accès est ouvert.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="margin:18px 0 0;background:#faf7f8;border-radius:12px">
          <tr><td style="padding:14px 16px;font-size:14px;color:#544a50">
            <strong style="color:#1f1720">${params.planLabel}</strong> · ${params.durationLabel}<br>
            Montant réglé : <strong style="color:#1f1720">${amount}</strong>
          </td></tr>
        </table>
        ${until}
        <p style="margin:14px 0 0;font-size:13px;color:#8b7f86">
          Aucun prélèvement automatique ne suivra : vous avez acheté une durée, elle s'arrêtera d'elle-même.
        </p>`,
      ctaLabel: "Ouvrir AgapeMeet",
      ctaUrl: `${APP_URL}/accueil`,
    }),
  };
}

export function newMatchEmail(params: { firstName: string; matchName: string; unsubToken?: string }) {
  return {
    subject: `${params.matchName} et vous, c'est un match ! 🎉`,
    html: layout({
      title: `${params.firstName}, vous avez un nouveau match`,
      body: `
        <p style="margin:0">
          <strong style="color:#1f1720">${params.matchName}</strong> vous a aimé en retour.
          La conversation est ouverte — à vous de faire le premier pas.
        </p>
        <p style="margin:14px 0 0;font-size:13px;color:#8b7f86">
          Un premier message qui fait référence à quelque chose de précis dans son profil
          obtient bien plus de réponses qu'un simple « salut ».
        </p>`,
      ctaLabel: "Voir mon match",
      ctaUrl: `${APP_URL}/messages`,
      unsubToken: params.unsubToken,
      category: "matches",
    }),
  };
}

export function subscriptionExpiringEmail(params: {
  firstName: string;
  planLabel: string;
  daysLeft: number;
}) {
  const j = params.daysLeft;
  return {
    subject: j <= 1 ? `Votre ${params.planLabel} expire demain` : `Plus que ${j} jours de ${params.planLabel}`,
    html: layout({
      title: j <= 1 ? "Votre accès expire demain" : `Il vous reste ${j} jours`,
      body: `
        <p style="margin:0">
          Bonjour ${params.firstName}, votre formule <strong style="color:#1f1720">${params.planLabel}</strong>
          arrive à son terme${j <= 1 ? " demain" : ` dans ${j} jours`}.
        </p>
        <p style="margin:14px 0 0">
          Sans reconduction, vous repasserez en formule Gratuite : vous ne verrez plus
          qui visite votre profil et vos messages redeviendront limités.
        </p>`,
      ctaLabel: "Prolonger mon accès",
      ctaUrl: `${APP_URL}/abonnement`,
    }),
  };
}

/**
 * Profil certifié.
 *
 * Le message dit ce que le badge apporte CONCRÈTEMENT — être vu, être
 * cru — plutôt que de se féliciter. Un membre qui ne comprend pas à quoi
 * sert une distinction ne la valorise pas.
 *
 * Catégorie « transactional » : il annonce un changement d'état du
 * compte, comme un reçu. Il n'est pas soumis au désabonnement marketing,
 * et n'est envoyé qu'une fois grâce à sa clé de déduplication.
 */
export function profileVerifiedEmail(params: { firstName: string }) {
  return {
    subject: "Votre profil est certifié — AgapeMeet",
    html: layout({
      title: `C'est validé, ${params.firstName}`,
      body: `
        <p style="margin:0">
          Votre profil vient d'obtenir le
          <strong style="color:#1f1720">badge de vérification</strong>.
          Il est désormais visible à côté de votre prénom.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="margin:18px 0 0;background:#faf7f8;border-radius:12px">
          <tr><td style="padding:14px 16px;font-size:14px;color:#544a50">
            Les profils certifiés sont <strong style="color:#1f1720">mieux placés</strong>
            dans les suggestions, et reçoivent nettement plus de réponses :
            savoir qu'un profil a été vérifié lève la première hésitation.
          </td></tr>
        </table>
        <p style="margin:14px 0 0;font-size:13px;color:#8b7f86">
          Le badge peut être retiré si votre profil venait à ne plus respecter
          nos conditions d'utilisation.
        </p>`,
      ctaLabel: "Voir mon profil",
      ctaUrl: `${APP_URL}/profil`,
    }),
  };
}

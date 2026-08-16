import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTransactional, profileVerifiedEmail } from "../_shared/email.ts";

/**
 * Certification automatique des profils — un passage toutes les 15 min.
 *
 * LA BASE DÉCIDE, CETTE FONCTION PRÉVIENT. `certifier_automatiquement()`
 * applique le délai et les filtres, certifie, et renvoie uniquement les
 * profils NOUVELLEMENT certifiés. Rejouer cet appel ne peut donc pas
 * réexpédier d'anciens e-mails : les profils déjà certifiés ne sont plus
 * sélectionnés.
 *
 * La certification est écrite AVANT l'envoi, et volontairement. Si Resend
 * tombe, le membre est certifié sans recevoir son message — un désagrément.
 * Dans l'ordre inverse, une panne d'écriture enverrait un e-mail annonçant
 * une certification qui n'a pas eu lieu : le membre chercherait un badge
 * inexistant et écrirait au support.
 *
 * ⚠️ À DÉPLOYER AVEC --no-verify-jwt
 *    pg_cron appelle via pg_net, qui n'envoie aucun jeton Supabase. Sans
 *    ce drapeau la plateforme renvoie 401 avant que ce code s'exécute,
 *    et rien n'apparaît dans les journaux.
 *
 *    npx supabase functions deploy auto-certify --no-verify-jwt
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SECRET = Deno.env.get("PUSH_SECRET") ?? "";

type Certifie = { user_id: string; email: string; first_name: string };

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const fourni = req.headers.get("x-push-secret") ?? "";
  if (!SECRET || fourni !== SECRET) {
    console.warn("[auto-certify] secret invalide");
    return new Response("Forbidden", { status: 403 });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data, error } = await db.rpc("certifier_automatiquement");
  if (error) {
    console.error("[auto-certify] certification:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const liste = (data ?? []) as Certifie[];
  if (liste.length === 0) {
    return new Response(JSON.stringify({ certifies: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  /* Le lien WhatsApp est lu UNE FOIS, avant la boucle.
     Le relire à chaque destinataire ferait une requête par e-mail pour
     une valeur qui ne change pas d'une seconde à l'autre.

     Il vient de `app_settings` : vous le modifiez depuis
     l'administration sans redéployer. Illisible ou vide, le bouton
     n'apparaît pas — mieux vaut pas de bouton qu'un lien mort. */
  const { data: reglage } = await db
    .from("app_settings").select("value").eq("key", "community_whatsapp").maybeSingle();

  const lienWhatsapp = String((reglage as any)?.value ?? "").trim() || null;

  let envoyes = 0, ignores = 0, echecs = 0;

  // En SÉRIE. Resend limite le débit, et une rafale d'envois simultanés
  // depuis un domaine récent est le signal le plus sûr pour se retrouver
  // classé en indésirable.
  for (const c of liste) {
    if (!c.email) { ignores++; continue; }

    const m = profileVerifiedEmail({
      firstName: c.first_name || "Membre",
      whatsappUrl: lienWhatsapp,
    });

    try {
      const res = await sendTransactional({
        userId: c.user_id,
        to: c.email,
        subject: m.subject,
        html: m.html,
        template: "profile_verified",
        // Seconde barrière contre le doublon, indépendante de la base :
        // même si un profil était certifié deux fois, l'e-mail ne
        // partirait qu'une seule.
        dedupeKey: `verified:${c.user_id}`,
      });

      if (res.ok) envoyes++;
      else ignores++;
    } catch (e) {
      // Un envoi raté ne doit pas interrompre la boucle : les suivants
      // n'y sont pour rien, et le profil reste certifié de toute façon.
      console.error("[auto-certify] envoi:", c.user_id, e);
      echecs++;
    }
  }

  console.log(`[auto-certify] ${liste.length} certifiés · ${envoyes} envoyés · ${ignores} ignorés · ${echecs} échecs`);

  return new Response(
    JSON.stringify({ certifies: liste.length, envoyes, ignores, echecs }),
    { headers: { "Content-Type": "application/json" } },
  );
});

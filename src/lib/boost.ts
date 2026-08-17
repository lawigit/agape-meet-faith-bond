import { supabase } from "@/lib/supabase";

/**
 * Boost de profil : 30 minutes de mise en avant dans la découverte.
 *
 * Le quota et l'activation sont entièrement calculés en base
 * (`start_boost()` déduit l'utilisateur de auth.uid()), donc ni le compteur
 * ni la mise en avant ne sont manipulables depuis le navigateur.
 */

export const BOOST_DURATION_MIN = 30;

export type BoostStatus = {
  /** Boosts restants ce mois-ci. -1 = illimité. */
  left: number;
  quota: number;
  plan: string;
  /** Fin du boost en cours, ou null. */
  activeUntil: string | null;
};

export type BoostResult =
  | { ok: true; expiresAt: string }
  | { ok: false; reason: "plan" | "quota" | "already_active" | "unauthenticated" | "error"; expiresAt?: string };

export async function fetchBoostStatus(): Promise<BoostStatus> {
  const { data, error } = await supabase.rpc("boosts_left");

  if (error || !data) {
    console.error("[boost] statut:", error);
    return { left: 0, quota: 0, plan: "gratuit", activeUntil: null };
  }

  return {
    left: data.left ?? 0,
    quota: data.quota ?? 0,
    plan: data.plan ?? "gratuit",
    activeUntil: data.active_until ?? null,
  };
}

export async function startBoost(): Promise<BoostResult> {
  const { data, error } = await supabase.rpc("start_boost");

  if (error || !data) {
    console.error("[boost] activation:", error);
    return { ok: false, reason: "error" };
  }

  if (data.ok) return { ok: true, expiresAt: data.expires_at };
  return { ok: false, reason: data.reason ?? "error", expiresAt: data.expires_at };
}

/** Message affichable pour un refus. */
export function boostErrorMessage(reason: BoostResult extends { ok: false } ? never : string, expiresAt?: string) {
  switch (reason) {
    case "plan":
      return "Passez Premium pour placer votre profil en tête des découvertes";
    case "quota":
      return "Vous avez déjà utilisé votre Boost ce mois-ci";
    case "already_active":
      return expiresAt
        ? `Un Boost est déjà actif jusqu'à ${new Date(expiresAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
        : "Un Boost est déjà en cours";
    case "unauthenticated":
      return "Vous devez être connecté";
    default:
      return "Le Boost n'a pas pu être activé";
  }
}

/** Minutes restantes sur un boost actif, 0 si terminé. */
export function minutesLeft(activeUntil: string | null): number {
  if (!activeUntil) return 0;
  return Math.max(0, Math.ceil((new Date(activeUntil).getTime() - Date.now()) / 60000));
}

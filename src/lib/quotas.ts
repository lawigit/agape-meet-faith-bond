import { supabase } from "@/lib/supabase";

/**
 * Quotas de la formule Gratuit.
 *
 * Ils sont calculés en base : le navigateur les AFFICHE mais ne les décide
 * pas. Même si quelqu'un manipulait ces valeurs, les triggers de
 * 26_limites_gratuit.sql refuseraient l'écriture.
 */

export type Quotas = {
  plan: string;
  /** -1 = illimité */
  messagesLeft: number;
  /** Quota total du jour, -1 si illimité */
  messagesQuota: number;
  level: number;
  likesLeft: number;
  /** Date à laquelle le prochain Super Like sera disponible, ou null */
  superLikeAvailableAt: string | null;
};

export const FREE_QUOTAS = {
  messagesPerDay: 5,
  likesPerDay: 25,
  superLikeCooldownDays: 7,
} as const;

export async function fetchQuotas(): Promise<Quotas> {
  const { data, error } = await supabase.rpc("my_quotas");

  if (error || !data) {
    console.error("[quotas]", error);
    return { plan: "gratuit", messagesLeft: 0, messagesQuota: 5, level: 0, likesLeft: 0, superLikeAvailableAt: null };
  }

  return {
    plan: data.plan ?? "gratuit",
    messagesLeft: data.messages_left ?? -1,
    messagesQuota: data.messages_quota ?? -1,
    level: data.level ?? 0,
    likesLeft: data.likes_left ?? -1,
    superLikeAvailableAt: data.superlike_available_at ?? null,
  };
}

/**
 * Traduit un refus de la base en message lisible.
 * Les triggers lèvent des exceptions dont le message est un code stable
 * (`FREE_MESSAGE_QUOTA`…), volontairement indépendant de la langue.
 */
export function quotaErrorMessage(error: unknown): string | null {
  const raw = String((error as any)?.message ?? "");

  if (raw.includes("FREE_MESSAGE_QUOTA") || raw.includes("MESSAGE_QUOTA_REACHED"))
    return "Vous avez atteint votre quota de messages du jour";
  if (raw.includes("VIP_ONLY_VIDEO_MESSAGE"))
    return "Passez VIP pour envoyer des vidéos en conversation";
  if (raw.includes("VIP_ONLY_VIDEO_CALL"))
    return "Passez VIP pour vous voir en appel vidéo";
  if (raw.includes("VIP_ONLY_VIDEO_POST"))
    return "Passez VIP pour publier des vidéos";
  if (raw.includes("FREE_NO_VOICE"))
    return "Passez Premium pour envoyer des messages vocaux";
  if (raw.includes("FREE_LIKE_QUOTA"))
    return "Vous avez atteint vos 25 likes du jour";
  if (raw.includes("FREE_SUPERLIKE_COOLDOWN"))
    return "Un Super Like par semaine en formule Gratuit";
  if (raw.includes("FREE_NO_CALLS"))
    return "Passez Premium pour appeler vos matchs";
  if (raw.includes("FREE_NO_MEDIA_POST"))
    return "Les publications avec photo ou vidéo sont réservées aux membres Premium";
  // Levé par `block_if_suspended()` (migration 45) sur messages, swipes,
  // appels et publications. Sans cette ligne, un membre suspendu voyait
  // l'erreur brute de PostgreSQL.
  if (raw.includes("ACCOUNT_SUSPENDED"))
    return "Votre compte est suspendu";
  // Levé par les triggers de la migration 56, dans les deux sens : que
  // l'on ait bloqué ou que l'on ait été bloqué.
  if (raw.includes("CONVERSATION_BLOCKED"))
    return "Cette conversation est fermée";

  return null;
}

/** Jours restants avant le prochain Super Like, 0 si disponible. */
export function daysUntilSuperLike(availableAt: string | null): number {
  if (!availableAt) return 0;
  const ms = new Date(availableAt).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86400000);
}

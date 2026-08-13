import { supabase } from "@/lib/supabase";

/**
 * Accès aux données de /admin/utilisateurs.
 *
 * Tout le filtrage, la recherche et la pagination se font EN BASE. Filtrer
 * les 50 lignes déjà chargées reproduirait le défaut corrigé sur la
 * découverte : chercher les inactifs ne parcourrait que la page affichée.
 */

export type UserRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  city: string | null;
  country: string | null;
  gender: string | null;
  is_verified: boolean;
  is_founder: boolean;
  public_plan: string;
  premium_until: string | null;
  created_at: string;
  last_seen: string | null;
  photos: string[] | null;
  denomination: string | null;
  visibility: string;
  total_paye: number;
  nb_paiements: number;
  dernier_paiement: string | null;
  derniere_offre: string | null;
  completion: number;
  nb_matchs: number;
  nb_messages: number;
  nb_likes_donnes: number;
  nb_likes_recus: number;
  nb_signalements: number;
  nb_blocages: number;
  nb_tickets: number;
  suspended_until: string | null;
  suspension_reason: string | null;
  total_count: number;
};

export type Counts = {
  total: number;
  gratuit: number; premium: number; vip: number;
  fondateurs: number; expires: number;
  nouveaux_7j: number;
  femmes: number; hommes: number; genre_absent: number;
  actifs_7j: number; actifs_30j: number;
  verifies: number; non_verifies: number;
  payants: number; ca_total: number; revenu_par_payant: number;
  taux_conversion: number; expire_7j: number;
  inactifs_30j: number; signales: number; en_pause: number; suspendus: number;
};

export type Filters = {
  plan: string;
  segment: string | null;
  search: string;
  gender: string | null;
  country: string | null;
  verified: boolean | null;
  page: number;
};

export const DEFAULT_FILTERS: Filters = {
  plan: "all",
  segment: null,
  search: "",
  gender: null,
  country: null,
  verified: null,
  page: 0,
};

export const PAGE_SIZE = 50;

/** Segments transversaux, cumulables avec l'offre. */
export const SEGMENTS = [
  { key: "inactifs", label: "Inactifs +30 j", hint: "Cible de relance", countKey: "inactifs_30j" },
  { key: "incomplet", label: "Profil < 50 %", hint: "Échoueront puis partiront", countKey: null },
  { key: "signales", label: "Signalés", hint: "Signalement en attente", countKey: "signales" },
  { key: "expire_bientot", label: "Expire sous 7 j", hint: "La fenêtre pour sauver l'abonnement", countKey: "expire_7j" },
  { key: "jamais_swipe", label: "Jamais swipé", hint: "L'accueil n'a pas fonctionné", countKey: null },
  { key: "en_pause", label: "En pause", hint: "Désabonnement qui s'annonce", countKey: "en_pause" },
  { key: "suspendus", label: "Suspendus", hint: "Accès gelé par la modération", countKey: "suspendus" },
] as const;

export const OFFER_LABELS: Record<string, string> = {
  premium_15j: "Premium 15 j",
  premium_1m: "Premium 1 mois",
  premium_3m: "Premium 3 mois",
  vip_1m: "VIP 1 mois",
  boost_24h: "Boost 24 h",
  boost_3j: "Boost 3 jours",
  boost_7j: "Boost 7 jours",
};

export async function fetchCounts(): Promise<Counts | null> {
  const { data, error } = await supabase.rpc("admin_plan_counts");
  if (error || (data as any)?.error) {
    console.error("[admin/utilisateurs] effectifs:", error ?? data);
    return null;
  }
  return data as Counts;
}

export async function fetchUsers(f: Filters) {
  const { data, error } = await supabase.rpc("admin_users_by_plan", {
    p_plan: f.plan,
    p_search: f.search.trim() || null,
    p_limit: PAGE_SIZE,
    p_offset: f.page * PAGE_SIZE,
    p_segment: f.segment,
    p_gender: f.gender,
    p_country: f.country,
    p_verified: f.verified,
  });

  if (error) {
    console.error("[admin/utilisateurs] liste:", error);
    return { rows: [] as UserRow[], error };
  }
  return { rows: (data ?? []) as UserRow[], error: null };
}

export type UserDetail = {
  profil: any;
  paiements: any[];
  activite: Record<string, number>;
  moderation: { recus: any[]; emis_n: number; bloque_par_n: number; a_bloque_n: number };
  support: any[];
  gestes: any[];
};

export async function fetchUserDetail(id: string): Promise<UserDetail | null> {
  const { data, error } = await supabase.rpc("admin_user_detail", { p_user_id: id });
  if (error || (data as any)?.error) {
    console.error("[admin/utilisateurs] fiche:", error ?? data);
    return null;
  }
  return data as UserDetail;
}

export async function grantDays(
  userId: string, days: number, reason: string, plan: "premium" | "vip",
) {
  const { data, error } = await supabase.rpc("admin_grant_days", {
    p_user_id: userId,
    p_days: days,
    p_reason: reason,
    p_plan: plan,
  });
  if (error) return { ok: false, reason: error.message };
  return data as { ok: boolean; reason?: string; expires_at?: string };
}

/**
 * Notifie le membre par e-mail.
 *
 * Délibérément détachée de la sanction : si l'envoi échoue — clé Resend
 * absente, fonction non déployée — la suspension reste appliquée. L'inverse
 * serait absurde : on ne renonce pas à sanctionner parce qu'un e-mail n'est
 * pas parti.
 */
async function notifySuspension(payload: Record<string, unknown>) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-suspension`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn("[admin] notification de suspension non envoyée:", e);
  }
}

export async function suspendUser(userId: string, reason: string, days: number | null) {
  const { data, error } = await supabase.rpc("admin_suspend_user", {
    p_user_id: userId,
    p_reason: reason,
    p_days: days,
  });
  if (error) return { ok: false, reason: error.message };

  const res = data as { ok: boolean; reason?: string; until?: string; permanent?: boolean };
  if (res.ok) {
    void notifySuspension({
      userId, action: "suspended", reason,
      until: res.until, permanent: res.permanent,
    });
  }
  return res;
}

export async function unsuspendUser(userId: string) {
  const { data, error } = await supabase.rpc("admin_unsuspend_user", { p_user_id: userId });
  if (error) return { ok: false, reason: error.message };

  const res = data as { ok: boolean; reason?: string };
  if (res.ok) void notifySuspension({ userId, action: "lifted" });
  return res;
}

/**
 * Certifier un profil, ou lui retirer son badge.
 *
 * Passe par une fonction et non par un `update()` direct sur `profiles`.
 * Un refus de la RLS ne lève AUCUNE erreur : PostgREST renvoie « 0 ligne
 * modifiée ». L'écriture directe annonçait donc un succès même quand
 * rien n'était écrit, et l'échec ne se découvrait qu'au rechargement.
 */
export async function certifyUser(userId: string, verifie = true) {
  const { data, error } = await supabase.rpc("admin_certifier_profil", {
    p_user: userId, p_verifie: verifie,
  });

  if (error) {
    console.error("[admin/certification]", error);
    return { ok: false, reason: error.message };
  }
  return data as { ok: boolean; raison?: string; verifie?: boolean };
}

/** Une suspension à plus de dix ans vaut « définitive » côté affichage. */
export function isSuspended(u: { suspended_until?: string | null }): boolean {
  return Boolean(u.suspended_until) && new Date(u.suspended_until!).getTime() > Date.now();
}

export function isPermanent(u: { suspended_until?: string | null }): boolean {
  if (!u.suspended_until) return false;
  return new Date(u.suspended_until).getTime() > Date.now() + 10 * 365 * 86400000;
}

/**
 * Export CSV du segment affiché.
 *
 * Le point-virgule sépare les colonnes plutôt que la virgule : Excel en
 * configuration française ouvre autrement tout sur une seule colonne. Et
 * le BOM en tête évite que les accents deviennent illisibles.
 */
export function toCsv(rows: UserRow[]): string {
  const cols = [
    ["Prénom", (r: UserRow) => r.first_name],
    ["Nom", (r: UserRow) => r.last_name ?? ""],
    ["Ville", (r: UserRow) => r.city ?? ""],
    ["Pays", (r: UserRow) => r.country ?? ""],
    ["Genre", (r: UserRow) => (r.gender === "female" ? "Femme" : r.gender === "male" ? "Homme" : "")],
    ["Offre", (r: UserRow) => (r.is_founder ? "VIP (fondateur)" : r.public_plan)],
    ["Expire le", (r: UserRow) => (r.premium_until ? new Date(r.premium_until).toLocaleDateString("fr-FR") : "")],
    ["Vérifié", (r: UserRow) => (r.is_verified ? "oui" : "non")],
    ["Profil %", (r: UserRow) => String(r.completion)],
    ["Total payé", (r: UserRow) => String(r.total_paye)],
    ["Paiements", (r: UserRow) => String(r.nb_paiements)],
    ["Matchs", (r: UserRow) => String(r.nb_matchs)],
    ["Messages", (r: UserRow) => String(r.nb_messages)],
    ["Signalements", (r: UserRow) => String(r.nb_signalements)],
    ["Blocages subis", (r: UserRow) => String(r.nb_blocages)],
    ["Inscrit le", (r: UserRow) => new Date(r.created_at).toLocaleDateString("fr-FR")],
    ["Dernière activité", (r: UserRow) => (r.last_seen ? new Date(r.last_seen).toLocaleDateString("fr-FR") : "")],
  ] as const;

  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lignes = [
    cols.map(c => esc(c[0])).join(";"),
    ...rows.map(r => cols.map(c => esc(c[1](r))).join(";")),
  ];
  return "﻿" + lignes.join("\r\n");
}

export function downloadCsv(rows: UserRow[], nom: string) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nom}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

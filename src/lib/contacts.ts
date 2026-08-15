import { supabase } from "@/lib/supabase";

/**
 * Demandes de contact — distinctes des likes.
 *
 * Un like est un signal de séduction, silencieux, issu d'un balayage.
 * Une demande de contact est explicite : elle a un émetteur, un
 * destinataire, un état, et appelle une réponse.
 *
 * Toutes les écritures passent par des fonctions en base. La table
 * n'accepte aucune écriture directe : sans cela, on pourrait se déclarer
 * accepté chez quelqu'un d'autre.
 */

export type StatutDemande = "pending" | "accepted" | "refused";

export type Demande = {
  id: string;
  autre_id: string;
  statut: StatutDemande;
  message: string | null;
  created_at: string;
  prenom: string;
  nom: string | null;
  ville: string | null;
  naissance: string | null;
  photos: string[] | null;
  bio: string | null;
  verifie: boolean;
  /** Conversation associee. Absent tant que le contact n est pas accepte. */
  match_id: string | null;
};

export type MesDemandes = {
  recues: Demande[];
  envoyees: Demande[];
  contacts: Demande[];
};

const VIDE: MesDemandes = { recues: [], envoyees: [], contacts: [] };

export async function fetchDemandes(): Promise<MesDemandes> {
  const { data, error } = await supabase.rpc("mes_demandes");

  if (error || (data as any)?.error) {
    console.error("[demandes]", error ?? data);
    return VIDE;
  }
  const d = data as any;
  return {
    recues: d.recues ?? [],
    envoyees: d.envoyees ?? [],
    contacts: d.contacts ?? [],
  };
}

export type Envoi =
  | { ok: true; statut: StatutDemande; croisee?: boolean }
  | {
      ok: false; raison: string; statut?: StatutDemande;
      /** Renseignés uniquement quand `raison === "quota_atteint"`. */
      max?: number; utilise?: number; prochain?: string | null;
    };

export async function envoyerDemande(destinataire: string, message?: string): Promise<Envoi> {
  const { data, error } = await supabase.rpc("envoyer_demande", {
    p_destinataire: destinataire,
    p_message: message ?? null,
  });

  if (error) {
    console.error("[demandes] envoi:", error);
    return { ok: false, raison: error.message };
  }
  return data as Envoi;
}

export async function repondreDemande(id: string, accepte: boolean) {
  const { data, error } = await supabase.rpc("repondre_demande", {
    p_demande: id, p_accepte: accepte,
  });
  if (error) return { ok: false, raison: error.message };
  return data as { ok: boolean; raison?: string; statut?: StatutDemande };
}

export async function annulerDemande(id: string) {
  const { data, error } = await supabase.rpc("annuler_demande", { p_demande: id });
  if (error) return { ok: false, raison: error.message };
  return data as { ok: boolean; raison?: string };
}

export type EtatDemande = {
  etat: "aucun" | StatutDemande;
  id?: string;
  je_suis_emetteur?: boolean;
};

/** Sert à décider quel bouton afficher sur un profil. */
export async function etatDemande(autre: string): Promise<EtatDemande> {
  const { data, error } = await supabase.rpc("etat_demande", { p_autre: autre });
  if (error) { console.debug("[demandes] état:", error.message); return { etat: "aucun" }; }
  return data as EtatDemande;
}

/** Messages destinés à l'utilisateur, à partir du code renvoyé par la base. */
export const RAISONS: Record<string, string> = {
  non_connecte: "Vous devez être connecté.",
  destinataire_invalide: "Destinataire invalide.",
  introuvable: "Ce profil n'existe plus.",
  bloque: "Impossible d'envoyer une demande à ce membre.",
  deja_envoyee: "Vous avez déjà envoyé une demande à ce membre.",
  introuvable_ou_deja_traitee: "Cette demande a déjà été traitée.",
  // `quota_atteint` n'a volontairement pas de message ici : il ouvre un
  // panneau, pas une notification. Une notification disparaîtrait en
  // trois secondes, sans laisser le temps de lire l'offre.
};

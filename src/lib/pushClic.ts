import { supabase } from "@/lib/supabase";

/**
 * Enregistre le clic sur une notification d'engagement.
 *
 * Le moteur d'envoi glisse l'identifiant de l'envoi dans l'URL de
 * destination (`/decouvrir?pn=1234`). Le service worker ouvre cette URL
 * telle quelle — aucune modification de son côté, donc rien à propager
 * chez les membres qui ont installé l'application : un service worker
 * mis à jour peut mettre plusieurs jours à se remplacer.
 *
 * SANS CETTE MESURE, une notification push n'a aucun indicateur. Le
 * « taux d'ouverture » d'un e-mail repose sur une image invisible, qui
 * n'existe pas ici : l'appareil affiche la notification sans rien nous
 * dire. Le clic est donc la seule preuve qu'elle a servi — et de toute
 * façon la seule qui compte, une notification vue et ignorée n'ayant
 * rien produit.
 */
export function capturerClicPush(): void {
  if (typeof window === "undefined") return;

  try {
    const url = new URL(window.location.href);
    const brut = url.searchParams.get("pn");
    if (!brut) return;

    // Le paramètre est retiré AVANT l'appel réseau : il ne doit pas
    // survivre dans la barre d'adresse, ni être rejoué si la personne
    // partage le lien ou recharge la page.
    url.searchParams.delete("pn");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);

    const id = Number(brut);
    if (!Number.isInteger(id) || id <= 0) return;

    supabase.rpc("marquer_push_clique", { p_id: id }).then(({ error }: any) => {
      if (error) console.debug("[push] clic non enregistré", error.message);
    });
  } catch {
    // Une mesure ne doit jamais empêcher l'ouverture de la page.
  }
}

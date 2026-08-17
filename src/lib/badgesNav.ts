import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { poserPastille } from "@/lib/appBadge";

/**
 * Compteurs affichés sur la barre de navigation et sur la cloche.
 *
 * Un seul appel RPC pour les quatre : la barre est montée sur toutes les
 * pages et se rafraîchit en continu. Quatre requêtes REST par cycle,
 * multipliées par le nombre de membres connectés, se paieraient en
 * latence et en quota.
 *
 * UNE SEULE SOURCE POUR TOUS LES AFFICHAGES
 *
 * Deux composants lisent ces compteurs — la barre du bas et la cloche de
 * l'en-tête. Si chacun ouvrait son propre abonnement, on aurait deux
 * connexions Realtime portant le même nom de canal, deux minuteurs, et
 * deux appels RPC à chaque cycle. Pire : les deux pastilles pourraient
 * afficher des nombres différents pendant quelques secondes, ce qui est
 * exactement le genre de détail qui fait douter de toute l'application.
 *
 * L'état vit donc au niveau du module, avec un seul abonnement partagé,
 * ouvert au premier lecteur et fermé au dernier.
 *
 * Rafraîchissement à deux vitesses :
 *  — Realtime pour ce qui doit être immédiat (un message reçu doit faire
 *    apparaître la pastille tout de suite, comme sur WhatsApp) ;
 *  — un intervalle de sécurité, parce qu'une connexion Realtime tombe
 *    silencieusement sur les réseaux mobiles instables, et qu'on ne
 *    laisserait rien s'afficher pendant des heures.
 */

export type NavBadges = {
  messages: number;
  /** Likes et Super Likes reçus — affichés dans « M'ont aimé », accueil. */
  demandes: number;
  /** Demandes de contact reçues et non tranchées — page /demandes. */
  contacts: number;
  communaute: number;
};

const VIDE: NavBadges = { messages: 0, demandes: 0, contacts: 0, communaute: 0 };

/** Filet de sécurité si Realtime décroche. Deux minutes. */
const INTERVALLE_MS = 120_000;

let etat: NavBadges = VIDE;
const lecteurs = new Set<(b: NavBadges) => void>();
let canal: ReturnType<typeof supabase.channel> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let surRetour: (() => void) | null = null;

async function charger(): Promise<void> {
  const { data, error } = await supabase.rpc("my_badges");

  if (error) {
    // Silencieux et non bloquant : une pastille est un confort. La
    // migration 57 peut ne pas être passée, ou la session avoir expiré
    // — dans les deux cas, l'application doit rester utilisable.
    console.error("[badges]", error);
    return;
  }

  const d = (data ?? {}) as Partial<NavBadges>;
  etat = {
    messages: d.messages ?? 0,
    demandes: d.demandes ?? 0,
    // `?? 0` et non une valeur par défaut : tant que la migration 76
    // n'est pas passée, la base ne renvoie pas ce champ et la pastille
    // reste simplement absente, sans rien casser.
    contacts: d.contacts ?? 0,
    communaute: d.communaute ?? 0,
  };
  lecteurs.forEach(f => f(etat));

  // Pastille sur l'icône de l'application installée.
  //
  // Messages, likes reçus et demandes de contact — PAS la communauté :
  // une pastille rouge doit signaler ce qui s'adresse personnellement
  // au membre. Compter les publications du fil la ferait clignoter en
  // permanence, et l'on cesserait de la regarder.
  poserPastille(etat.messages + etat.demandes + etat.contacts);
}

function demarrer() {
  charger();

  // Un seul canal pour les quatre tables : chaque canal ouvre sa propre
  // connexion WebSocket côté Supabase.
  canal = supabase
    .channel("badges-nav")
    .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => charger())
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "swipes" }, () => charger())
    // `*` et non `INSERT` : la pastille doit aussi RETOMBER quand on
    // accepte ou refuse une demande, ce qui est un UPDATE. En écoutant
    // les seules insertions, le compteur monterait sans jamais
    // redescendre avant le rafraîchissement de deux minutes.
    .on("postgres_changes", { event: "*", schema: "public", table: "contact_requests" }, () => charger())
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_posts" }, () => charger())
    .subscribe();

  timer = setInterval(charger, INTERVALLE_MS);

  // Revenir sur l'application après l'avoir laissée en arrière-plan est
  // le moment où l'écart est le plus probable : le navigateur suspend
  // les minuteurs des onglets inactifs.
  surRetour = () => { if (document.visibilityState === "visible") charger(); };
  document.addEventListener("visibilitychange", surRetour);
}

function arreter() {
  if (timer) { clearInterval(timer); timer = null; }
  if (surRetour) { document.removeEventListener("visibilitychange", surRetour); surRetour = null; }
  if (canal) { supabase.removeChannel(canal); canal = null; }
}

export function useNavBadges(): NavBadges & { refresh: () => void } {
  const [badges, setBadges] = useState<NavBadges>(etat);

  useEffect(() => {
    lecteurs.add(setBadges);
    if (lecteurs.size === 1) demarrer();
    // Un lecteur qui arrive en second n'attend pas le prochain cycle :
    // il reçoit immédiatement ce qui est déjà connu.
    else setBadges(etat);

    return () => {
      lecteurs.delete(setBadges);
      if (lecteurs.size === 0) arreter();
    };
  }, []);

  return { ...badges, refresh: charger };
}

/** Marque la communauté comme lue. Appelée à l'ouverture de /communaute. */
export async function markCommunityRead(): Promise<void> {
  const { error } = await supabase.rpc("mark_community_read");
  if (error) console.error("[badges] lecture communauté:", error);
  else charger();
}

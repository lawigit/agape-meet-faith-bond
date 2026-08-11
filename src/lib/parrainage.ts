import { supabase } from "@/lib/supabase";

/**
 * Parrainage — capture du code et rattachement.
 *
 * POURQUOI `localStorage` ET NON UN COOKIE DE SESSION
 *
 * Entre le clic sur le lien d'un ami et la création du compte, il se
 * passe souvent plusieurs jours : on regarde, on hésite, on revient.
 * Une session expirée perdrait l'attribution — et le parrain, lui,
 * saurait très bien qu'il a amené cette personne. Rien ne détruit un
 * programme de parrainage plus vite que des filleuls qui « disparaissent ».
 *
 * Même mécanique que les campagnes publicitaires dans `meta.ts`, pour
 * la même raison.
 */

const CLE = "agape_ref";

/** Le lien à partager. */
export function lienParrainage(code: string): string {
  return `https://agapemeet.com/?ref=${encodeURIComponent(code)}`;
}

/**
 * Lit `?ref=` dans l'URL et le conserve.
 *
 * LE PREMIER CODE GAGNE. Quelqu'un qui arrive par le lien de Marie puis
 * clique plus tard celui de Paul reste le filleul de Marie : c'est elle
 * qui l'a fait venir. Écraser le code reviendrait à récompenser le
 * dernier lien cliqué plutôt que celui qui a convaincu.
 */
export function capturerParrain(): void {
  if (typeof window === "undefined") return;

  try {
    const code = new URLSearchParams(window.location.search).get("ref");
    if (!code) return;

    const propre = code.trim().toUpperCase().slice(0, 16);
    if (!/^[A-Z0-9-]+$/.test(propre)) return;

    if (localStorage.getItem(CLE)) return; // premier code conservé
    localStorage.setItem(CLE, propre);
  } catch {
    // Navigation privée : le stockage peut être refusé. Le parrainage
    // est un bonus, il ne doit jamais empêcher la visite.
  }
}

export function codeParrain(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(CLE); } catch { return null; }
}

/**
 * Rattache le filleul à son parrain, à la création du compte.
 *
 * Le refus n'est jamais montré au nouveau membre : un code expiré, un
 * programme désactivé ou un auto-parrainage ne sont pas de son fait, et
 * l'alerter d'un problème qu'il n'a pas causé gâcherait son inscription.
 * La base tranche silencieusement.
 */
export async function rattacherParrain(): Promise<void> {
  const code = codeParrain();
  if (!code) return;

  try {
    const { data, error } = await supabase.rpc("rattacher_parrain", { p_code: code });
    if (error) { console.debug("[parrainage]", error.message); return; }

    // Le code a servi — ou il ne servira jamais. Dans les deux cas on
    // le retire, pour qu'il ne soit pas rejoué sur un compte suivant
    // créé depuis le même téléphone.
    if ((data as any)?.ok || (data as any)?.raison === "deja_rattache") {
      try { localStorage.removeItem(CLE); } catch { /* sans importance */ }
    }
  } catch (e) {
    console.debug("[parrainage] rattachement ignoré", e);
  }
}

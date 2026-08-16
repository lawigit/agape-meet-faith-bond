import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { PAYS, PAYS_PRIORITAIRES, normaliser } from "@/content/pays";
import { INDICATIFS } from "@/content/indicatifs";
import { Drapeau } from "@/components/app/Drapeau";

/**
 * Choix de l'indicatif téléphonique — les 187 pays, avec recherche.
 *
 * CE QUE REMPLAÇAIT CE COMPOSANT
 *
 * Un `<select>` figé sur DIX-SEPT pays écrits en dur. Un membre au
 * Nigeria, en Angola, aux Émirats ou dans la diaspora ne trouvait pas
 * son indicatif — et ne pouvait donc pas payer du tout. Sur l'écran de
 * paiement, c'est le pire endroit où buter.
 *
 * POURQUOI PAS UN `<select>` NATIF
 *
 * Cent quatre-vingt-sept entrées dans un menu déroulant natif ne se
 * parcourent pas : il n'y a ni recherche, ni drapeau, et sur mobile le
 * défilement est interminable. La recherche est ici la fonction
 * principale, pas un ornement.
 *
 * Les pays prioritaires restent en tête tant qu'on ne cherche rien :
 * la quasi-totalité des membres sont dans cette poignée de pays, et
 * doivent trouver le leur sans rien taper.
 */

export type ChoixPays = { code: string; dial: string; label: string };

export function SelecteurIndicatif({
  valeur,
  onChange,
}: {
  valeur: ChoixPays;
  onChange: (c: ChoixPays) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [recherche, setRecherche] = useState("");
  const champRef = useRef<HTMLInputElement>(null);

  // Le focus part sur le champ dès l'ouverture : on vient chercher un
  // pays, pas admirer une liste.
  useEffect(() => {
    if (ouvert) setTimeout(() => champRef.current?.focus(), 50);
    else setRecherche("");
  }, [ouvert]);

  const liste = useMemo(() => {
    const avecIndicatif = PAYS
      .filter(p => INDICATIFS[p.code])
      .map(p => ({ code: p.code, dial: INDICATIFS[p.code], label: p.nom }));

    const q = normaliser(recherche.trim());
    if (!q) {
      // Prioritaires d'abord, dans l'ordre défini, puis le reste par
      // ordre alphabétique.
      const rang = (c: string) => {
        const i = PAYS_PRIORITAIRES.indexOf(c);
        return i === -1 ? 999 : i;
      };
      return [...avecIndicatif].sort((a, b) =>
        rang(a.code) - rang(b.code) || a.label.localeCompare(b.label, "fr"),
      );
    }

    // On cherche AUSSI dans l'indicatif : quelqu'un qui connaît « 234 »
    // sans savoir l'écrire « Nigeria » doit le trouver.
    return avecIndicatif.filter(p =>
      normaliser(p.label).includes(q) || p.dial.replace("+", "").includes(q.replace("+", "")),
    );
  }, [recherche]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="flex items-center gap-1.5 px-2.5 py-2.5 rounded-xl bg-secondary border border-border text-sm shrink-0 hover:bg-secondary/70 transition-colors"
      >
        <Drapeau pays={valeur.label} className="w-4 h-4 shrink-0" />
        <span className="tabular-nums">{valeur.dial}</span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      </button>

      {ouvert && (
        <div
          className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setOuvert(false)}
        >
          <div
            className="w-full max-w-sm max-h-[75vh] flex flex-col rounded-2xl bg-background border border-border shadow-elegant overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-3 border-b border-border flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={champRef}
                  value={recherche}
                  onChange={e => setRecherche(e.target.value)}
                  placeholder="Rechercher un pays ou un indicatif…"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <button
                type="button"
                onClick={() => setOuvert(false)}
                aria-label="Fermer"
                className="p-2 rounded-xl hover:bg-secondary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto">
              {liste.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">
                  Aucun pays ne correspond.
                </p>
              ) : (
                liste.map(p => (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => { onChange(p); setOuvert(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-secondary transition-colors ${
                      p.code === valeur.code ? "bg-primary/5" : ""
                    }`}
                  >
                    <Drapeau pays={p.label} className="w-5 h-5 shrink-0" />
                    <span className="flex-1 text-sm truncate">{p.label}</span>
                    <span className="text-sm text-muted-foreground tabular-nums shrink-0">
                      {p.dial}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

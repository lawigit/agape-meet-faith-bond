import { useMemo, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Search, Check, ChevronDown, Globe, X } from "lucide-react";
import { PAYS, PAYS_PRIORITAIRES } from "@/content/pays";
import { Drapeau } from "@/components/app/Drapeau";

/**
 * Choix d'un pays parmi tous ceux du monde.
 *
 * CE QU'IL REMPLACE
 *
 * Un `<select>` ne proposant que les pays où un membre est DÉJÀ inscrit.
 * Sur une application jeune, cela revient à dire à quelqu'un qui cherche
 * au Nigeria ou aux Émirats que ces pays n'existent pas — alors qu'il
 * suffirait d'un inscrit pour qu'ils apparaissent le lendemain.
 *
 * POURQUOI GARDER LES COMPTEURS
 *
 * Le nombre d'inscrits est l'information la plus utile de cet écran :
 * elle évite de filtrer sur un pays vide et de conclure que
 * l'application ne sert à rien. Les pays peuplés sont donc remontés en
 * tête, avec leur compte ; les autres restent accessibles, plus bas.
 *
 * Ordre : ceux qui ont des membres, puis les pays prioritaires — Afrique
 * de l'Ouest et centrale, plus la diaspora — puis le reste par ordre
 * alphabétique.
 *
 * LA RECHERCHE EST INDISPENSABLE ICI
 *
 * Deux cents entrées ne se parcourent pas au pouce. Elle ignore les
 * accents et la casse : « cote » doit trouver « Côte d'Ivoire », sans
 * quoi elle ne sert à rien pour la moitié des pays francophones.
 */

/** Sans accents ni casse : « Côte d'Ivoire » se trouve en tapant « cote ». */
/**
 * La plage U+0300–U+036F : les marques diacritiques.
 *
 * Construite par `String.fromCharCode` plutôt qu'écrite dans un littéral
 * de regex. `normalize("NFD")` sépare « é » en « e » + accent combinant,
 * et cet accent est un caractère INVISIBLE : posé nu dans le code, il ne
 * survit ni à un copier-coller ni à un outil qui réécrit le fichier.
 */
const DIACRITIQUES = new RegExp(
  "[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]",
  "g",
);

function aplatir(s: string) {
  return s.normalize("NFD").replace(DIACRITIQUES, "").toLowerCase();
}

export function SelecteurPays({
  valeur,
  comptes,
  onChange,
}: {
  /** Nom français du pays, ou "" pour « Tous les pays ». */
  valeur: string;
  /** Nombre de membres par pays, quand on le connaît. */
  comptes?: Array<{ valeur: string; n: number }>;
  onChange: (nom: string) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [recherche, setRecherche] = useState("");
  const champ = useRef<HTMLInputElement>(null);

  // Le focus arrive après la peinture : le donner pendant le rendu ne
  // fait rien, l'élément n'est pas encore dans le document.
  useEffect(() => {
    if (ouvert) setTimeout(() => champ.current?.focus(), 50);
    else setRecherche("");
  }, [ouvert]);

  const carte = useMemo(
    () => new Map((comptes ?? []).map(c => [c.valeur, c.n])),
    [comptes],
  );

  const liste = useMemo(() => {
    const q = aplatir(recherche.trim());
    const filtres = q
      ? PAYS.filter(p => aplatir(p.nom).includes(q) || aplatir(p.code) === q)
      : PAYS;

    const rang = (nom: string, code: string) => {
      if (carte.get(nom)) return 0;                       // des membres ici
      if (PAYS_PRIORITAIRES.includes(code)) return 1;     // notre zone
      return 2;
    };

    return [...filtres].sort((a, b) => {
      const ra = rang(a.nom, a.code), rb = rang(b.nom, b.code);
      if (ra !== rb) return ra - rb;
      // À rang égal, le plus peuplé d'abord ; sinon l'ordre alphabétique.
      const na = carte.get(a.nom) ?? 0, nb = carte.get(b.nom) ?? 0;
      if (na !== nb) return nb - na;
      return a.nom.localeCompare(b.nom, "fr");
    });
  }, [recherche, carte]);

  const choisi = PAYS.find(p => p.nom === valeur);

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="w-full h-11 px-3 rounded-xl border border-input bg-background
                   text-sm flex items-center gap-2 text-left"
      >
        {choisi
          ? <Drapeau pays={choisi.nom} className="w-5 h-5" />
          : <Globe className="w-4 h-4 text-muted-foreground shrink-0" />}
        <span className="flex-1 truncate">{choisi?.nom ?? "Tous les pays"}</span>
        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
      </button>

      {ouvert && createPortal(
        /* Portail : la feuille de filtres porte `backdrop-blur`, qui crée
           un bloc de référence pour les descendants en `position: fixed`.
           Sans portail, ce panneau serait rogné à l'intérieur d'elle. */
        <div
          className="fixed inset-0 z-[95] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center"
          onClick={() => setOuvert(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-md h-[85vh] sm:h-[70vh] flex flex-col
                       rounded-t-3xl sm:rounded-3xl bg-background border border-border shadow-elegant"
          >
            <div className="p-4 border-b border-border/60 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  ref={champ}
                  value={recherche}
                  onChange={e => setRecherche(e.target.value)}
                  placeholder="Rechercher un pays…"
                  className="w-full h-11 pl-9 pr-3 rounded-xl border border-input bg-secondary/40 text-sm
                             focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <button
                onClick={() => setOuvert(false)}
                aria-label="Fermer"
                className="p-2 rounded-full hover:bg-secondary shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {/* Toujours en tête, et jamais filtré par la recherche :
                  c'est la sortie de secours quand on s'est trompé de pays. */}
              <Ligne
                actif={!valeur}
                onClick={() => { onChange(""); setOuvert(false); }}
              >
                <Globe className="w-5 h-5 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate font-medium">Tous les pays</span>
              </Ligne>

              {liste.map(p => {
                const n = carte.get(p.nom) ?? 0;
                return (
                  <Ligne
                    key={p.code}
                    actif={valeur === p.nom}
                    onClick={() => { onChange(p.nom); setOuvert(false); }}
                  >
                    <Drapeau pays={p.nom} className="w-5 h-5" />
                    <span className="flex-1 truncate">{p.nom}</span>
                    {n > 0 && (
                      <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                        {n} membre{n > 1 ? "s" : ""}
                      </span>
                    )}
                  </Ligne>
                );
              })}

              {liste.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-10 px-6 leading-relaxed">
                  Aucun pays ne correspond à « {recherche} ».
                </p>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function Ligne({
  actif, onClick, children,
}: { actif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition-colors ${
        actif ? "bg-primary/10 text-primary font-semibold" : "hover:bg-secondary"
      }`}
    >
      {children}
      {actif && <Check className="w-4 h-4 shrink-0" />}
    </button>
  );
}

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { X, Lock, MapPin, Crown, RotateCcw, Loader2, Check } from "lucide-react";
import { SelecteurPays } from "@/components/app/SelecteurPays";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import {
  DEFAULT_FILTERS, countActiveFilters, fetchFilterOptions,
  enableLocation, disableLocation, mergeWithCanonical,
  type Filters, type FilterOptions,
} from "@/lib/filtres";
import { MARITAL_STATUSES, EDUCATION_LEVELS, formatHeight } from "@/lib/profilChamps";
import { Switch } from "@/components/ui/switch";

/**
 * Panneau de filtres.
 *
 * Les filtres avancés sont AFFICHÉS aux comptes gratuits, verrouillés
 * plutôt que masqués. Cacher une fonctionnalité payante ne la vend pas :
 * on ne désire pas ce qu'on ignore. En revanche le verrou est réel — la
 * fonction en base annule ces critères pour un compte gratuit, même si la
 * requête est forgée à la main.
 */
export function FilterSheet({
  filters,
  onApply,
  onClose,
  canUseAdvanced,
  locationShared,
  onLocationChange,
}: {
  filters: Filters;
  onApply: (f: Filters) => void;
  onClose: () => void;
  canUseAdvanced: boolean;
  locationShared: boolean;
  onLocationChange: (shared: boolean) => void;
}) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Filters>(filters);
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => { fetchFilterOptions().then(setOptions); }, []);

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setDraft(d => ({ ...d, [key]: value }));

  const toggleIn = (key: keyof Filters, value: string) => {
    const list = draft[key] as string[];
    set(key, (list.includes(value) ? list.filter(v => v !== value) : [...list, value]) as any);
  };

  const upsell = () => {
    toast.error("Passez Premium pour filtrer par confession, ville et distance", {
      action: { label: "Voir les formules", onClick: () => navigate({ to: "/abonnement" }) },
    });
  };

  const toggleLocation = async (next: boolean) => {
    setLocating(true);
    if (next) {
      const res = await enableLocation();
      if (!res.ok) {
        toast.error(
          res.reason === "refuse"
            ? "Localisation refusée. Autorisez-la dans les réglages de votre navigateur."
            : res.reason === "indisponible"
              ? "Votre appareil ne fournit pas de position."
              : "La position n'a pas pu être enregistrée.",
        );
        setLocating(false);
        return;
      }
      onLocationChange(true);
      toast.success("Position enregistrée. Vous pouvez filtrer par distance.");
    } else {
      await disableLocation();
      onLocationChange(false);
      set("maxKm", null);
    }
    setLocating(false);
  };

  const active = countActiveFilters(draft);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 z-50 bg-background rounded-t-[32px] max-h-[92vh] overflow-y-auto shadow-[0_-10px_40px_rgba(0,0,0,0.1)]"
      >
        <div className="sticky top-0 bg-background/95 backdrop-blur px-6 pt-6 pb-3 flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold">
            Filtres {active > 0 && <span className="text-primary">· {active}</span>}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDraft(DEFAULT_FILTERS)}
              className="p-2 rounded-full hover:bg-secondary text-muted-foreground"
              aria-label="Réinitialiser"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary" aria-label="Fermer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-6 pb-6 space-y-7">
          {/* ── Base, ouverte à tous ────────────────────────── */}
          <Section title="Filtres de base">
            <Row label="Pays">
              {/* Tous les pays du monde, pas seulement ceux où quelqu'un
                  est déjà inscrit. L'ancienne liste disait à qui cherchait
                  au Nigeria ou aux Émirats que ces pays n'existaient pas —
                  alors qu'une seule inscription les y aurait fait
                  apparaître le lendemain.

                  Les compteurs restent : ils évitent de filtrer sur un pays
                  vide et d'en conclure que l'application ne sert à rien. */}
              <SelecteurPays
                valeur={draft.country}
                comptes={options?.pays}
                onChange={v => set("country", v)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Les pays où des membres sont déjà inscrits apparaissent en premier.
              </p>
            </Row>

            <Row label={`Âge · ${draft.ageMin} à ${draft.ageMax} ans`}>
              <div className="flex items-center gap-3">
                <input
                  type="range" min={18} max={80} value={draft.ageMin}
                  onChange={e => set("ageMin", Math.min(Number(e.target.value), draft.ageMax))}
                  className="flex-1 accent-primary"
                />
                <input
                  type="range" min={18} max={80} value={draft.ageMax}
                  onChange={e => set("ageMax", Math.max(Number(e.target.value), draft.ageMin))}
                  className="flex-1 accent-primary"
                />
              </div>
            </Row>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Profils vérifiés uniquement</p>
                <p className="text-[11px] text-muted-foreground">Identité confirmée par notre équipe</p>
              </div>
              <Switch
                checked={draft.verifiedOnly}
                onCheckedChange={v => set("verifiedOnly", v)}
              />
            </div>
          </Section>

          {/* ── Avancés ─────────────────────────────────────── */}
          {/* Les critères restent PARFAITEMENT LISIBLES pour un compte
              gratuit. Un voile flouté cachait précisément ce qu'on cherche
              à vendre : on ne désire pas ce qu'on ne peut pas lire. Le
              verrou porte sur l'action, pas sur la lecture — et il tient
              en base de toute façon. */}
          <div>
            {!canUseAdvanced && (
              <button
                onClick={upsell}
                className="w-full text-left rounded-2xl border border-gold/50 bg-gold/10 p-4 mb-5 flex items-start gap-3 hover:bg-gold/15 transition-colors"
              >
                <Crown className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    Passez Premium pour affiner votre recherche avec ces sept filtres
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Situation matrimoniale, distance, confession, fréquentation
                    de l'église, intention de mariage, niveau d'études et taille.
                    Regardez ce qu'ils permettent — puis débloquez-les.
                  </p>
                  <span className="inline-flex items-center gap-1.5 mt-2.5 px-3.5 py-1.5 rounded-full bg-gold text-gold-foreground text-xs font-semibold">
                    Voir les formules
                  </span>
                </div>
              </button>
            )}

            <Section
              title="Filtres avancés"
              badge={!canUseAdvanced ? "Premium" : undefined}
            >
              {/* Localisation */}
              <div className="rounded-2xl border border-border p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-primary" /> Profils près de moi
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      Votre position est arrondie à environ 100 m et n'est jamais
                      affichée : seule la distance l'est.
                    </p>
                  </div>
                  {locating ? (
                    <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0 mt-1" />
                  ) : (
                    // Actif plutôt que désactivé : un interrupteur mort ne
                    // dit rien, celui-ci explique pourquoi il ne bascule pas.
                    <Switch
                      checked={locationShared}
                      onCheckedChange={v => (canUseAdvanced ? toggleLocation(v) : upsell())}
                    />
                  )}
                </div>

                {locationShared && (
                  <div className="mt-3.5 pt-3.5 border-t border-border/60">
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="text-xs font-medium">Rayon</span>
                      <span className="text-xs font-bold text-primary">
                        {draft.maxKm ? `${draft.maxKm} km` : "Sans limite"}
                      </span>
                    </div>
                    <input
                      type="range" min={0} max={500} step={10}
                      value={draft.maxKm ?? 0}
                      onChange={e => {
                        if (!canUseAdvanced) { upsell(); return; }
                        const v = Number(e.target.value);
                        set("maxKm", v === 0 ? null : v);
                      }}
                      className="w-full accent-primary"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Les profils qui ne partagent pas leur position sont écartés
                      dès qu'un rayon est défini.
                    </p>
                  </div>
                )}
              </div>

              <Row label="Situation matrimoniale" locked={!canUseAdvanced}>
                <Chips
                  options={mergeWithCanonical(
                    MARITAL_STATUSES.map(s => ({ value: s.key, label: s.label })),
                    options?.situations,
                  )}
                  selected={draft.marital}
                  onToggle={v => canUseAdvanced ? toggleIn("marital", v) : upsell()}
                />
              </Row>

              <Row label="Confession / Dénomination" locked={!canUseAdvanced}>
                <Chips
                  options={(options?.denominations ?? []).map(d => ({
                    value: d.valeur, label: `${d.valeur} (${d.n})`,
                  }))}
                  selected={draft.denomination}
                  onToggle={v => canUseAdvanced ? toggleIn("denomination", v) : upsell()}
                />
              </Row>

              <Row label="Fréquentation de l'église" locked={!canUseAdvanced}>
                <Chips
                  options={(options?.frequentation ?? []).map(v => ({
                    value: v.valeur, label: v.valeur, n: v.n,
                  }))}
                  selected={draft.attendance}
                  onToggle={v => canUseAdvanced ? toggleIn("attendance", v) : upsell()}
                />
              </Row>

              <Row label="Intention de mariage" locked={!canUseAdvanced}>
                <Chips
                  options={(options?.intentions ?? []).map(v => ({
                    value: v.valeur, label: v.valeur, n: v.n,
                  }))}
                  selected={draft.intent}
                  onToggle={v => canUseAdvanced ? toggleIn("intent", v) : upsell()}
                />
              </Row>

              {/* Liste fermée : les neuf niveaux du formulaire « Mon profil »
                  sont tous proposés, y compris ceux que personne n'a encore
                  renseignés. N'afficher que les valeurs présentes en base
                  laisserait croire qu'un critère a disparu. */}
              <Row label="Niveau d'études" locked={!canUseAdvanced}>
                <Chips
                  options={mergeWithCanonical(
                    EDUCATION_LEVELS.map(l => ({ value: l, label: l })),
                    options?.etudes,
                  )}
                  selected={draft.education}
                  onToggle={v => canUseAdvanced ? toggleIn("education", v) : upsell()}
                />
              </Row>

              <Row
                label={
                  draft.heightMin || draft.heightMax
                    ? `Taille · ${formatHeight(draft.heightMin ?? 140)} à ${formatHeight(draft.heightMax ?? 210)}`
                    : "Taille · indifférent"
                }
                locked={!canUseAdvanced}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="range" min={140} max={210}
                    value={draft.heightMin ?? 140}
                    onChange={e => canUseAdvanced
                      ? set("heightMin", Math.min(Number(e.target.value), draft.heightMax ?? 210))
                      : upsell()}
                    className="flex-1 accent-primary"
                  />
                  <input
                    type="range" min={140} max={210}
                    value={draft.heightMax ?? 210}
                    onChange={e => canUseAdvanced
                      ? set("heightMax", Math.max(Number(e.target.value), draft.heightMin ?? 140))
                      : upsell()}
                    className="flex-1 accent-primary"
                  />
                </div>
                {(draft.heightMin || draft.heightMax) && (
                  <button
                    onClick={() => { set("heightMin", null); set("heightMax", null); }}
                    className="text-[11px] text-muted-foreground underline mt-1"
                  >
                    Ne pas filtrer sur la taille
                  </button>
                )}
              </Row>
            </Section>
          </div>
        </div>

        <div className="sticky bottom-0 bg-background/95 backdrop-blur px-6 py-4 border-t border-border">
          <button
            onClick={() => { onApply(draft); onClose(); }}
            className="w-full py-3.5 rounded-full bg-primary text-primary-foreground font-semibold shadow-elegant"
          >
            Appliquer{active > 0 ? ` · ${active} filtre${active > 1 ? "s" : ""}` : ""}
          </button>
        </div>
      </motion.div>
    </>
  );
}

function Section({ title, badge, children }: {
  title: string; badge?: string; children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        {title}
        {badge && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gold/20 text-gold text-[10px] font-bold normal-case tracking-normal">
            <Lock className="w-3 h-3" /> {badge}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, locked, children }: {
  label: string; locked?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      {/* Un petit cadenas près du libellé remplace le voile : il signale la
          restriction sans empêcher de lire le critère ni ses options. */}
      <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
        {label}
        {locked && <Lock className="w-3.5 h-3.5 text-gold shrink-0" />}
      </p>
      {children}
    </div>
  );
}

/**
 * Sélection multiple par étiquettes.
 *
 * Un menu déroulant à choix unique obligerait à relancer une recherche par
 * confession. Ici, cocher « Catholique » et « Évangélique » élargit au lieu
 * de remplacer — c'est ce qu'on attend d'un filtre de rencontre.
 */
function Chips({ options, selected, onToggle }: {
  options: { value: string; label: string; n?: number }[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  if (options.length === 0) {
    return <p className="text-[11px] text-muted-foreground italic">Aucune valeur renseignée pour l'instant.</p>;
  }

  const vides = options.filter(o => o.n === 0).length;

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => {
          const on = selected.includes(o.value);
          // Une option sans membre reste sélectionnable : les inscriptions
          // arrivent, et un critère grisé aujourd'hui redeviendra pertinent
          // demain. Elle est simplement atténuée pour éviter la déception
          // d'un filtre qui ne renvoie rien.
          const vide = o.n === 0;
          return (
            <button
              key={o.value}
              onClick={() => onToggle(o.value)}
              title={vide ? "Aucun membre pour l'instant" : undefined}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                on
                  ? "bg-primary text-primary-foreground border-primary"
                  : vide
                    ? "border-border/60 text-muted-foreground/50 hover:border-primary/40"
                    : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {on && <Check className="w-3 h-3" />}
              {o.label}
              {typeof o.n === "number" && (
                <span className={on ? "opacity-80" : "opacity-60"}>({o.n})</span>
              )}
            </button>
          );
        })}
      </div>

      {vides > 0 && (
        <p className="text-[11px] text-muted-foreground mt-1.5">
          Les options atténuées ne comptent aucun membre pour l'instant.
        </p>
      )}
    </div>
  );
}

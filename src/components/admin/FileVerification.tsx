import { useEffect, useState } from "react";
import {
  ArrowLeft, RefreshCw, ShieldCheck, CheckCircle2, Eye, Loader2,
  AlertTriangle, MapPin, Flag, Inbox,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { fetchUsers, DEFAULT_FILTERS, PAGE_SIZE, type UserRow } from "@/lib/adminUsers";
import { UserDetailSheet } from "@/components/admin/UserDetailSheet";
import { displayName } from "@/lib/utils";

/**
 * File d'attente de vérification des profils.
 *
 * SA PLACE EST ICI, dans la modération, et non dans la liste des membres.
 * Vérifier un profil est un acte de modération : on regarde des photos,
 * on juge la cohérence d'une déclaration, on décide si quelqu'un mérite
 * un badge que les autres membres liront comme une garantie. La liste des
 * membres sert à administrer des comptes ; ce n'est pas le même geste.
 *
 * Les signalements reçus sont affichés SUR CHAQUE CARTE. Certifier un
 * profil déjà signalé trois fois serait exactement l'erreur que ce badge
 * doit empêcher — et l'information ne doit pas se trouver à deux clics.
 */
export function FileVerification({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [fiche, setFiche] = useState<string | null>(null);

  async function charger(p = 0, ajouter = false) {
    setChargement(true);
    const { rows: r, error } = await fetchUsers({
      ...DEFAULT_FILTERS, verified: false, page: p,
    });
    setChargement(false);

    if (error) { setErreur("Lecture impossible."); return; }
    setErreur(null);
    setTotal(r[0]?.total_count ?? 0);
    setRows(prev => (ajouter ? [...prev, ...r] : r));
    setPage(p);
  }

  useEffect(() => { charger(0); }, []);

  /**
   * La ligne DISPARAÎT de la file dès la certification.
   *
   * Recharger toute la liste ferait sauter la position de lecture et
   * obligerait à retrouver où l'on en était. Retirer la carte traitée
   * laisse la file avancer sous les yeux.
   */
  async function certifier(u: UserRow) {
    setBusy(u.id);
    const { error } = await supabase
      .from("profiles").update({ is_verified: true }).eq("id", u.id);
    setBusy(null);

    if (error) { toast.error("L'opération a échoué"); return; }
    toast.success(`${u.first_name} certifié`);
    setRows(prev => prev.filter(x => x.id !== u.id));
    setTotal(t => Math.max(0, t - 1));
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Retour à la modération
      </button>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold">Vérification des profils</h1>
          <p className="text-muted-foreground mt-1 text-sm max-w-xl">
            Examinez les photos et la cohérence du profil avant d'attribuer
            le badge. Les autres membres le liront comme une garantie.
          </p>
        </div>
        <button
          onClick={() => charger(0)}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card text-sm hover:bg-secondary">
          <RefreshCw className="w-4 h-4" /> Actualiser
        </button>
      </div>

      {erreur && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm">{erreur}</p>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
        <div>
          <div className="text-2xl font-serif font-bold tabular-nums">{total}</div>
          <div className="text-xs text-muted-foreground">
            {total > 1 ? "profils en attente de vérification" : "profil en attente de vérification"}
          </div>
        </div>
      </div>

      {chargement && rows.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map(i => <div key={i} className="h-64 rounded-2xl bg-secondary animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-14 text-center">
          <Inbox className="w-9 h-9 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground mt-4">
            Aucun profil en attente. Tout est à jour.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map(u => (
              <div key={u.id} className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
                {/* Les photos d'abord, en grand : c'est sur elles que la
                    décision se prend, et une vignette ne permet pas de
                    juger. */}
                <div className="flex gap-0.5 h-44 bg-secondary">
                  {(u.photos ?? []).slice(0, 3).map((ph, i) => (
                    <img key={i} src={ph} alt=""
                         className="flex-1 min-w-0 h-full object-cover" loading="lazy" />
                  ))}
                  {(!u.photos || u.photos.length === 0) && (
                    <div className="flex-1 grid place-items-center text-xs text-muted-foreground">
                      Aucune photo
                    </div>
                  )}
                </div>

                <div className="p-4 flex-1 flex flex-col">
                  <div className="font-semibold truncate">
                    {displayName(u.first_name, u.last_name)}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">
                      {[u.city, u.country].filter(Boolean).join(", ") || "Non précisée"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div className={`h-full rounded-full ${u.completion >= 80 ? "bg-emerald-500" : "bg-primary"}`}
                           style={{ width: `${u.completion}%` }} />
                    </div>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {u.completion} %
                    </span>
                  </div>

                  {/* L'avertissement décisif : certifier un profil déjà
                      signalé annulerait la valeur du badge. */}
                  {u.nb_signalements > 0 && (
                    <div className="mt-3 flex items-center gap-1.5 text-[11px] text-destructive bg-destructive/10 rounded-lg px-2 py-1.5">
                      <Flag className="w-3 h-3 shrink-0" />
                      {u.nb_signalements} signalement{u.nb_signalements > 1 ? "s" : ""} reçu{u.nb_signalements > 1 ? "s" : ""}
                    </div>
                  )}

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => certifier(u)}
                      disabled={busy === u.id}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold py-2.5 hover:opacity-90 transition disabled:opacity-50">
                      {busy === u.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <CheckCircle2 className="w-3.5 h-3.5" />}
                      Certifier
                    </button>
                    <button
                      onClick={() => setFiche(u.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border text-xs font-medium px-3 py-2.5 hover:bg-secondary transition"
                      title="Ouvrir la fiche complète">
                      <Eye className="w-3.5 h-3.5" /> Fiche
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {rows.length < total && (
            <button
              onClick={() => charger(page + 1, true)}
              disabled={chargement}
              className="w-full rounded-xl border border-border py-3 text-sm hover:bg-secondary transition disabled:opacity-50">
              {chargement ? "Chargement…" : `Charger les ${Math.min(PAGE_SIZE, total - rows.length)} suivants`}
            </button>
          )}
        </>
      )}

      {/* La fiche donne le reste : bio, foi, paiements, modération,
          suspension. Inutile de dupliquer ici ce qu'elle fait déjà. */}
      {fiche && (
        <UserDetailSheet
          userId={fiche}
          onClose={() => setFiche(null)}
          onChanged={() => charger(0)}
        />
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";

/**
 * Rappels et suggestions — distinct des notifications de message.
 *
 * POURQUOI UN RÉGLAGE À PART. Un membre agacé par les relances qui n'a
 * qu'un seul interrupteur coupe TOUT, y compris ses messages. Et un
 * refus de notifications au niveau du navigateur est définitif : il ne
 * redemandera jamais l'autorisation. Séparer les deux, c'est offrir une
 * sortie qui ne coûte pas l'essentiel.
 *
 * La formulation dit ce que le membre y gagne, pas ce que nous y
 * gagnons — « quand quelqu'un vous remarque » plutôt que « offres ».
 */
export function PushEngagement() {
  const [actif, setActif] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let annule = false;
    (async () => {
      const user = await getCurrentUser();
      if (!user || annule) return;

      const { data } = await supabase
        .from("profiles").select("push_engagement").eq("id", user.id).maybeSingle();

      if (!annule) setActif((data as any)?.push_engagement ?? true);
    })();
    return () => { annule = true; };
  }, []);

  async function basculer() {
    if (actif === null) return;
    const suivant = !actif;

    // Bascule optimiste : l'interrupteur doit répondre au doigt. En cas
    // d'échec on revient en arrière et on le dit.
    setActif(suivant);
    setBusy(true);
    const { data, error } = await supabase.rpc("regler_push_engagement", { p_actif: suivant });
    setBusy(false);

    if (error || !(data as any)?.ok) {
      setActif(!suivant);
      toast.error("Enregistrement impossible");
      return;
    }
    toast.success(suivant ? "Rappels activés" : "Rappels désactivés");
  }

  if (actif === null) return <div className="h-20 rounded-2xl bg-secondary animate-pulse" />;

  return (
    <button
      onClick={basculer}
      disabled={busy}
      className="w-full rounded-2xl border border-border bg-card p-4 flex items-center gap-3 text-left hover:bg-secondary/40 transition-colors disabled:opacity-60"
    >
      <div className="w-10 h-10 rounded-xl bg-primary/10 grid place-items-center shrink-0">
        {busy
          ? <Loader2 className="w-5 h-5 text-primary animate-spin" />
          : <Sparkles className="w-5 h-5 text-primary" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">Rappels et suggestions</div>
        <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
          Quand quelqu'un vous remarque, ou pour vous rappeler de revenir.
          Trois par semaine au maximum, jamais la nuit.
        </div>
      </div>

      <span className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${
        actif ? "bg-primary" : "bg-secondary"}`}>
        <span className={`block w-5 h-5 rounded-full bg-background shadow-sm transition-transform ${
          actif ? "translate-x-5" : ""}`} />
      </span>
    </button>
  );
}

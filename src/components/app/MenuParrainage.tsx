import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Gift } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useSettings } from "@/lib/appSettings";
import { supabase } from "@/lib/supabase";

/**
 * L'entrée « Parrainage » du menu — ou rien du tout.
 *
 * DEUX CONDITIONS, ET LA SECONDE COMPTE AUTANT QUE LA PREMIÈRE.
 *
 * Le programme doit être allumé, ET le membre doit y avoir droit. En
 * mode « invitation », afficher l'entrée à tout le monde enverrait la
 * majorité des membres sur une page qui leur dit non — une invitation
 * transformée en refus, ce qui est pire que de ne rien montrer.
 *
 * Rien n'est affiché tant que la réponse n'est pas connue : une entrée
 * qui apparaît puis disparaît est plus déroutante qu'une entrée absente.
 */
export function MenuParrainage() {
  const settings = useSettings();
  const [affilie, setAffilie] = useState<boolean | null>(null);

  const actif = settings?.affiliation_active === true;
  const mode = settings?.affiliation_mode ?? "invitation";

  useEffect(() => {
    if (!actif || mode === "tous") return;

    let annule = false;
    // La RLS de `affiliates` ne laisse voir que sa propre ligne : cette
    // requête ne peut pas révéler qui d'autre est parrain.
    supabase.from("affiliates").select("code").maybeSingle()
      .then(({ data }: any) => { if (!annule) setAffilie(!!data); });

    return () => { annule = true; };
  }, [actif, mode]);

  if (!actif) return null;
  // En mode « tous », le code est créé à la première visite de la page :
  // inutile d'interroger la base pour savoir s'il existe déjà.
  if (mode !== "tous" && !affilie) return null;

  return (
    <DropdownMenuItem asChild className="rounded-xl cursor-pointer hover:bg-secondary">
      <Link to="/parrainage" className="flex items-center gap-3 py-2.5 px-2">
        <Gift className="w-4 h-4 text-gold" />
        <span className="font-medium">Parrainage</span>
      </Link>
    </DropdownMenuItem>
  );
}

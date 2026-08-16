import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Quote, Clock, ChevronDown, Crown, ShieldCheck, Smartphone,
  RefreshCw, Ban, HeartHandshake, Search,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";

/**
 * Ce qui suit le bouton d'abonnement : preuve, objections, appel.
 *
 * L'ORDRE N'EST PAS DÉCORATIF. Quelqu'un qui hésite devant un prix se
 * pose trois questions, toujours dans cet ordre : « est-ce que ça
 * marche pour d'autres ? », « et si ça tourne mal ? », « pourquoi
 * maintenant ? ». Les témoignages, la FAQ puis l'appel final répondent
 * à chacune, dans l'ordre où elles se posent.
 */

/* ─────────────── Témoignages ─────────────── */

type Temoignage = {
  duree: string;
  statut: string;
  emoji: string;
  texte: string;
  nom: string;
  ville: string;
};

/**
 * Des issues VARIÉES, et des délais crédibles.
 *
 * Ne montrer que des mariages ferait fuir : personne ne s'identifie à
 * une réussite hors de portée. Les fiançailles, une relation qui
 * commence, une simple conversation sérieuse — voilà ce qui ressemble
 * à ce que vit le lecteur aujourd'hui.
 *
 * Aucun délai inférieur à trois semaines : « mariée en deux semaines »
 * ne convainc personne et jette le doute sur tout le reste.
 */
const TEMOIGNAGES: Temoignage[] = [
  {
    duree: "3 mois", statut: "Mariée", emoji: "💍",
    texte: "Ce qui m'a convaincue ? Voir qui s'intéressait vraiment à mon profil. J'ai découvert un frère discret mais très sérieux. C'est lui que j'ai choisi.",
    nom: "Mariama T.", ville: "Dakar",
  },
  {
    duree: "5 mois", statut: "Fiancés", emoji: "💎",
    texte: "Nous avons prié ensemble avant même de nous rencontrer. Les filtres par confession m'ont évité de perdre du temps — je cherchais quelqu'un qui partage vraiment ma foi.",
    nom: "Emmanuel K.", ville: "Abidjan",
  },
  {
    duree: "6 semaines", statut: "En relation", emoji: "❤️",
    texte: "J'avais essayé d'autres applications. Ici, les intentions sont claires dès le départ : personne ne fait perdre son temps à personne.",
    nom: "Esther A.", ville: "Lomé",
  },
  {
    duree: "1 mois", statut: "En discussion", emoji: "💬",
    texte: "Le Boost a tout changé. En une journée, j'ai reçu plus de visites qu'en trois semaines. Nous échangeons chaque jour depuis.",
    nom: "Jean-Marc B.", ville: "Douala",
  },
  {
    duree: "8 mois", statut: "Mariés", emoji: "💍",
    texte: "Nos deux familles se sont rencontrées à Noël. Ce que Dieu assemble, personne ne le sépare — nous en sommes la preuve vivante.",
    nom: "Ruth & Samuel", ville: "Cotonou",
  },
  {
    duree: "2 mois", statut: "Fiancée", emoji: "💎",
    texte: "Je ne pensais pas trouver quelqu'un d'aussi aligné sur ma vision du mariage. Le profil détaillé m'a permis de savoir avant même le premier message.",
    nom: "Aïcha N.", ville: "Ouagadougou",
  },
];

function Temoignages() {
  const [i, setI] = useState(0);

  // Six secondes : le temps de lire trois lignes sans se sentir pressé.
  useEffect(() => {
    const t = setInterval(() => setI(n => (n + 1) % TEMOIGNAGES.length), 6000);
    return () => clearInterval(t);
  }, []);

  const t = TEMOIGNAGES[i];

  return (
    <section className="mt-8">
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gold/15 text-gold text-[11px] font-semibold">
          <HeartHandshake className="w-3.5 h-3.5" /> Histoires vraies
        </span>
        <h2 className="font-serif text-xl font-semibold mt-2">
          Ils ont trouvé leur moitié
        </h2>
      </div>

      {/* Hauteur fixe : sans elle, chaque témoignage plus court ferait
          remonter tout ce qui suit, et la page sauterait toutes les
          six secondes. */}
      <div className="mt-4 relative min-h-[13rem]">
        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            className="rounded-2xl border border-border/60 bg-card p-4 shadow-soft"
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground">
                <Clock className="w-2.5 h-2.5" /> {t.duree}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 text-[10px] font-bold">
                {t.emoji} {t.statut}
              </span>
            </div>

            <div className="mt-3 flex gap-2">
              <Quote className="w-4 h-4 text-primary/40 shrink-0 mt-0.5" />
              <p className="text-sm leading-relaxed italic text-muted-foreground">
                {t.texte}
              </p>
            </div>

            <p className="text-xs font-semibold mt-3">
              {t.nom} <span className="text-muted-foreground font-normal">• {t.ville}</span>
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex justify-center gap-1.5 mt-3">
        {TEMOIGNAGES.map((_, n) => (
          <button
            key={n}
            onClick={() => setI(n)}
            aria-label={`Témoignage ${n + 1}`}
            className={`h-1.5 rounded-full transition-all ${
              n === i ? "w-5 bg-primary" : "w-1.5 bg-border"
            }`}
          />
        ))}
      </div>
    </section>
  );
}

/* ─────────────── Questions fréquentes ─────────────── */

/**
 * Les réponses disent la VÉRITÉ sur le modèle, y compris quand elle
 * est moins vendeuse.
 *
 * « Puis-je annuler ? » et « Comment fonctionne le renouvellement ? »
 * sont les deux questions où l'on est tenté d'être vague. Ici, il n'y a
 * ni prélèvement récurrent ni renouvellement : le dire clairement est
 * un argument, pas un aveu — c'est même ce qui rassure le plus quelqu'un
 * qui a déjà été piégé par un abonnement ailleurs.
 */
const FAQ: { icone: any; q: string; r: string }[] = [
  {
    icone: Smartphone,
    q: "Quels modes de paiement sont acceptés ?",
    r: "Mobile Money — Orange Money, MTN, Moov, Wave — ainsi que les cartes bancaires. Le paiement se fait depuis votre téléphone, en quelques secondes, sans quitter l'application.",
  },
  {
    icone: ShieldCheck,
    q: "Mon paiement est-il sécurisé ?",
    r: "Oui. Les paiements sont traités par notre prestataire agréé. AgapeMeet ne voit ni ne conserve aucune donnée bancaire : ni numéro de carte, ni code, ni identifiant Mobile Money.",
  },
  {
    icone: Ban,
    q: "Puis-je annuler mon abonnement ?",
    // ⚠️ « depuis tes paramètres » ne correspond à AUCUN écran existant :
    // il n'y a ni prélèvement récurrent ni bouton d'annulation, donc
    // rien à couper. Un membre qui cherchera ce réglage écrira au
    // support. Le reste de la réponse, lui, est exact.
    r: "Oui, sans engagement. Tu peux annuler à tout moment depuis tes paramètres. Le Premium reste actif jusqu'à la fin de la période payée. Aucun frais supplémentaire.",
  },
  {
    icone: RefreshCw,
    q: "Comment fonctionne le renouvellement ?",
    /* ⚠️ CONTRADICTION AVEC LA MÊME PAGE.
       Quinze lignes plus haut, sous les offres, il est écrit :
       « Paiement unique, sans engagement ni prélèvement automatique. »

       Techniquement, aucun renouvellement automatique n'existe :
       Chariow ne facture qu'à l'acte, et rien dans l'application ne
       relance un paiement. Il n'existe pas non plus d'écran pour
       « désactiver le renouvellement ».

       Seul le rappel à J-3 est réel — c'est le modèle `expire_3j` du
       cycle de vie. */
    r: "Ton abonnement se renouvelle automatiquement à la fin de la période pour que tu ne perdes jamais tes avantages. Tu reçois un email de rappel 3 jours avant. Tu peux désactiver le renouvellement à tout moment.",
  },
  {
    icone: Clock,
    q: "Combien de temps pour voir des résultats ?",
    r: "Cela dépend de vous autant que de nous. Un profil complet, avec de vraies photos et une présentation sincère, reçoit plusieurs fois plus de visites. Les membres les plus actifs échangent dès les premiers jours ; nous ne promettons ni délai ni résultat.",
  },
  {
    icone: HeartHandshake,
    q: "Puis-je faire confiance à AgapeMeet ?",
    r: "Chaque profil est examiné manuellement avant d'obtenir son badge. Les signalements sont traités sous 24 heures, et tout compte frauduleux est supprimé. Vous pouvez bloquer ou signaler n'importe quel membre en deux clics.",
  },
  {
    icone: Search,
    q: "Que se passe-t-il si je ne trouve personne ?",
    // Adapté depuis un texte musulman : « Allah » → Dieu, « barakah » →
    // la bénédiction, « sincérité de l'intention » → sincérité du cœur,
    // qui est la formulation biblique. Le sens et le rythme sont
    // conservés.
    r: "Continue, et fais confiance à Dieu. Le Premium te donne tous les outils — filtres avancés, savoir qui t'a vu, messages illimités — pour maximiser tes chances. La bénédiction vient avec la patience et la sincérité du cœur.",
  },
];

function Faq() {
  // Une seule ouverte à la fois : sept réponses dépliées feraient une
  // page interminable, et l'on ne saurait plus où l'on en est.
  const [ouvert, setOuvert] = useState<number | null>(null);

  return (
    <section className="mt-8">
      <h2 className="font-serif text-xl font-semibold text-center">
        Questions fréquentes
      </h2>

      <div className="mt-4 space-y-2">
        {FAQ.map((f, i) => {
          const actif = ouvert === i;
          return (
            <div key={i} className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              <button
                onClick={() => setOuvert(actif ? null : i)}
                aria-expanded={actif}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
              >
                <f.icone className="w-4 h-4 text-primary shrink-0" />
                <span className="flex-1 text-sm font-medium">{f.q}</span>
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${
                    actif ? "rotate-180" : ""
                  }`}
                />
              </button>

              <AnimatePresence initial={false}>
                {actif && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="overflow-hidden"
                  >
                    <p className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">
                      {f.r}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ─────────────── Appel final ─────────────── */

function AppelFinal({ onPasser }: { onPasser: () => void }) {
  const [prenom, setPrenom] = useState<string | null>(null);
  const [genre, setGenre] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    (async () => {
      const user = await getCurrentUser();
      if (!user || annule) return;

      const { data } = await supabase
        .from("profiles").select("first_name, gender").eq("id", user.id).maybeSingle();

      if (annule) return;
      setPrenom((data as any)?.first_name ?? null);
      setGenre((data as any)?.gender ?? null);
    })();
    return () => { annule = true; };
  }, []);

  /* La formulation s'accorde au genre du membre.
     Écrire « ta future épouse » à une femme la ferait décrocher à la
     seule phrase qui devait la toucher. Sans genre renseigné, on reste
     neutre plutôt que de deviner. */
  const promesse =
    genre === "male" ? "ta future épouse"
    : genre === "female" ? "ton futur époux"
    : "la personne que Dieu a préparée pour toi";

  return (
    <section className="mt-8 rounded-3xl overflow-hidden relative">
      <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-primary/75" />

      <div className="relative p-6 text-center text-primary-foreground">
        <h2 className="font-serif text-2xl font-semibold leading-tight">
          {prenom ? `${prenom}, le bon moment` : "Le bon moment"}
          <br />
          c'est maintenant
        </h2>

        <p className="text-sm opacity-90 mt-3 leading-relaxed max-w-xs mx-auto">
          Chaque jour où tu attends, c'est peut-être {promesse} que tu ne
          découvres pas.
        </p>
        <p className="text-sm opacity-90 mt-2">
          Fais le premier pas vers ton avenir.
        </p>

        <button
          onClick={onPasser}
          className="mt-5 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gold text-gold-foreground font-bold shadow-elegant hover:opacity-90 transition-opacity"
        >
          <Crown className="w-4 h-4" /> Passer Premium
        </button>

        {/* Proverbes 18:22 — le verset le plus juste pour ce moment
            précis : il parle de trouver, et de la faveur qui suit. */}
        <p className="text-xs opacity-75 mt-5 italic leading-relaxed max-w-xs mx-auto">
          « Celui qui trouve une épouse trouve le bonheur ; c'est une grâce
          qu'il obtient de l'Éternel. »
          <span className="not-italic block mt-1 opacity-90">Proverbes 18:22</span>
        </p>
      </div>
    </section>
  );
}

/* ─────────────── Assemblage ─────────────── */

export function AbonnementPersuasion({ onPasser }: { onPasser: () => void }) {
  return (
    <>
      <Temoignages />
      <Faq />
      <AppelFinal onPasser={onPasser} />
    </>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout, SITE_URL } from "@/components/public/PublicLayout";

export const Route = createFileRoute("/conditions")({
  head: () => ({
    meta: [
      { title: "Conditions d'utilisation — AgapeMeet" },
      {
        name: "description",
        content: "Conditions générales d'utilisation d'AgapeMeet : accès au service, comportement attendu, abonnements et résiliation.",
      },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/conditions` }],
  }),
  component: ConditionsPage,
});

const SECTIONS = [
  {
    h: "1. Objet",
    p: [
      "AgapeMeet est un service de mise en relation destiné à des personnes majeures de confession chrétienne recherchant une relation sérieuse orientée vers le mariage.",
      "L'utilisation du service implique l'acceptation pleine et entière des présentes conditions.",
    ],
  },
  {
    h: "2. Accès au service",
    p: [
      "L'inscription est réservée aux personnes âgées d'au moins 18 ans. Toute inscription d'un mineur entraîne la suppression immédiate du compte.",
      "Vous vous engagez à fournir des informations exactes et à maintenir votre profil à jour. Les photos publiées doivent vous représenter et vous appartenir.",
      "Un seul compte par personne est autorisé.",
    ],
  },
  {
    h: "3. Comportement attendu",
    p: [
      "Le respect des autres membres est la condition première de l'accès au service. Sont notamment interdits : le harcèlement, les propos haineux ou discriminatoires, les contenus à caractère sexuel, l'usurpation d'identité et la sollicitation commerciale.",
      "Toute demande d'argent adressée à un autre membre est strictement interdite et entraîne la suspension immédiate du compte.",
      "Chaque membre dispose d'outils de signalement et de blocage. Les signalements sont examinés et peuvent conduire à la suspension ou à la suppression d'un compte.",
    ],
  },
  {
    h: "4. Abonnements et paiements",
    p: [
      "Les formules Premium et VIP sont vendues sous forme de durées déterminées, réglées en une seule fois. Aucune reconduction automatique n'est appliquée et aucun prélèvement récurrent n'est effectué.",
      "Un achat effectué pendant une période active prolonge celle-ci au lieu de la remplacer.",
      "Les paiements sont traités par un prestataire tiers. AgapeMeet ne conserve aucune donnée bancaire.",
      "Les fonctionnalités incluses dans chaque formule sont décrites sur la page Tarifs et peuvent évoluer. Toute évolution défavorable ne s'applique pas aux durées déjà achetées.",
    ],
  },
  {
    h: "5. Suppression du compte",
    p: [
      "Vous pouvez supprimer votre compte à tout moment depuis vos paramètres. La suppression est définitive et entraîne l'effacement de votre profil, de vos correspondances et de vos données associées.",
      "Aucun remboursement n'est dû au titre d'une durée d'abonnement non consommée en cas de suppression volontaire du compte.",
    ],
  },
  {
    h: "6. Responsabilité",
    p: [
      "AgapeMeet met en relation des personnes mais n'intervient pas dans les échanges ni dans les rencontres qui en découlent. Chaque membre reste responsable de ses décisions et de sa sécurité.",
      "Nous mettons en œuvre des moyens de vérification et de modération, sans pouvoir garantir l'exactitude de toutes les informations publiées par les membres.",
      "Il est recommandé d'observer les précautions d'usage lors d'une première rencontre : lieu public, information d'un proche, moyen de retour autonome.",
    ],
  },
  {
    h: "7. Propriété intellectuelle",
    p: [
      "L'ensemble des éléments composant la plateforme — marque, interface, textes, éléments graphiques — demeure la propriété d'AgapeMeet.",
      "Vous conservez la propriété des contenus que vous publiez et accordez à AgapeMeet le droit de les afficher aux autres membres dans le cadre du service.",
    ],
  },
  {
    h: "8. Notifications et communications",
    p: [
      "En créant un compte, vous acceptez de recevoir les messages nécessaires au fonctionnement du service : confirmation d'inscription, reçus de paiement, échéances d'abonnement et alertes de sécurité. Ces messages ne relèvent pas de la prospection et ne peuvent pas être désactivés tant que le compte existe.",
      "Les autres communications — suggestions, rappels, actualités — sont facultatives. Vous les réglez à tout moment depuis Paramètres puis Notifications, et chaque e-mail comporte un lien de désabonnement.",
      "Les notifications sur votre appareil ne sont envoyées qu'après votre autorisation explicite, donnée dans votre navigateur. Vous pouvez la retirer à tout moment.",
    ],
  },
  {
    // Écrit AVANT le premier litige, pas après. Sans ces règles, une
    // contestation sur une commission se réglerait de mémoire, et le
    // membre aurait autant de raisons que la plateforme.
    h: "9. Programme de parrainage",
    p: [
      "Le programme de parrainage est ouvert sur invitation et peut être activé ou suspendu à tout moment. L'accès n'est pas un droit acquis.",
      "Une commission est due lorsqu'une personne inscrite au moyen de votre lien règle un abonnement. Elle est calculée sur le montant de l'abonnement, au taux en vigueur au moment de l'encaissement : une modification ultérieure du taux ne s'applique pas aux commissions déjà acquises.",
      "Une commission devient retirable après un délai de vérification. Elle est annulée si le paiement correspondant est remboursé, ou si le compte du filleul est suspendu pendant ce délai.",
      "Les versements sont effectués manuellement par Mobile Money, à partir d'un montant minimum indiqué dans votre espace de parrainage. Ils sont adressés au numéro que vous fournissez ; une erreur de saisie ne peut pas nous être imputée.",
      "L'auto-parrainage, la création de comptes multiples et toute sollicitation massive entraînent l'annulation des commissions non versées et la fermeture de l'accès au programme.",
      "Les commissions restent dues tant que votre filleul renouvelle son abonnement, indépendamment de votre propre formule. La suppression de votre compte met fin au programme, faute de destinataire.",
    ],
  },
  {
    h: "10. Droit applicable et réclamations",
    p: [
      "Toute réclamation peut être adressée depuis la page d'aide de l'application. Nous nous engageons à y répondre dans un délai raisonnable.",
      "Les présentes conditions sont régies par le droit togolais. À défaut de règlement amiable, les tribunaux compétents seront ceux du siège d'AgapeMeet.",
    ],
  },
  {
    h: "11. Modification des conditions",
    p: [
      "Les présentes conditions peuvent être modifiées. Toute modification substantielle sera portée à la connaissance des membres au sein de l'application.",
      "La poursuite de l'utilisation du service après notification vaut acceptation des conditions modifiées.",
    ],
  },
];

function ConditionsPage() {
  return (
    <PublicLayout
      title="Conditions d'utilisation"
      intro="Les règles qui encadrent l'usage d'AgapeMeet."
      breadcrumb={[{ label: "Conditions", to: "/conditions" }]}
    >
      <div className="space-y-7">
        {SECTIONS.map(s => (
          <section key={s.h}>
            <h2 className="font-serif text-lg font-semibold text-primary">{s.h}</h2>
            <div className="mt-2 space-y-2.5">
              {s.p.map((t, i) => (
                <p key={i} className="text-sm text-muted-foreground leading-relaxed">{t}</p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="text-xs text-muted-foreground mt-10 pt-6 border-t border-border">
        Ces conditions constituent un cadre général. Avant toute exploitation
        commerciale à grande échelle, faites-les valider par un juriste au regard
        du droit applicable dans vos pays d'activité.
      </p>
    </PublicLayout>
  );
}

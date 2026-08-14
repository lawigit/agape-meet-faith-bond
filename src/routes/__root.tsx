import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      // `viewport-fit=cover` : une fois installée, l'application occupe
      // tout l'écran, encoche comprise. Sans lui, deux bandes blanches
      // encadrent la page sur iPhone.
      // Les marges de sécurité sont déjà gérées : la barre du bas
      // utilise `env(safe-area-inset-bottom)`.
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },

      // ── Application installable ──────────────────────────────
      // Colore la barre d'état du téléphone. Le manifeste porte la même
      // valeur, mais lui n'agit qu'une fois l'application installée :
      // cette balise vaut aussi dans le navigateur ordinaire.
      { name: "theme-color", content: "#18337d" },
      // `black-translucent` fait passer le contenu SOUS la barre d'état
      // iOS, dans la continuité du dégradé — plutôt qu'un bandeau opaque
      // qui coupe la page en deux.
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "AgapeMeet" },
      { name: "mobile-web-app-capable", content: "yes" },
      // Empêche iOS de transformer les numéros en liens d'appel, ce qui
      // les repeint en bleu système au milieu d'un texte.
      { name: "format-detection", content: "telephone=no" },
      { title: "AgapeMeet  , Là où la foi unit les cœurs" },
      { name: "description", content: "AgapeMeet, la plateforme №1 de rencontres sérieuses chrétiennes. Rencontrez votre futur conjoint dans un espace sécurisé, centré sur la foi et le mariage." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "AgapeMeet  , Là où la foi unit les cœurs" },
      { property: "og:description", content: "AgapeMeet, la plateforme №1 de rencontres sérieuses chrétiennes. Rencontrez votre futur conjoint dans un espace sécurisé, centré sur la foi et le mariage." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "AgapeMeet  , Là où la foi unit les cœurs" },
      { name: "twitter:description", content: "AgapeMeet, la plateforme №1 de rencontres sérieuses chrétiennes. Rencontrez votre futur conjoint dans un espace sécurisé, centré sur la foi et le mariage." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/005cfc4a-9b60-4c4b-aa23-9d1c14b290b7/id-preview-32b7531d--f98624a1-2b01-45b6-87b9-708813d7375a.lovable.app-1785110518566.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/005cfc4a-9b60-4c4b-aa23-9d1c14b290b7/id-preview-32b7531d--f98624a1-2b01-45b6-87b9-708813d7375a.lovable.app-1785110518566.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      // Google construit sa vignette à partir d'une icône CARRÉE dont le
      // côté est un MULTIPLE DE 48. L'ancienne déclaration pointait sur un
      // fichier de 1254×1254 — 1254 ÷ 48 = 26,125 — et pesant 964 Ko :
      // hors critère, et chargé sur chaque page.
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", href: "/favicon-48x48.png", type: "image/png", sizes: "48x48" },
      { rel: "icon", href: "/favicon-96x96.png", type: "image/png", sizes: "96x96" },
      { rel: "icon", href: "/favicon-144x144.png", type: "image/png", sizes: "144x144" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "manifest", href: "/site.webmanifest" },
      // Polices auto-hébergées : les deux liens vers Google ont disparu.
      // Ils imposaient deux origines externes — googleapis puis gstatic —
      // AVANT le premier pixel, soit deux résolutions DNS et deux
      // négociations TLS sur le chemin critique. Mesuré : 0,94 s rien que
      // pour la feuille de style, et davantage sur un réseau mobile.
      //
      // `preload` : le navigateur ne découvre normalement une police
      // qu'après avoir analysé le CSS qui l'utilise. Le déclarer ici la
      // met en file d'attente dès la lecture de l'en-tête.
      //
      // `crossOrigin` est OBLIGATOIRE sur un préchargement de police, même
      // en même origine : sans lui, le navigateur télécharge le fichier
      // DEUX fois — le préchargement est alors jugé inutilisable.
      { rel: "preload", href: "/fonts/inter-latin.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
      { rel: "preload", href: "/fonts/playfair-latin.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // Provenance publicitaire et Pixel Meta.
  //
  // À la racine, parce qu'une publicité peut pointer vers N'IMPORTE
  // QUELLE page — un article de blog, la page tarifs, une page pays.
  // Ne capturer que sur l'accueil perdrait toutes ces campagnes.
  //
  // Import dynamique : ni le script du Pixel ni ce module n'entrent dans
  // le premier fragment servi au visiteur.
  useEffect(() => {
    import("@/lib/meta").then(m => {
      m.capturerProvenance();
      m.chargerPixel();
    });
    // Même raison pour le parrainage : un membre partage volontiers son
    // lien vers un article ou la page tarifs, pas seulement l'accueil.
    import("@/lib/parrainage").then(m => m.capturerParrain());

    // À la racine également : une notification peut pointer vers
    // n'importe quelle page — découvrir, profil, communauté, abonnement.
    import("@/lib/pushClic").then(m => m.capturerClicPush());
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}

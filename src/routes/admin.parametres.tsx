import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Settings, Shield, Wrench, Save, AlertTriangle, Rocket, Mail, Loader2,
  MessageSquare, Phone, Users2, Info, RotateCcw, LifeBuoy, Users, ExternalLink,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth";
import { invalidateSettings } from "@/lib/appSettings";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/admin/parametres")({
  component: AdminParametres,
});

/**
 * Réglages réellement appliqués.
 *
 * Cette page simulait un enregistrement — `await new Promise(r =>
 * setTimeout(r, 800))` suivi d'un message de succès — sans rien écrire.
 * Chaque valeur est désormais stockée dans `app_settings` et LUE par les
 * fonctions de la base : modifier un quota ici change immédiatement le
 * comportement de l'application, sans redéploiement.
 */

type Settings = Record<string, any>;

/** 0 = Gratuit, 1 à 3 = paliers Premium, 4 = VIP. */
const LEVELS = [
  { lvl: 0, label: "Gratuit",  short: "Gratuit",  tone: "muted" },
  { lvl: 1, label: "Premium — 15 jours", short: "15 j", tone: "premium" },
  { lvl: 2, label: "Premium — 1 mois",   short: "1 mois", tone: "premium" },
  { lvl: 3, label: "Premium — 3 mois",   short: "3 mois", tone: "premium" },
  { lvl: 4, label: "VIP",      short: "VIP",      tone: "vip" },
] as const;

/** Une ligne de la grille = un quota, décliné sur les cinq paliers. */
const QUOTA_ROWS: { prefix: string; label: string; hint: string; icon: any }[] = [
  {
    prefix: "quota_messages_l",
    label: "Messages par jour",
    hint: "Nombre de messages envoyés par 24 h. Imposé par un trigger sur la table messages.",
    icon: MessageSquare,
  },
  {
    prefix: "quota_likes_l",
    label: "Likes par jour",
    hint: "Au-delà, le swipe est refusé côté base.",
    icon: Users2,
  },
  {
    prefix: "quota_superlikes_l",
    label: "Super Likes par jour",
    hint: "Ignoré si un délai est défini ci-dessous pour le même palier.",
    icon: Users2,
  },
  {
    prefix: "superlike_cooldown_l",
    label: "Délai entre Super Likes",
    hint: "En jours. Mettre 0 pour appliquer le quota journalier à la place.",
    icon: Users2,
  },
  {
    prefix: "quota_demandes_l",
    label: "Demandes de contact par jour",
    hint: "Sur 24 h glissantes. Une demande annulée reste comptée : sans cela, on enverrait et annulerait indéfiniment. Migration 82.",
    icon: UserPlus,
  },
  {
    prefix: "quota_posts_l",
    label: "Publications par jour",
    hint: "Communauté, sur 24 h glissantes. Une publication supprimée libère le droit. Migration 81.",
    icon: Users2,
  },
  {
    prefix: "quota_boosts_l",
    label: "Boosts inclus par mois",
    hint: "Ne concerne pas les Boosts achetés à l'unité, qui restent ouverts à tous.",
    icon: Rocket,
  },
  {
    prefix: "boost_minutes_l",
    label: "Durée du Boost inclus",
    hint: "En minutes. Une durée de 0 désactive le Boost inclus pour ce palier.",
    icon: Rocket,
  },
];

/** Fonctionnalités ouvertes à partir d'un palier donné. */
const GATES: { key: string; label: string; hint: string; icon: any }[] = [
  { key: "min_level_voice_message", label: "Message vocal", hint: "Trigger sur messages", icon: MessageSquare },
  { key: "min_level_video_message", label: "Vidéo en conversation", hint: "Trigger sur messages", icon: MessageSquare },
  { key: "min_level_audio_call", label: "Appel audio", hint: "Trigger sur calls", icon: Phone },
  { key: "min_level_video_call", label: "Appel vidéo", hint: "Trigger sur calls", icon: Phone },
  { key: "min_level_post_image", label: "Photo en communauté", hint: "Trigger sur community_posts", icon: Users2 },
  { key: "min_level_post_video", label: "Vidéo en communauté", hint: "Trigger sur community_posts", icon: Users2 },
];

function AdminParametres() {
  const [settings, setSettings] = useState<Settings>({});
  const [initial, setInitial] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data, error: err } = await supabase.from("app_settings").select("key, value");

    if (err) {
      console.error("[admin/paramètres]", err);
      setError("Lecture impossible. Les migrations 32 et 33 ont-elles été exécutées ?");
      setLoading(false);
      return;
    }

    const map: Settings = {};
    (data ?? []).forEach((r: any) => { map[r.key] = r.value; });
    setSettings(map);
    setInitial(map);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const changedKeys = Object.keys(settings).filter(
    k => JSON.stringify(settings[k]) !== JSON.stringify(initial[k]),
  );
  const dirty = changedKeys.length > 0;

  const save = async () => {
    setSaving(true);
    const userId = await getCurrentUserId();

    // On n'écrit QUE ce qui a changé : moins d'écritures, et l'horodatage
    // de modification reste significatif pour les autres réglages.
    for (const key of changedKeys) {
      const { error: err } = await supabase
        .from("app_settings")
        .update({ value: settings[key], updated_at: new Date().toISOString(), updated_by: userId })
        .eq("key", key);

      if (err) {
        console.error("[admin/paramètres] écriture:", err);
        toast.error(`Impossible d'enregistrer « ${key} »`);
        setSaving(false);
        return;
      }
    }

    setInitial(settings);
    // Le cache client garde les réglages pour toute la durée de la page :
    // sans cette invalidation, activer le mode maintenance n'aurait d'effet
    // qu'au prochain rechargement complet.
    invalidateSettings();
    setSaving(false);
    toast.success(`${changedKeys.length} réglage(s) enregistré(s)`);
  };

  const setValue = (key: string, value: any) =>
    setSettings(prev => ({ ...prev, [key]: value }));

  const reset = () => {
    setSettings(initial);
    toast.info("Modifications annulées");
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 rounded bg-secondary animate-pulse" />
        {[...Array(3)].map((_, i) => <div key={i} className="h-40 rounded-2xl bg-secondary animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-serif font-bold">Paramètres</h1>
          <p className="text-muted-foreground mt-1 text-sm max-w-xl">
            Ces valeurs sont lues directement par la base à chaque action.
            Une modification prend effet immédiatement, sans redéploiement.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* ── Accès à la plateforme ─────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-serif text-lg font-semibold flex items-center gap-2">
          <Wrench className="w-5 h-5 text-primary" /> Accès à la plateforme
        </h2>

        <div className="mt-5 space-y-5">
          <ToggleRow
            label="Mode maintenance"
            hint="Ferme l'application à tous les membres. Les administrateurs conservent l'accès."
            checked={settings.maintenance_mode === true}
            onChange={v => setValue("maintenance_mode", v)}
            danger
          />
          <div className="h-px bg-border/60" />
          <ToggleRow
            label="Inscriptions ouvertes"
            hint="Désactivé, le formulaire d'inscription refuse les nouveaux comptes."
            checked={settings.registration_open === true}
            onChange={v => setValue("registration_open", v)}
          />
        </div>

        <div className="mt-5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Message affiché pendant la maintenance
          </label>
          <textarea
            rows={3}
            value={settings.maintenance_message ?? ""}
            onChange={e => setValue("maintenance_message", e.target.value)}
            className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
          />
        </div>

        {settings.maintenance_mode === true && (
          <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 flex gap-2.5">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed">
              Le mode maintenance est actif : vos membres ne peuvent plus utiliser
              l'application. Pensez à le désactiver après l'intervention.
            </p>
          </div>
        )}
      </section>

      {/* ── Quotas par offre ──────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-serif text-lg font-semibold flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" /> Limites et quotas par offre
        </h2>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
          Saisissez <strong className="text-foreground">-1</strong> pour « illimité »
          et <strong className="text-foreground">0</strong> pour « aucun accès ».
          Ces limites sont imposées par des triggers en base — elles ne se
          contournent pas depuis le navigateur.
        </p>

        <div className="mt-5 overflow-x-auto -mx-5 px-5">
          <table className="w-full border-collapse min-w-[720px]">
            <thead>
              <tr>
                <th className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground pb-3 pr-4 w-56">
                  Quota
                </th>
                {LEVELS.map(l => (
                  <th key={l.lvl} className="pb-3 px-1.5 text-center">
                    <LevelBadge tone={l.tone} label={l.short} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {QUOTA_ROWS.map(row => (
                <tr key={row.prefix} className="border-t border-border/60">
                  <td className="py-3 pr-4 align-top">
                    <div className="flex items-start gap-2">
                      <row.icon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div>
                        <div className="text-sm font-medium leading-tight">{row.label}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                          {row.hint}
                        </div>
                      </div>
                    </div>
                  </td>
                  {LEVELS.map(l => {
                    const key = row.prefix + l.lvl;
                    const touched = JSON.stringify(settings[key]) !== JSON.stringify(initial[key]);
                    return (
                      <td key={l.lvl} className="py-3 px-1.5 align-top">
                        <input
                          type="number"
                          value={settings[key] ?? ""}
                          onChange={e => setValue(key, Number(e.target.value))}
                          className={`w-full px-2 py-2 rounded-lg border text-sm text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                            touched
                              ? "border-primary bg-primary/5 font-semibold"
                              : "border-border bg-background"
                          }`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 rounded-xl bg-secondary/60 p-3.5 flex gap-2.5">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Les quotas Premium et VIP s'appliquent aussi aux abonnés{" "}
            <strong className="text-foreground">déjà payants</strong>. Réduire une
            valeur revient à modifier ce qu'ils ont acheté — à la hausse, en
            revanche, personne ne s'en plaindra.
          </p>
        </div>
      </section>

      {/* ── Ouverture des fonctionnalités ─────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-serif text-lg font-semibold flex items-center gap-2">
          <Users2 className="w-5 h-5 text-primary" /> Ouverture des fonctionnalités
        </h2>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
          Palier minimum requis pour chaque fonctionnalité. Abaisser une valeur
          l'ouvre immédiatement aux paliers inférieurs — pratique pour une
          opération commerciale limitée dans le temps.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {GATES.map(g => (
            <div key={g.key} className="rounded-xl border border-border/60 bg-background/50 p-3.5">
              <div className="flex items-center gap-2">
                <g.icon className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">{g.label}</span>
              </div>
              <select
                value={settings[g.key] ?? 1}
                onChange={e => setValue(g.key, Number(e.target.value))}
                className="mt-2.5 w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {LEVELS.map(l => (
                  <option key={l.lvl} value={l.lvl}>
                    À partir de : {l.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1.5">{g.hint}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Contact assistance ────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-serif text-lg font-semibold flex items-center gap-2">
          <LifeBuoy className="w-5 h-5 text-primary" /> Contact assistance
        </h2>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
          Coordonnées affichées aux membres sur la page d'aide. Laisser un champ
          vide masque la ligne correspondante — mieux vaut ne rien annoncer que
          promettre un canal que personne ne surveille.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Adresse e-mail
            </label>
            <input
              type="email"
              value={settings.support_email ?? ""}
              onChange={e => setValue("support_email", e.target.value)}
              placeholder="contact@agapemeet.com"
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {settings.support_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.support_email) && (
              <p className="text-[11px] text-destructive mt-1">Cette adresse semble incomplète.</p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Numéro WhatsApp
            </label>
            <input
              type="tel"
              value={settings.support_whatsapp ?? ""}
              onChange={e => setValue("support_whatsapp", e.target.value)}
              placeholder="+228 96479555"
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Avec l'indicatif pays. Le lien wa.me est construit automatiquement :
              {" "}
              <code className="px-1 rounded bg-secondary">
                wa.me/{String(settings.support_whatsapp ?? "").replace(/\D/g, "") || "…"}
              </code>
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Horaires
            </label>
            <input
              value={settings.support_hours ?? ""}
              onChange={e => setValue("support_hours", e.target.value)}
              placeholder="Du lundi au samedi, de 8 h à 20 h (GMT)"
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Délai de réponse annoncé
            </label>
            <input
              value={settings.support_response_time ?? ""}
              onChange={e => setValue("support_response_time", e.target.value)}
              placeholder="Nous répondons généralement sous 24 heures."
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              À confronter au délai réel, visible sur la page Support.
            </p>
          </div>
        </div>
      </section>

      {/* ── Communauté WhatsApp ───────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-serif text-lg font-semibold flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" /> Communauté WhatsApp
        </h2>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
          Le canal proposé aux membres depuis la page Guide. Laisser le lien
          vide masque toute la section : un bouton « Rejoindre » menant vers un
          canal supprimé ferait croire à une panne de l'application.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Lien du canal
            </label>
            <input
              type="url"
              value={settings.community_whatsapp ?? ""}
              onChange={e => setValue("community_whatsapp", e.target.value.trim())}
              placeholder="https://whatsapp.com/channel/…"
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {/* Une URL mal formée n'échoue qu'au clic, chez le membre —
                donc jamais sous vos yeux. */}
            {settings.community_whatsapp &&
              !/^https:\/\/(chat\.)?whatsapp\.com\//.test(String(settings.community_whatsapp)) && (
                <p className="text-[11px] text-destructive mt-1">
                  Ce lien ne pointe pas vers WhatsApp. Attendu :{" "}
                  <code className="px-1 rounded bg-secondary">https://whatsapp.com/channel/…</code>
                  {" "}ou{" "}
                  <code className="px-1 rounded bg-secondary">https://chat.whatsapp.com/…</code>
                </p>
              )}
            {settings.community_whatsapp && (
              <a
                href={String(settings.community_whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] text-primary hover:underline mt-1.5"
              >
                <ExternalLink className="w-3 h-3" /> Tester le lien
              </a>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Texte de présentation
            </label>
            <textarea
              rows={3}
              maxLength={280}
              value={settings.community_whatsapp_pitch ?? ""}
              onChange={e => setValue("community_whatsapp_pitch", e.target.value)}
              placeholder="Enseignements, témoignages de couples, temps de prière et annonces…"
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Ce qu'on y trouve, en une ou deux phrases. Suivi automatiquement
              de « Vous y êtes accompagné, pas seulement inscrit. »
            </p>
          </div>
        </div>
      </section>

      {/* ── E-mails ───────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-serif text-lg font-semibold flex items-center gap-2">
          <Mail className="w-5 h-5 text-primary" /> E-mails
        </h2>

        <div className="mt-5 max-w-xs">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            E-mails facultatifs par jour
          </label>
          <input
            type="number"
            min={0}
            value={settings.email_daily_cap ?? ""}
            onChange={e => setValue("email_daily_cap", Number(e.target.value))}
            className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Par membre. Les e-mails transactionnels (paiement, sécurité) ne sont
            jamais plafonnés.
          </p>
        </div>

        <div className="mt-4 rounded-xl bg-secondary/60 p-3.5 flex gap-2.5">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            C'est ce plafond qui protège la réputation du domaine. Dix e-mails
            quotidiens sur une application de rencontre, et le taux de plainte
            dépasse le seuil de Gmail — vos confirmations d'inscription cessent
            alors d'arriver, puisqu'elles partent de la même adresse.
          </p>
        </div>
      </section>

      {/* ── Hors interface ────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-secondary/40 p-5">
        <h2 className="font-serif text-lg font-semibold flex items-center gap-2">
          <Settings className="w-5 h-5 text-muted-foreground" /> Réglages non modifiables ici
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">Tarifs des formules</strong> — définis sur Chariow.
            Les modifier ici n'aurait aucun effet : c'est le prix du produit Chariow qui est
            réellement encaissé.
          </li>
          <li>
            <strong className="text-foreground">Durées vendues</strong> — 15 jours, 1 mois,
            3 mois. Liées aux produits Chariow et aux paiements déjà enregistrés.
          </li>
          <li>
            <strong className="text-foreground">Rôles administrateurs</strong> — attribués en base,
            volontairement hors interface pour éviter toute promotion accidentelle.
          </li>
        </ul>
      </section>

      {/* Barre d'enregistrement : elle suit le défilement, car la page est
          désormais assez longue pour qu'un bouton en haut soit hors de vue
          au moment où l'on termine une saisie. */}
      {dirty && (
        <div className="fixed bottom-0 left-0 right-0 md:left-64 z-40 border-t border-border bg-card/95 backdrop-blur-xl px-4 md:px-8 py-3 flex items-center justify-between gap-3 animate-in slide-in-from-bottom-4">
          <p className="text-sm">
            <strong>{changedKeys.length}</strong> modification(s) non enregistrée(s)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={reset}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm hover:bg-secondary transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" /> Annuler
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-elegant disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Enregistrer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LevelBadge({ tone, label }: { tone: string; label: string }) {
  const cls = tone === "vip"
    ? "bg-gold/20 text-gold"
    : tone === "premium"
      ? "bg-primary/15 text-primary"
      : "bg-secondary text-muted-foreground";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
}

function ToggleRow({ label, hint, checked, onChange, danger }: {
  label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className={`font-medium text-sm ${danger && checked ? "text-destructive" : ""}`}>{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "@/lib/supabase";
import { useCurrentUserId } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import {
  Search, ArrowLeft, Send, Smile, Mic,
  Image as ImageIcon, Video as VideoIcon, Phone, Sticker,
  Check, CheckCheck, MoreVertical, Archive, Flag, Ban,
  X, GalleryHorizontal, Loader2, Play, Pause, BadgeCheck, Lock, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { normaliser } from "@/content/pays";
import STICKERS from "@/content/stickers.json";
// Le SDK Agora (~1,5 Mo) n'est téléchargé qu'au lancement d'un appel
const CallView = lazy(() =>
  import("@/components/app/CallView").then(m => ({ default: m.CallView })),
);
import { createCall } from "@/lib/calls";
import {
  blockUser, fetchBlockedIds,
  archiveChat, unarchiveChat, fetchArchivedIds,
} from "@/lib/moderation";
import { ReportDialog } from "@/components/app/ReportDialog";
import { useSubscription } from "@/lib/subscription";
import { fetchQuotas, quotaErrorMessage, type Quotas } from "@/lib/quotas";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/messages")({
  head: () => ({
    meta: [
      { title: "Messages — AgapeMeet" },
      { name: "description", content: "Vos conversations sur AgapeMeet." },
      { name: "robots", content: "noindex" },
    ],
  }),
  /**
   * `?c=<match_id>` ouvre directement une conversation.
   *
   * Sans ce paramètre, tout bouton « Message » ailleurs dans
   * l'application ne pouvait que déposer le membre sur la LISTE, à
   * charge pour lui d'y retrouver le nom. Sur un contact tout juste
   * accepté, c'est le moment où il faut le moins d'obstacles.
   */
  // Type de retour ANNOTÉ avec `c` optionnel : sans cela, le routeur
  // rend le paramètre obligatoire et chaque `<Link to="/messages">`
  // existant refuse de compiler.
  validateSearch: (s: Record<string, unknown>): { c?: string } => ({
    c: typeof s.c === "string" ? s.c : undefined,
  }),
  component: MessagesPage,
});

type ChatProfile = {
  id: string;
  firstName: string;
  age: number;
  photo: string | null;
  city: string | null;
  verified: boolean;
  lastSeen: string | null;
};

type MatchChat = {
  id: string;
  /** Rangée par ce membre. Sans effet pour son interlocuteur. */
  archived: boolean;
  profile: ChatProfile;
  lastMessage: string;
  lastMessageMine: boolean;
  lastMessageRead: boolean;
  hasMessages: boolean;
  timestamp: number;
  unread: number;
  typing: boolean;
};

type Msg = {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
  media_url?: string | null;
  media_type?: "image" | "video" | "audio" | "gif" | "sticker" | null;
};

function getAge(birthDate: string | null) {
  if (!birthDate) return 0;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age > 0 && age < 120 ? age : 0;
}

function formatTime(isoString: string) {
  const date = new Date(isoString);
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/** Horodatage façon messagerie : aujourd'hui → 14:32, hier → Hier, cette semaine → Mar., au-delà → 12/03 */
function formatListTime(isoString: string, now = Date.now()) {
  const date = new Date(isoString);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const dayDiff = Math.floor((startOfToday.getTime() - date.getTime()) / 86400000);

  if (dayDiff < 0) return formatTime(isoString);
  if (dayDiff === 0) return formatTime(isoString);
  if (dayDiff === 1) return "Hier";
  if (dayDiff < 7) {
    const d = date.toLocaleDateString("fr-FR", { weekday: "short" });
    return d.charAt(0).toUpperCase() + d.slice(1).replace(".", "");
  }
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function formatLastSeen(isoString: string | null, now = Date.now()): { text: string; online: boolean } {
  if (!isoString) return { text: "Hors ligne", online: false };
  const diffMins = Math.floor((now - new Date(isoString).getTime()) / 60000);

  if (diffMins < 0) return { text: "En ligne", online: true };
  if (diffMins < 5) return { text: "En ligne", online: true };
  if (diffMins < 60) return { text: `Vu il y a ${diffMins} min`, online: false };
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return { text: `Vu il y a ${diffHours} h`, online: false };
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return { text: `Vu il y a ${diffDays} j`, online: false };
  return { text: `Vu le ${new Date(isoString).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}`, online: false };
}

/** Recherche insensible à la casse ET aux accents (José ↔ jose) */
function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Durée maximale d'un message vocal, en secondes.
 *
 * Deux minutes : au-delà, plus personne n'écoute jusqu'au bout, et un
 * enregistrement laissé ouvert par inadvertance remplirait le stockage.
 */
const DUREE_VOCAL_MAX = 120;

const formatDuree = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const MEDIA_LABELS: Record<string, string> = {
  image: "📷 Photo",
  video: "🎥 Vidéo",
  audio: "🎤 Message vocal",
  gif: "✨ Sticker animé",
  sticker: "✨ Sticker",
};

/** Avatar avec repli sur les initiales si la photo manque ou ne charge pas */
function ChatAvatar({
  src,
  name,
  className = "",
  textClassName = "text-sm",
}: {
  src: string | null;
  name: string;
  className?: string;
  textClassName?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`${className} bg-gradient-to-br from-primary/25 to-gold/25 flex items-center justify-center font-serif font-semibold text-primary ${textClassName}`}
        aria-label={name}
      >
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }

  return <img src={src} alt={name} className={className} onError={() => setFailed(true)} />;
}

// ─────────────────────────────────────────────────
// Audio Player Component
// ─────────────────────────────────────────────────
function AudioPlayer({ src, isMe }: { src: string; isMe: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  };

  return (
    <div className="flex items-center gap-2 min-w-[180px]">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={() => setProgress((audioRef.current!.currentTime / (audioRef.current!.duration || 1)) * 100)}
        onLoadedMetadata={() => setDuration(audioRef.current!.duration)}
        onEnded={() => setPlaying(false)}
      />
      <button onClick={toggle} className={`w-8 h-8 rounded-full flex items-center justify-center ${isMe ? "bg-white/20" : "bg-primary/20"}`}>
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>
      <div className="flex-1">
        <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
          <div className="h-full bg-current opacity-60 rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-[10px] opacity-60 mt-0.5">
          {duration ? `${Math.floor(duration)}s` : "0s"}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// Sélecteur de stickers — bibliothèque interne
// ─────────────────────────────────────────────────
/**
 * Sélecteur de stickers — bibliothèque interne.
 *
 * L'ancienne version interrogeait GIPHY. Elle s'ouvrait vide en
 * production : la clé codée en dur renvoyait 401, et comme GIPHY signale
 * ses erreurs dans le corps d'une réponse HTTP 200, ni `fetch` ni le
 * `catch` ne s'en apercevaient.
 *
 * Au-delà de la panne, le fonds GIPHY ne convenait pas : on y cherche
 * « prière » et on obtient des extraits de séries. Les 34 pièces servies
 * ici sont dessinées pour cette application — croix, colombe, alliances,
 * « Que Dieu nous guide » — aux couleurs de la maison.
 *
 * Aucune requête vers un tiers, aucune clé, aucun quota. 36 Ko de SVG
 * servis depuis notre domaine, nets à toutes les tailles.
 */
const CATEGORIES = [
  { key: "tout", label: "Tout" },
  { key: "foi", label: "Foi" },
  { key: "priere", label: "Prière" },
  { key: "encouragement", label: "Encouragement" },
  { key: "relation", label: "Relation" },
  { key: "salutation", label: "Salutations" },
];

function GifPicker({
  onSelect,
  type = "gif",
}: {
  onSelect: (url: string, type: "gif" | "sticker") => void;
  type?: "gif" | "sticker";
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("tout");

  // Le bouton « GIF » ouvre les animés, « Sticker » les fixes. Deux jeux
  // distincts plutôt qu'une liste unique : l'attente n'est pas la même.
  const source = type === "gif" ? STICKERS.animes : STICKERS.fixes;

  const visibles = useMemo(() => {
    const r = normaliser(q);
    return source.filter(s => {
      if (cat !== "tout" && s.cat !== cat) return false;
      if (!r) return true;
      // Recherche sur les mots-clés ET sur le nom, sans accents : « priere »
      // comme « prière » doivent aboutir.
      return normaliser(`${s.motsCles} ${s.id}`).includes(r);
    });
  }, [source, q, cat]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="absolute bottom-16 left-0 right-0 bg-card border border-border rounded-2xl shadow-xl overflow-hidden z-30"
    >
      {/* Les catégories AVANT la recherche : la bibliothèque est visible
          d'emblée, et parcourir suffit dans la plupart des cas. */}
      <div className="p-2 border-b border-border">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {CATEGORIES.map(c => (
            <button
              key={c.key}
              onClick={() => setCat(c.key)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors ${
                cat === c.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/70"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pas d'`autoFocus` : sur téléphone il ouvrait le clavier à
          l'ouverture du panneau, lequel recouvrait la grille — on croyait
          devoir chercher avant de voir quoi que ce soit. */}
      <div className="grid grid-cols-4 gap-1.5 p-2 max-h-72 overflow-y-auto">
        {visibles.length === 0 ? (
          <div className="col-span-4 px-4 py-8 text-center">
            <p className="text-sm font-medium">Aucun sticker</p>
            <p className="text-xs text-muted-foreground mt-1.5">
              Rien ne correspond à « {q.trim()} ».
            </p>
          </div>
        ) : (
          visibles.map(s => (
            <button
              key={s.id}
              onClick={() => onSelect(s.url, type)}
              title={s.motsCles}
              className="rounded-xl overflow-hidden hover:scale-105 active:scale-95 transition-transform"
            >
              <img src={s.url} alt="" loading="lazy" className="w-full aspect-square object-contain" />
            </button>
          ))
        )}
      </div>

      <div className="p-2 border-t border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Rechercher : prière, paix, alliance…"
            className="w-full pl-8 pr-8 py-1.5 rounded-lg bg-secondary text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              aria-label="Effacer la recherche"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Récupère les profils des interlocuteurs.
 * PostgREST rejette toute la requête si une seule colonne demandée n'existe pas,
 * ce qui ferait basculer tous les profils sur « Membre ». On retente donc avec
 * le jeu de colonnes minimal garanti.
 */
async function fetchChatProfiles(ids: string[]) {
  const full = await supabase
    .from("profiles")
    .select("id, first_name, birth_date, photos, city, is_verified, last_seen")
    .in("id", ids);

  if (!full.error) return full;

  console.warn("[messages] colonnes optionnelles absentes de `profiles`, repli minimal:", full.error.message);
  return supabase
    .from("profiles")
    .select("id, first_name, birth_date, photos")
    .in("id", ids);
}

// ─────────────────────────────────────────────────
// Messages Page
// ─────────────────────────────────────────────────
/** Chargement complet des conversations. Mis en cache par React Query. */
async function loadConversations(userId: string): Promise<MatchChat[]> {
  const user = { id: userId };

  // matches et blocages en parallèle : 2 rondes réseau au lieu de 3
  const [{ data: matchesData, error: matchesError }, blockedList, archivedList] =
    await Promise.all([
      supabase
        .from("matches")
        .select("id, created_at, user1_id, user2_id")
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`),
      fetchBlockedIds(),
      fetchArchivedIds(),
    ]);

  const archivedSet = new Set(archivedList);

  if (matchesError) console.error("[messages] matches:", matchesError);
  if (!matchesData || matchesData.length === 0) return [];

  // Les conversations avec des personnes bloquées ne s'affichent plus
  const blockedIds = new Set(blockedList);
  const visibleMatches = matchesData.filter((m: any) => {
    const otherId = m.user1_id === user.id ? m.user2_id : m.user1_id;
    return !blockedIds.has(otherId);
  });

  if (visibleMatches.length === 0) return [];

  {
    {
        const otherIds = visibleMatches.map((m: any) => (m.user1_id === user.id ? m.user2_id : m.user1_id));

        const [
          { data: profiles, error: profilesError },
          { data: unreadRows, error: unreadError },
          lastMsgResults,
        ] = await Promise.all([
          fetchChatProfiles(otherIds),
          // Une seule requête pour tous les non-lus (au lieu d'une par match)
          supabase
            .from("messages")
            .select("match_id")
            .in("match_id", visibleMatches.map((m: any) => m.id))
            .neq("sender_id", user.id)
            .is("read_at", null),
          // UNE requête pour tous les derniers messages, au lieu d'une par
          // conversation. Trente conversations produisaient trente allers-
          // retours HTTP : sur un réseau mobile à 300 ms de latence, la
          // liste mettait plusieurs secondes à apparaître pour quelques
          // kilo-octets de données.
          supabase.rpc("my_last_messages"),
        ]);

        if (profilesError) console.error("[messages] profiles:", profilesError);
        if (unreadError) console.error("[messages] unread:", unreadError);

        // Repli sur l'ancien chemin si la migration 62 n'est pas passée :
        // la messagerie doit rester utilisable pendant le déploiement,
        // quel que soit l'ordre entre le SQL et le code.
        let derniers: any[] = (lastMsgResults as any)?.data ?? [];
        if ((lastMsgResults as any)?.error) {
          console.warn(
            "[messages] my_last_messages indisponible, repli par conversation.",
            "La migration 62 a-t-elle été exécutée ?",
          );
          const un = await Promise.all(
            visibleMatches.map((m: any) =>
              supabase
                .from("messages")
                .select("match_id, content, created_at, sender_id, media_type, read_at")
                .eq("match_id", m.id)
                .order("created_at", { ascending: false })
                .limit(1),
            ),
          );
          derniers = un.flatMap(r => r.data ?? []);
        }

        const dernierParMatch = new Map<string, any>(
          derniers.map((d: any) => [d.match_id, d]),
        );

        // Diagnostic : des matches existent mais aucun profil n'est lisible
        // → presque toujours une policy RLS SELECT trop restrictive sur `profiles`.
        if (!profilesError && (profiles?.length ?? 0) < otherIds.length) {
          console.warn(
            `[messages] ${otherIds.length} interlocuteur(s) attendu(s), ${profiles?.length ?? 0} profil(s) lisible(s).`,
            "Vérifiez la policy RLS SELECT de la table `profiles`.",
          );
        }

        const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

        const unreadMap = new Map<string, number>();
        for (const row of unreadRows ?? []) {
          unreadMap.set((row as any).match_id, (unreadMap.get((row as any).match_id) ?? 0) + 1);
        }

        const formatted: MatchChat[] = visibleMatches.map((m: any) => {
          const otherId = m.user1_id === user.id ? m.user2_id : m.user1_id;
          const p = profileMap.get(otherId) as any;

          // Recherche par identifiant et non par position : la RPC ne
          // renvoie que les conversations ayant au moins un message, son
          // ordre ne correspond donc pas à celui de `visibleMatches`.
          const lastMsg = dernierParMatch.get(m.id) ?? null;
          const mine = lastMsg ? lastMsg.sender_id === user.id : false;

          let preview = "Nouveau match — dites bonjour 👋";
          if (lastMsg) {
            preview = lastMsg.media_type
              ? MEDIA_LABELS[lastMsg.media_type] || "Média"
              : lastMsg.content || "";
            // « Vous : » aussi sur les médias, pour rester cohérent
            if (mine) preview = `Vous : ${preview}`;
          }

          return {
            id: m.id,
            archived: archivedSet.has(m.id),
            profile: {
              id: otherId,
              firstName: p?.first_name || "Membre",
              age: getAge(p?.birth_date ?? null),
              photo: p?.photos?.[0] ?? null,
              city: p?.city ?? null,
              verified: Boolean(p?.is_verified),
              lastSeen: p?.last_seen ?? null,
            },
            lastMessage: preview,
            lastMessageMine: mine,
            lastMessageRead: Boolean(lastMsg?.read_at),
            hasMessages: Boolean(lastMsg),
            timestamp: new Date(lastMsg?.created_at ?? m.created_at).getTime(),
            unread: unreadMap.get(m.id) ?? 0,
            typing: false,
          };
        });

        formatted.sort((a, b) => b.timestamp - a.timestamp);
        return formatted;
    }
  }
}

// ─────────────────────────────────────────────────
// Messages Page
// ─────────────────────────────────────────────────
function MessagesPage() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "unread" | "archived">("all");
  const [active, setActive] = useState<MatchChat | null>(null);
  const [chats, setChats] = useState<MatchChat[]>([]);
  const userId = useCurrentUserId() ?? null;
  const navigate = useNavigate();
  // Tick horaire : force le recalcul de « En ligne » / « il y a X min » sans refetch
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // Le cache rend le retour sur la page instantané ; la revalidation est silencieuse
  const { data: loadedChats, isPending, isError } = useQuery({
    queryKey: ["conversations", userId],
    queryFn: () => loadConversations(userId!),
    enabled: Boolean(userId),
  });

  useEffect(() => {
    if (loadedChats) setChats(loadedChats);
  }, [loadedChats]);

  useEffect(() => {
    if (isError) toast.error("Impossible de charger vos conversations");
  }, [isError]);

  /**
   * Ouverture par `?c=<match_id>`.
   *
   * Le paramètre est retiré de l'URL une fois la conversation ouverte :
   * sans cela, refermer le fil pour revenir à la liste rouvrirait
   * aussitôt le même fil, et l'on ne pourrait plus en sortir.
   *
   * `chats` — et non `loadedChats` — comme dépendance : la liste locale
   * est celle qui reflète archivage et suppressions.
   */
  const { c: conversationDemandee } = Route.useSearch();
  useEffect(() => {
    if (!conversationDemandee || chats.length === 0) return;

    const cible = chats.find(x => x.id === conversationDemandee);
    if (cible) setActive(cible);

    // Nettoyée dans tous les cas : une conversation introuvable —
    // supprimée, ou personne bloquée — ne doit pas laisser un paramètre
    // qui retentera l'ouverture à chaque rendu.
    navigate({ to: "/messages", search: {}, replace: true });
  }, [conversationDemandee, chats]);

  const loading = isPending && chats.length === 0;

  // Temps réel : un nouveau message remonte la conversation et incrémente le badge
  useEffect(() => {
    if (!userId || chats.length === 0) return;

    const knownIds = new Set(chats.map(c => c.id));
    const channel = supabase
      .channel("messages-overview")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload: any) => {
        const msg = payload.new as Msg;
        if (!knownIds.has(msg.match_id)) return;

        const mine = msg.sender_id === userId;
        const body = msg.media_type ? MEDIA_LABELS[msg.media_type] || "Média" : msg.content || "";

        setChats(prev =>
          prev
            .map(c =>
              c.id === msg.match_id
                ? {
                    ...c,
                    lastMessage: mine ? `Vous : ${body}` : body,
                    lastMessageMine: mine,
                    lastMessageRead: false,
                    hasMessages: true,
                    timestamp: new Date(msg.created_at).getTime(),
                    // Pas de badge si la conversation est ouverte à l'écran
                    unread: mine || active?.id === msg.match_id ? c.unread : c.unread + 1,
                  }
                : c,
            )
            .sort((a, b) => b.timestamp - a.timestamp),
        );
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, chats.length, active?.id]);

  const openChat = (c: MatchChat) => {
    // Optimiste : le badge disparaît tout de suite, ChatView écrit read_at côté serveur
    setChats(prev => prev.map(x => (x.id === c.id ? { ...x, unread: 0 } : x)));
    setActive(c);
  };

  // Ouvre directement la bonne conversation depuis /messages?conversation=<matchId>
  const openedFromUrl = useRef(false);
  useEffect(() => {
    if (openedFromUrl.current || chats.length === 0) return;
    const target = new URLSearchParams(window.location.search).get("conversation");
    if (!target) return;
    const chat = chats.find(c => c.id === target);
    if (chat) {
      openedFromUrl.current = true;
      openChat(chat);
    }
  }, [chats]);

  const newMatches = useMemo(() => chats.filter(c => !c.hasMessages && !c.archived), [chats]);
  const conversations = useMemo(() => chats.filter(c => c.hasMessages), [chats]);
  const archivedCount = useMemo(() => chats.filter(c => c.archived).length, [chats]);
  const totalUnread = useMemo(
    () => chats.filter(c => !c.archived).reduce((n, c) => n + c.unread, 0),
    [chats],
  );

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return conversations
      .filter(c => (tab === "archived" ? c.archived : !c.archived))
      .filter(c => (tab === "unread" ? c.unread > 0 : true))
      .filter(c =>
        !q ||
        normalize(c.profile.firstName).includes(q) ||
        normalize(c.lastMessage).includes(q),
      );
  }, [query, tab, conversations]);

  if (active && userId) {
    return (
      <ChatView
        chat={active}
        currentUserId={userId}
        onBack={() => setActive(null)}
        onRead={id => setChats(prev => prev.map(c => (c.id === id ? { ...c, unread: 0 } : c)))}
        // Bascule l'état localement plutôt que de recharger toute la
        // liste : la ligne change d'onglet immédiatement.
        onArchiveChange={() =>
          setChats(prev =>
            prev.map(c => (c.id === active.id ? { ...c, archived: !c.archived } : c)),
          )
        }
      />
    );
  }

  return (
    <div className="px-4 pt-4">
      <div className="flex items-baseline gap-2 mb-3">
        <h1 className="font-serif text-2xl font-semibold">Messages</h1>
        {totalUnread > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-semibold">
            {totalUnread} non lu{totalUnread > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Rechercher une conversation…"
          className="w-full pl-10 pr-9 py-2.5 rounded-full bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Effacer la recherche"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-muted-foreground/20 flex items-center justify-center hover:bg-muted-foreground/30"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Filtres */}
      <div className="flex gap-2 mb-4">
        {([["all", "Toutes"], ["unread", "Non lues"], ["archived", "Archivées"]] as const)
          .filter(([key]) => key !== "archived" || archivedCount > 0)
          .map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              tab === key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:bg-secondary/70"
            }`}
          >
            {label}
            {key === "unread" && totalUnread > 0 && ` · ${totalUnread}`}
            {key === "archived" && ` · ${archivedCount}`}
          </button>
        ))}
      </div>

      {loading ? (
        <ConversationSkeleton />
      ) : (
        <>
          {/* Nouveaux matches : uniquement ceux sans aucun message */}
          {newMatches.length > 0 && (
            <div className="mb-6">
              <div className="text-xs uppercase tracking-wider text-primary font-semibold mb-2">
                Nouveaux matches · {newMatches.length}
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                {newMatches.map(c => {
                  const { online } = formatLastSeen(c.profile.lastSeen, now);
                  return (
                    <button key={c.id} onClick={() => openChat(c)} className="shrink-0 flex flex-col items-center gap-1">
                      <div className="relative">
                        <div className="p-0.5 rounded-full bg-gradient-to-tr from-primary to-gold">
                          <ChatAvatar
                            src={c.profile.photo}
                            name={c.profile.firstName}
                            className="w-14 h-14 rounded-full object-cover border-2 border-background"
                            textClassName="text-lg"
                          />
                        </div>
                        {online && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-background" />}
                      </div>
                      <span className="text-[11px] font-medium max-w-[64px] truncate">{c.profile.firstName}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Conversations */}
          <div className="text-xs uppercase tracking-wider text-primary font-semibold mb-2">Conversations</div>
          <div className="divide-y divide-border rounded-2xl overflow-hidden bg-card border border-border/50">
            {filtered.map(c => {
              const { text: lastSeenText, online } = formatLastSeen(c.profile.lastSeen, now);
              return (
                <button
                  key={c.id}
                  onClick={() => openChat(c)}
                  className="w-full flex items-center gap-3 px-3 py-3 hover:bg-secondary/40 transition-colors text-left"
                >
                  <div className="relative shrink-0">
                    <div className={c.unread > 0 ? "p-0.5 rounded-full bg-gradient-to-tr from-primary to-gold" : ""}>
                      <ChatAvatar
                        src={c.profile.photo}
                        name={c.profile.firstName}
                        className={`w-12 h-12 rounded-full object-cover ${c.unread > 0 ? "border-2 border-background" : ""}`}
                        textClassName="text-base"
                      />
                    </div>
                    {online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-background" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold truncate flex items-center gap-1">
                        {c.profile.firstName}
                        {c.profile.verified && <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" aria-label="Profil certifié" />}
                      </span>
                      <span className={`text-[11px] shrink-0 ${c.unread > 0 ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                        {formatListTime(new Date(c.timestamp).toISOString(), now)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className={`text-sm truncate flex items-center gap-1 ${c.unread > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                        {c.typing ? (
                          <em className="text-primary">en train d'écrire…</em>
                        ) : (
                          <>
                            {c.lastMessageMine &&
                              (c.lastMessageRead ? (
                                <CheckCheck className="w-3.5 h-3.5 shrink-0 text-primary" />
                              ) : (
                                <Check className="w-3.5 h-3.5 shrink-0" />
                              ))}
                            <span className="truncate">{c.lastMessage}</span>
                          </>
                        )}
                      </span>
                      {c.unread > 0 && (
                        <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center">
                          {c.unread > 99 ? "99+" : c.unread}
                        </span>
                      )}
                    </div>

                    <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      {online ? "En ligne" : lastSeenText}
                    </div>
                  </div>
                </button>
              );
            })}

            {filtered.length === 0 && (
              <div className="p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {query
                    ? "Aucune conversation ne correspond à votre recherche."
                    : tab === "unread"
                      ? "Vous êtes à jour, aucun message non lu 🙌"
                      : tab === "archived"
                        ? "Aucune conversation archivée."
                        : newMatches.length > 0
                          ? "Lancez la conversation avec l'un de vos nouveaux matches ✨"
                          : "Aucune conversation pour l'instant."}
                </p>
                {!query && tab === "all" && newMatches.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">Allez swiper pour faire de belles rencontres !</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ConversationSkeleton() {
  return (
    <div className="divide-y divide-border rounded-2xl overflow-hidden bg-card border border-border/50">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3 animate-pulse">
          <div className="w-12 h-12 rounded-full bg-secondary shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-secondary" />
            <div className="h-3 w-2/3 rounded bg-secondary/70" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────
// Chat View
// ─────────────────────────────────────────────────
function ChatView({
  chat,
  currentUserId,
  onBack,
  onRead,
  onQuotaChange,
  onArchiveChange,
}: {
  chat: MatchChat;
  currentUserId: string;
  onBack: () => void;
  onRead: (matchId: string) => void;
  onQuotaChange?: () => void;
  onArchiveChange?: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [showSticker, setShowSticker] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [duree, setDuree] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [callState, setCallState] = useState<{ type: "audio" | "video"; callId: string } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [startingCall, setStartingCall] = useState(false);
  const { features } = useSubscription();
  const navigate = useNavigate();

  const requirePlan = (message: string) =>
    toast.error(message, {
      action: { label: "Voir les formules", onClick: () => navigate({ to: "/abonnement" }) },
    });

  // Crée la ligne `calls` : c'est cet INSERT qui fait sonner chez l'autre.
  const startCall = async (type: "audio" | "video") => {
    if (startingCall) return;
    if (!features.calls) {
      requirePlan("Les appels sont réservés aux membres Premium");
      return;
    }
    if (type === "video" && !features.videoCalls) {
      requirePlan("Les appels vidéo sont réservés aux membres VIP");
      return;
    }
    setStartingCall(true);
    const { call, error } = await createCall({
      matchId: chat.id,
      callerId: currentUserId,
      calleeId: chat.profile.id,
      callType: type,
    });
    setStartingCall(false);

    if (!call) {
      // Dire POURQUOI. « Impossible de lancer l'appel » laissait le
      // membre sans recours, et nous sans diagnostic.
      const raw = String(error?.message ?? "");

      // La suspension AVANT le traducteur de quotas : proposer « Voir les
      // formules » à un compte suspendu lui ferait payer un abonnement
      // qui ne débloquerait rien.
      if (raw.includes("ACCOUNT_SUSPENDED")) {
        toast.error("Votre compte est suspendu", {
          description: "Les appels sont désactivés le temps de la suspension.",
        });
        return;
      }

      const connu = quotaErrorMessage(error);
      if (connu) {
        requirePlan(connu);
      } else if (error?.code === "42501" || raw.includes("row-level security")) {
        toast.error("Cet appel a été refusé", {
          description: "Vous n'avez peut-être plus de match actif avec cette personne.",
        });
      } else {
        toast.error("Impossible de lancer l'appel", {
          description: raw || "Erreur inconnue. Réessayez dans un instant.",
          duration: 8000,
        });
      }
      return;
    }
    setCallState({ type, callId: call.id });
  };

  const presence = useMemo(() => formatLastSeen(chat.profile.lastSeen, now), [chat.profile.lastSeen, now]);

  const [quotas, setQuotas] = useState<Quotas | null>(null);
  const loadQuotas = () => fetchQuotas().then(setQuotas);
  useEffect(() => { loadQuotas(); }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const audioChunks = useRef<Blob[]>([]);
  /** Décide, dans `onstop`, s'il faut envoyer ou jeter. */
  const envoyerAuStop = useRef(false);
  const dureeTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Quitter la conversation pendant un enregistrement laisserait le micro
  // ouvert et la pastille rouge allumée dans l'onglet.
  useEffect(() => {
    return () => {
      if (dureeTimer.current) clearInterval(dureeTimer.current);
    };
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Rafraîchit « En ligne / Vu il y a X » dans l'en-tête
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  /** Marque comme lus les messages reçus non lus de cette conversation */
  const markAsRead = async () => {
    const { error } = await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("match_id", chat.id)
      .neq("sender_id", currentUserId)
      .is("read_at", null);

    if (error) {
      console.error("markAsRead", error);
      return;
    }
    onRead(chat.id);
  };

  useEffect(() => {
    async function loadMessages() {
      /* Colonnes nommées, et surtout un PLAFOND.
         Sans `limit`, ouvrir une conversation chargeait l'intégralité de
         son historique : mille messages arrivaient d'un coup pour en
         afficher vingt. On prend les 100 DERNIERS — donc en ordre
         décroissant — puis on remet à l'endroit pour l'affichage. */
      const { data } = await supabase
        .from("messages")
        .select("id, match_id, sender_id, content, created_at, read_at, media_url, media_type")
        .eq("match_id", chat.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (data) setMessages((data as Msg[]).slice().reverse());
      // À l'ouverture, tout ce qui a été reçu est considéré lu
      markAsRead();
    }
    loadMessages();

    const channel = supabase.channel(`room:${chat.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `match_id=eq.${chat.id}`,
      }, (payload: any) => {
        const msg = payload.new as Msg;
        setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
        // Conversation ouverte → le message entrant est lu immédiatement
        if (msg.sender_id !== currentUserId) markAsRead();
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "messages",
        filter: `match_id=eq.${chat.id}`,
      }, (payload: any) => {
        // Accusés de lecture : passe ✓ en ✓✓ en direct
        const msg = payload.new as Msg;
        setMessages(prev => prev.map(m => (m.id === msg.id ? { ...m, ...msg } : m)));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [chat.id, currentUserId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // ── Helpers ──
  const uploadMedia = async (file: File, folder: string): Promise<string | null> => {
    const ext = file.name.split(".").pop();
    const path = `${folder}/${currentUserId}/${Date.now()}.${ext}`;

    // `contentType` explicite : sans lui, Supabase déduit le type de
    // l'extension. Un vocal Safari est un .m4a servi en
    // `application/octet-stream`, que le lecteur <audio> refuse de lire.
    const { error } = await supabase.storage
      .from("chat-media")
      .upload(path, file, { contentType: file.type || undefined });

    if (error) {
      // « Erreur upload » n'apprenait rien — ni au membre, ni à nous.
      console.error("[chat-media] envoi:", error);
      const raw = String((error as any)?.message ?? "");
      toast.error("Envoi impossible", {
        description: raw.includes("exceeded the maximum allowed size")
          ? "Ce fichier est trop volumineux."
          : raw.includes("Bucket not found")
            ? "Le stockage des médias n'est pas configuré. Prévenez l'assistance."
            : raw || "Réessayez dans un instant.",
        duration: 7000,
      });
      return null;
    }

    const { data } = supabase.storage.from("chat-media").getPublicUrl(path);
    return data.publicUrl;
  };

  const sendMessage = async (opts: { content?: string; media_url?: string; media_type?: Msg["media_type"] }) => {
    const { error } = await supabase.from("messages").insert({
      match_id: chat.id,
      sender_id: currentUserId,
      content: opts.content || "",
      media_url: opts.media_url || null,
      media_type: opts.media_type || null,
    });

    if (!error) {
      onQuotaChange?.();
      loadQuotas();
      return false;
    }

    // La base applique les limites de la formule Gratuit : on traduit son
    // refus plutôt que d'afficher « Erreur d'envoi », qui n'apprend rien.
    const limit = quotaErrorMessage(error);
    if (limit) {
      toast.error(limit, {
        action: { label: "Voir les formules", onClick: () => navigate({ to: "/abonnement" }) },
      });
    } else {
      toast.error("Erreur d'envoi");
    }
    return true;
  };

  // ── Send text ──
  const send = async () => {
    if (!text.trim()) return;
    const content = text.trim();
    setText("");
    setShowEmoji(false);
    await sendMessage({ content });
  };

  // ── Send image / video ──
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "image" | "video") => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Inutile de téléverser un fichier que la base refusera ensuite
    if (type === "video" && !features.videoMessages) {
      requirePlan("L'envoi de vidéos en conversation est réservé aux membres VIP");
      e.target.value = "";
      return;
    }
    setUploading(true);
    const url = await uploadMedia(file, type === "image" ? "images" : "videos");
    if (url) await sendMessage({ media_url: url, media_type: type });
    setUploading(false);
    setShowMedia(false);
    e.target.value = "";
  };

  /* ── Messages vocaux ──────────────────────────────────────────
   *
   * L'ancienne version enregistrait tant que le doigt restait appuyé :
   * `onPointerDown={startRecording}` / `onPointerUp={stopRecording}`.
   * Elle ne pouvait pas fonctionner.
   *
   * `startRecording` est asynchrone — `getUserMedia` ouvre la demande
   * d'autorisation du navigateur. Le temps qu'elle se résolve, le doigt
   * est déjà relevé : `onPointerUp` s'est exécuté avec `mediaRecorder`
   * encore à `null`, donc `.stop()` sur rien. Aucun son capté, aucun
   * envoi, aucune erreur affichée.
   *
   * Désormais : un appui démarre, un bouton d'envoi apparaît. Le geste
   * est aussi plus accessible — maintenir un bouton plusieurs dizaines de
   * secondes exclut une partie des utilisateurs.
   */

  /** Le format dépend du navigateur : Safari ne produit pas de WebM. */
  const formatAudio = (): { mime: string; ext: string } => {
    if (typeof MediaRecorder === "undefined") return { mime: "", ext: "webm" };
    const candidats = [
      { mime: "audio/webm;codecs=opus", ext: "webm" },
      { mime: "audio/webm", ext: "webm" },
      { mime: "audio/mp4", ext: "m4a" },
      { mime: "audio/ogg;codecs=opus", ext: "ogg" },
    ];
    for (const c of candidats) {
      if (MediaRecorder.isTypeSupported(c.mime)) return c;
    }
    // Aucun format déclaré : on laisse le navigateur choisir le sien.
    return { mime: "", ext: "webm" };
  };

  const startRecording = async () => {
    if (recording || uploading) return;
    if (!features.voiceMessages) {
      requirePlan("Les messages vocaux sont réservés aux membres Premium");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: any) {
      // Distinguer le refus de l'absence de micro : la marche à suivre
      // n'est pas la même.
      toast.error(
        err?.name === "NotAllowedError"
          ? "Micro refusé"
          : err?.name === "NotFoundError"
            ? "Aucun micro détecté"
            : "Micro indisponible",
        {
          description:
            err?.name === "NotAllowedError"
              ? "Autorisez l'accès au microphone dans les réglages de votre navigateur."
              : "Vérifiez qu'un microphone est branché et qu'aucune autre application ne l'utilise.",
          duration: 7000,
        },
      );
      return;
    }

    const { mime, ext } = formatAudio();
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);

    audioChunks.current = [];
    envoyerAuStop.current = false;

    mr.ondataavailable = e => {
      if (e.data.size > 0) audioChunks.current.push(e.data);
    };

    mr.onstop = async () => {
      // Toujours libérer le micro, même si l'enregistrement est annulé :
      // sinon la pastille d'enregistrement reste allumée dans l'onglet.
      stream.getTracks().forEach(t => t.stop());
      setRecording(false);
      setMediaRecorder(null);
      if (dureeTimer.current) clearInterval(dureeTimer.current);

      if (!envoyerAuStop.current) {
        audioChunks.current = [];
        return;
      }

      // `mr.mimeType` et non la constante : le navigateur peut avoir
      // retenu un format différent de celui demandé.
      const type = mr.mimeType || mime || "audio/webm";
      const blob = new Blob(audioChunks.current, { type });
      audioChunks.current = [];

      if (blob.size < 1024) {
        toast.error("Enregistrement trop court", {
          description: "Maintenez quelques instants avant d'envoyer.",
        });
        return;
      }

      setUploading(true);
      const file = new File([blob], `vocal.${ext}`, { type });
      const url = await uploadMedia(file, "audio");
      if (url) await sendMessage({ media_url: url, media_type: "audio" });
      setUploading(false);
    };

    mr.start();
    setMediaRecorder(mr);
    setRecording(true);
    setDuree(0);
    dureeTimer.current = setInterval(() => {
      setDuree(d => {
        // Coupure automatique : un enregistrement oublié remplirait le
        // stockage et serait inécoutable.
        if (d + 1 >= DUREE_VOCAL_MAX) {
          envoyerAuStop.current = true;
          mr.stop();
        }
        return d + 1;
      });
    }, 1000);
  };

  /** Termine l'enregistrement et envoie. */
  const stopRecording = () => {
    if (!mediaRecorder) return;
    envoyerAuStop.current = true;
    mediaRecorder.stop();
  };

  /** Termine l'enregistrement et jette. */
  const cancelRecording = () => {
    if (!mediaRecorder) return;
    envoyerAuStop.current = false;
    mediaRecorder.stop();
    toast.info("Enregistrement annulé");
  };

  // ── GIF & Sticker send ──
  // Le type vient du sélecteur, pas de `showSticker` : celui-ci est remis
  // à `false` deux lignes plus haut, et ne devait sa justesse qu'au fait
  // que React ne met pas l'état à jour de façon synchrone. Un
  // rafraîchissement au mauvais moment aurait enregistré un sticker en GIF.
  const sendGif = async (url: string, kind: "gif" | "sticker") => {
    setShowGif(false);
    setShowSticker(false);
    await sendMessage({ media_url: url, media_type: kind });
  };

  // ── Emoji ──
  const COMMON_EMOJIS = ["😀", "😂", "🥰", "😍", "🙏", "😭", "🥺", "😊", "🔥", "✨", "❤️", "💯", "👍", "🙌", "👀", "😘", "😎", "💪", "😉", "🎉", "💖", "🥲"];

  // ── Message bubble renderer ──
  const renderBubble = (m: Msg) => {
    const isMe = m.sender_id === currentUserId;
    const base = `max-w-[80%] rounded-2xl text-sm shadow-soft ${isMe
      ? "bg-gradient-to-br from-primary to-primary/85 text-primary-foreground rounded-br-md"
      : "bg-card border border-border/60 rounded-bl-md"
    }`;

    const ts = (
      <div className={`flex items-center justify-end gap-1 mt-0.5 text-[10px] ${isMe ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
        {formatTime(m.created_at)}
        {isMe && (m.read_at ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />)}
      </div>
    );

    if (m.media_type === "image") return (
      <div className={`${base} overflow-hidden p-0`}>
        <img src={m.media_url!} alt="image" className="max-w-[200px] max-h-[260px] object-cover" onClick={() => window.open(m.media_url!, "_blank")} />
        <div className="px-2 pb-1">{ts}</div>
      </div>
    );

    if (m.media_type === "video") return (
      <div className={`${base} overflow-hidden p-0`}>
        <video src={m.media_url!} controls className="max-w-[220px] rounded-2xl" />
        <div className="px-2 pb-1">{ts}</div>
      </div>
    );

    if (m.media_type === "audio") return (
      <div className={`${base} px-3 py-2`}>
        <AudioPlayer src={m.media_url!} isMe={isMe} />
        {ts}
      </div>
    );

    if (m.media_type === "gif" || m.media_type === "sticker") return (
      // Sans bulle : un sticker se pose sur la conversation, il ne
      // s'encadre pas. `w-[140px]` fixe la taille — un SVG sans
      // dimensions explicites s'étirerait à la largeur disponible.
      <div className={`${base} p-0 bg-transparent shadow-none border-none`}>
        <img
          src={m.media_url!}
          alt={m.media_type === "sticker" ? "Sticker" : "Sticker animé"}
          loading="lazy"
          className="w-[140px] h-[140px] object-contain rounded-2xl"
        />
        <div className="px-1 mt-0.5">{ts}</div>
      </div>
    );

    return (
      <div className={`${base} px-3.5 py-2`}>
        <div>{m.content}</div>
        {ts}
      </div>
    );
  };

  // ── Call active ──
  if (callState) return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-50 bg-[#0d0d1a] flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-white/60 text-sm">Appel de {chat.profile.firstName}…</p>
        </div>
      }
    >
      <CallView
        channelName={chat.id}
        callType={callState.type}
        peerName={chat.profile.firstName}
        peerPhoto={chat.profile.photo ?? ""}
        callId={callState.callId}
        role="caller"
        onEnd={() => setCallState(null)}
      />
    </Suspense>
  );

  return (
    <div className="flex flex-col h-[calc(100dvh-64px-72px)]">
      {/* Header */}
      <div className="sticky top-14 z-20 flex items-center gap-3 px-3 py-2 border-b border-border/50 bg-background/95 backdrop-blur">
        <button onClick={onBack} aria-label="Retour" className="w-9 h-9 rounded-full hover:bg-secondary flex items-center justify-center">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="relative shrink-0">
          <ChatAvatar
            src={chat.profile.photo}
            name={chat.profile.firstName}
            className="w-10 h-10 rounded-full object-cover"
          />
          {presence.online && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-background" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate flex items-center gap-1">
            {/* Le prénom seul. L'âge accolé — « Marie, 28 » — a sa place
                sur une carte de découverte, où l'on compare des profils.
                En tête d'une conversation, on parle à quelqu'un : son
                âge n'a plus rien à y faire, et la virgule donnait un air
                de fiche plutôt que de discussion. */}
            <span className="truncate">{chat.profile.firstName}</span>
            {chat.profile.verified && <BadgeCheck className="w-4 h-4 text-primary shrink-0" aria-label="Profil certifié" />}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {chat.typing ? (
              <span className="text-primary">en train d'écrire…</span>
            ) : (
              <span className={presence.online ? "text-emerald-500" : ""}>{presence.text}</span>
            )}
          </div>
        </div>
        {/* Call buttons */}
        <button
          onClick={() => startCall("audio")}
          disabled={startingCall}
          className="w-9 h-9 rounded-full hover:bg-secondary flex items-center justify-center disabled:opacity-50"
          aria-label="Appel audio"
        >
          <Phone className="w-4 h-4 text-primary" />
        </button>
        <button
          onClick={() => startCall("video")}
          disabled={startingCall}
          className="w-9 h-9 rounded-full hover:bg-secondary flex items-center justify-center disabled:opacity-50"
          aria-label="Appel vidéo"
        >
          <VideoIcon className="w-4 h-4 text-primary" />
        </button>
        {/* Menu */}
        <div className="relative">
          <button onClick={() => setMenu(!menu)} className="w-9 h-9 rounded-full hover:bg-secondary flex items-center justify-center" aria-label="Options">
            <MoreVertical className="w-5 h-5" />
          </button>
          <AnimatePresence>
            {menu && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                className="absolute right-0 top-11 w-48 bg-card border border-border rounded-xl shadow-elegant py-1 z-30">
                {[
                  {
                    // L'action se contentait d'un `toast.success` : aucune
                    // table, aucun appel. Un message de succès pour une
                    // opération qui n'avait jamais lieu.
                    l: chat.archived ? "Désarchiver" : "Archiver",
                    i: Archive,
                    action: async () => {
                      const ok = chat.archived
                        ? await unarchiveChat(chat.id)
                        : await archiveChat(chat.id);
                      if (!ok) {
                        toast.error("L'opération n'a pas pu être enregistrée");
                        return;
                      }
                      toast.success(
                        chat.archived
                          ? "Conversation restaurée"
                          : "Conversation archivée",
                        chat.archived
                          ? undefined
                          : { description: "Un nouveau message la fera réapparaître." },
                      );
                      onArchiveChange?.();
                      if (!chat.archived) onBack();
                    },
                  },
                  {
                    l: "Signaler",
                    i: Flag,
                    action: () => setReportOpen(true),
                  },
                  {
                    l: "Bloquer",
                    i: Ban,
                    action: async () => {
                      const ok = await blockUser(chat.profile.id);
                      if (ok) {
                        toast.success(`${chat.profile.firstName} a été bloqué`);
                        onBack();
                      } else {
                        toast.error("Le blocage n'a pas pu être enregistré");
                      }
                    },
                  },
                ].map(it => (
                  <button key={it.l} onClick={() => { setMenu(false); it.action(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary text-left">
                    <it.i className="w-4 h-4" />{it.l}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-secondary/20">
        {messages.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-10">
            Dites bonjour à {chat.profile.firstName} 👋
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.sender_id === currentUserId ? "justify-end" : "justify-start"}`}>
            {renderBubble(m)}
          </div>
        ))}
        {chat.typing && (
          <div className="flex justify-start">
            <div className="bg-card border border-border/60 rounded-2xl rounded-bl-md px-4 py-2.5 flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.15s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.3s]" />
            </div>
          </div>
        )}
      </div>

      {/* Media panel */}
      <AnimatePresence>
        {showMedia && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-border/50 bg-background px-4 py-3 grid grid-cols-5 gap-3"
          >
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-1 p-3 rounded-2xl bg-primary/10 hover:bg-primary/20 transition-colors"
            >
              <ImageIcon className="w-6 h-6 text-primary" />
              <span className="text-[10px] font-medium">Image</span>
            </button>
            <button
              onClick={() => videoInputRef.current?.click()}
              className="flex flex-col items-center gap-1 p-3 rounded-2xl bg-primary/10 hover:bg-primary/20 transition-colors"
            >
              <VideoIcon className="w-6 h-6 text-primary" />
              <span className="text-[10px] font-medium">Vidéo</span>
            </button>
            <button
              onClick={() => { setShowGif(true); setShowSticker(false); setShowMedia(false); }}
              className="flex flex-col items-center gap-1 p-3 rounded-2xl bg-primary/10 hover:bg-primary/20 transition-colors"
            >
              <GalleryHorizontal className="w-6 h-6 text-primary" />
              <span className="text-[10px] font-medium">Animés</span>
            </button>
            <button
              onClick={() => { setShowSticker(true); setShowGif(false); setShowMedia(false); }}
              className="flex flex-col items-center gap-1 p-3 rounded-2xl bg-primary/10 hover:bg-primary/20 transition-colors"
            >
              <Sticker className="w-6 h-6 text-primary" />
              <span className="text-[10px] font-medium">Sticker</span>
            </button>
            <button
              onClick={() => { setShowMedia(false); startRecording(); }}
              className="flex flex-col items-center gap-1 p-3 rounded-2xl transition-colors bg-primary/10 hover:bg-primary/20"
            >
              <Mic className="w-6 h-6 text-primary" />
              <span className="text-[10px] font-medium">Vocal</span>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => handleFileUpload(e, "image")} />
            <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={e => handleFileUpload(e, "video")} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* GIF & Sticker Picker */}
      <div className="relative">
        <AnimatePresence>
          {(showGif || showSticker) && <GifPicker onSelect={sendGif} type={showGif ? "gif" : "sticker"} />}
        </AnimatePresence>
      </div>

      {/* Emoji Picker */}
      <AnimatePresence>
        {showEmoji && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="border-t border-border/50 bg-card p-3 max-h-48 overflow-y-auto"
          >
            <div className="grid grid-cols-7 gap-2">
              {COMMON_EMOJIS.map(e => (
                <button
                  key={e}
                  onClick={() => setText(t => t + e)}
                  className="w-10 h-10 rounded-full hover:bg-secondary text-2xl flex items-center justify-center transition-colors"
                >
                  {e}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quota restant — annoncé avant d'écrire, pas après le refus */}
      {quotas && quotas.messagesLeft >= 0 && (
        <div
          className={`px-3 py-1.5 text-[11px] flex items-center justify-center gap-1.5 border-t border-border/50 ${
            quotas.messagesLeft === 0 ? "bg-destructive/10 text-destructive" : "bg-secondary/50 text-muted-foreground"
          }`}
        >
          {quotas.messagesLeft === 0 ? (
            <>
              <Lock className="w-3 h-3" />
              Vous avez utilisé vos {quotas.messagesQuota} messages du jour
              <button onClick={() => navigate({ to: "/abonnement" })} className="font-semibold underline">
                Passer Premium
              </button>
            </>
          ) : (
            <>
              {quotas.messagesLeft} message{quotas.messagesLeft > 1 ? "s" : ""} restant
              {quotas.messagesLeft > 1 ? "s" : ""} aujourd'hui
            </>
          )}
        </div>
      )}

      {/* Composer
          Pendant l'enregistrement, la barre entière est remplacée : garder
          le champ de texte et les médias inviterait à écrire alors qu'un
          vocal est en cours, et les deux ne peuvent pas partir ensemble. */}
      {recording ? (
        <div className="border-t border-border/50 bg-background p-2 flex items-center gap-2">
          <button
            onClick={cancelRecording}
            aria-label="Annuler l'enregistrement"
            className="w-10 h-10 rounded-full flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors shrink-0"
          >
            <Trash2 className="w-5 h-5" />
          </button>

          <div className="flex-1 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-destructive/10 border border-destructive/25 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse shrink-0" />
            <span className="font-mono text-sm tabular-nums shrink-0">
              {formatDuree(duree)}
            </span>
            {/* Repère visuel du son capté. Sans lui, rien ne distingue un
                micro qui enregistre d'un micro muet. */}
            <span className="flex items-end gap-[3px] h-4 flex-1 overflow-hidden">
              {[...Array(14)].map((_, i) => (
                <span
                  key={i}
                  className="w-[3px] bg-destructive/60 rounded-full animate-pulse"
                  style={{
                    height: `${30 + ((i * 37) % 70)}%`,
                    animationDelay: `${i * 90}ms`,
                    animationDuration: "900ms",
                  }}
                />
              ))}
            </span>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {formatDuree(DUREE_VOCAL_MAX)} max
            </span>
          </div>

          <button
            onClick={stopRecording}
            aria-label="Envoyer le vocal"
            className="w-11 h-11 rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground flex items-center justify-center shadow-elegant active:scale-95 transition-transform shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      ) : (
      <div className="border-t border-border/50 bg-background p-2 flex items-center gap-1.5">
        {/* + Media button */}
        <button
          onClick={() => { setShowMedia(!showMedia); setShowEmoji(false); setShowGif(false); setShowSticker(false); }}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${showMedia ? "bg-primary text-white" : "hover:bg-secondary"}`}
          aria-label="Médias"
        >
          {showMedia ? <X className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
        </button>

        <div className="flex-1 relative">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && send()}
            placeholder="Écrire un message…"
            className="w-full pl-4 pr-9 py-2.5 rounded-full bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm"
          />
          <button
            onClick={() => { setShowEmoji(!showEmoji); setShowMedia(false); setShowGif(false); setShowSticker(false); }}
            className={`absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center ${showEmoji ? "bg-primary/20" : "hover:bg-secondary/70"}`}
            aria-label="Emoji"
          >
            <Smile className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Send / Mic */}
        {uploading ? (
          <div className="w-10 h-10 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : text ? (
          <button onClick={send} aria-label="Envoyer"
            className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground flex items-center justify-center shadow-elegant">
            <Send className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={startRecording}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all bg-gradient-to-br from-primary to-primary/80 text-primary-foreground"
            aria-label="Enregistrer un message vocal"
          >
            <Mic className="w-4 h-4" />
          </button>
        )}
      </div>
      )}

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        reportedId={chat.profile.id}
        reportedName={chat.profile.firstName}
        context="message"
      />
    </div>
  );
}

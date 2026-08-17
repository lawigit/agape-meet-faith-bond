import { createFileRoute } from "@tanstack/react-router";
import { GuideEcran } from "@/components/app/GuideEcran";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Heart, MessageCircle, Share2, Bookmark, Flag, BookOpen, Flame,
  Sparkles, Image as ImageIcon, Send, CheckCircle2, Crown, X,
  AlertTriangle, ChevronDown, ChevronUp, Video, Play, Loader2,
  UploadCloud, Lock, MoreHorizontal, Pencil, Trash2,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { coupleTestimonials } from "@/lib/mock-data";
import { toast } from "sonner";
import { useDailyContent } from "@/hooks/useDailyContent";
import { useSubscription } from "@/lib/subscription";
import { useNavigate } from "@tanstack/react-router";
import { PlanBadge } from "@/components/app/PlanBadge";
import { Avatar } from "@/components/app/Avatar";
import { FicheProfil } from "@/components/app/FicheProfil";
import { markCommunityRead } from "@/lib/badgesNav";

export const Route = createFileRoute("/_app/communaute")({
  head: () => ({
    meta: [
      { title: "Communauté — AgapeMeet" },
      { name: "description", content: "Témoignages, prières, encouragements et versets." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CommunityPage,
});

const categories = [
  "Tous", "Témoignage", "Prière", "Encouragement",
  "Verset", "Conseil", "Réflexion", "Question", "Expérience",
] as const;

type CategoryType = (typeof categories)[number];
const sorts = ["Récentes", "Populaires"] as const;

// ─── Limites fichiers ──────────────────────────────────────────────────────────
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;   // 5 MB
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;  // 25 MB

type CommunityPost = {
  id: string;
  user_id: string;
  category: string;
  text: string;
  image_url: string | null;
  video_url: string | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
  /** Posé par la base à chaque modification du contenu. */
  edited_at?: string | null;
  profile: {
    id: string;
    first_name: string;
    city: string | null;
    photos: string[] | null;
    is_verified: boolean | null;
    public_plan?: string | null;
    premium_until: string | null;
    is_founder: boolean | null;
  } | null;
  liked: boolean;
  saved: boolean;
};

type Comment = {
  id: string;
  user_id: string;
  text: string;
  created_at: string;
  profiles: {
    first_name: string;
    photos: string[] | null;
    is_verified: boolean | null;
  } | null;
};

// Le badge est désormais rendu par <PlanBadge /> : il distingue Premium et
// VIP, là où cette fonction renvoyait un booléen unique qui affichait la
// même couronne pour les deux offres.

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "À l'instant";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} j`;
}

// ─── Report Modal ─────────────────────────────────────────────────────────────
const REPORT_REASONS = [
  "Contenu inapproprié", "Spam", "Harcèlement", "Fausse information",
  "Contenu offensant ou irrespectueux", "Autre raison",
];

function ReportModal({ postId, userId, onClose }: { postId: string; userId: string; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!reason) { toast.error("Veuillez sélectionner une raison"); return; }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("community_reports").insert({
        post_id: postId, reporter_id: userId, reason,
      });
      if (error && error.code === "23505") {
        toast.info("Vous avez déjà signalé cette publication");
      } else if (error) {
        throw error;
      } else {
        toast.success("Signalement envoyé. Merci pour votre vigilance 🙏");
      }
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors du signalement");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-card rounded-2xl p-5 shadow-elegant" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="font-semibold text-base">Signaler cette publication</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Sélectionnez la raison pour laquelle vous signalez ce contenu.</p>
        <div className="space-y-2 mb-5">
          {REPORT_REASONS.map(r => (
            <label key={r} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${reason === r ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/40"}`}>
              <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-primary" />
              <span className="text-sm">{r}</span>
            </label>
          ))}
        </div>
        <button
          onClick={submit}
          disabled={!reason || submitting}
          className="w-full py-3 rounded-xl bg-destructive text-white font-semibold text-sm disabled:opacity-50"
        >
          {submitting ? "Envoi en cours…" : "Confirmer le signalement"}
        </button>
      </div>
    </div>
  );
}

// ─── Comments Section ─────────────────────────────────────────────────────────
function CommentsSection({ postId, currentUserId, currentUserProfile, commentsCount, onCountUpdate }: {
  postId: string;
  currentUserId: string | null;
  currentUserProfile: any;
  commentsCount: number;
  onCountUpdate: (newCount: number) => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadComments() {
      setLoading(true);
      const { data } = await supabase
        .from("community_comments")
        .select("id, user_id, text, created_at, profiles!community_comments_user_id_fkey(first_name, photos, is_verified)")
        .eq("post_id", postId)
        .order("created_at", { ascending: true })
        .limit(30);
      setComments((data as any) || []);
      setLoading(false);
    }
    loadComments();
  }, [postId]);

  const submitComment = async () => {
    if (!text.trim()) return;
    if (!currentUserId) { toast.error("Connectez-vous pour commenter"); return; }
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("community_comments")
        .insert({ post_id: postId, user_id: currentUserId, text: text.trim() })
        .select("id, user_id, text, created_at, profiles!community_comments_user_id_fkey(first_name, photos, is_verified)")
        .single();
      if (error) throw error;
      setComments(prev => [...prev, data as any]);
      onCountUpdate(commentsCount + 1);
      setText("");
    } catch (e) {
      console.error(e);
      toast.error("Impossible d'envoyer le commentaire");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    await supabase.from("community_comments").delete().eq("id", commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
    onCountUpdate(commentsCount - 1);
  };

  return (
    <div className="border-t border-border/50 bg-secondary/10 px-4 py-3">
      {loading ? (
        <div className="space-y-2 mb-3">
          {[1,2].map(i => <div key={i} className="h-8 bg-secondary animate-pulse rounded-xl" />)}
        </div>
      ) : comments.length > 0 ? (
        <div className="space-y-3 mb-3">
          {comments.map(c => (
            <div key={c.id} className="flex gap-2 items-start">
              <Avatar
                src={(c.profiles as any)?.photos?.[0]}
                name={(c.profiles as any)?.first_name}
                className="w-7 h-7 text-[11px] shrink-0 mt-0.5"
              />
              <div className="flex-1 bg-background rounded-xl px-3 py-2 text-sm">
                <span className="font-semibold text-xs">{(c.profiles as any)?.first_name || "Membre"} </span>
                <span className="text-foreground">{c.text}</span>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-muted-foreground">{timeAgo(c.created_at)}</span>
                  {c.user_id === currentUserId && (
                    <button onClick={() => deleteComment(c.id)} className="text-[10px] text-destructive hover:underline">Supprimer</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground mb-3 text-center">Soyez le premier à commenter ✨</p>
      )}

      <div className="flex gap-2 items-center">
        <Avatar
          src={currentUserProfile?.photos?.[0]}
          name={currentUserProfile?.first_name}
          className="w-8 h-8 text-xs shrink-0"
        />
        <div className="flex-1 flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-1.5">
          <input
            type="text"
            placeholder="Écrire un commentaire…"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submitComment()}
            className="flex-1 text-sm bg-transparent focus:outline-none"
          />
          <button
            onClick={submitComment}
            disabled={!text.trim() || submitting}
            className="text-primary disabled:opacity-30 transition-opacity"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Media Preview (dans le composer) ────────────────────────────────────────
function ComposerMediaPreview({
  file, previewUrl, mediaType, onRemove,
}: {
  file: File; previewUrl: string; mediaType: "image" | "video"; onRemove: () => void;
}) {
  return (
    <div className="relative mt-3 rounded-xl overflow-hidden border border-border/60 bg-secondary/20">
      {mediaType === "image" ? (
        <img src={previewUrl} alt="preview" className="w-full max-h-48 object-cover" />
      ) : (
        <video src={previewUrl} className="w-full max-h-48 object-contain bg-black" controls muted />
      )}
      {/* Overlay info */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-1.5 bg-black/50 text-white text-[11px]">
        <span className="truncate max-w-[70%]">{file.name}</span>
        <span className="opacity-70">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
      </div>
      {/* Remove button */}
      <button
        onClick={onRemove}
        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
        aria-label="Retirer le média"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Upload Progress Bar ──────────────────────────────────────────────────────
function UploadProgressBar({ progress }: { progress: number }) {
  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 mb-1">
        <UploadCloud className="w-3.5 h-3.5 text-primary animate-bounce" />
        <span className="text-[11px] text-muted-foreground">Envoi en cours… {progress}%</span>
      </div>
      <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </div>
  );
}

// ─── Video Player in Feed ─────────────────────────────────────────────────────
function FeedVideo({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setPlaying(!playing);
  };

  return (
    <div className="relative bg-black max-h-96 overflow-hidden group cursor-pointer" onClick={togglePlay}>
      <video
        ref={videoRef}
        src={url}
        className="w-full max-h-96 object-contain"
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        playsInline
      />
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity group-hover:bg-black/40">
          <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shadow-lg">
            <Play className="w-6 h-6 text-white fill-white ml-1" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
function CommunityPage() {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<CategoryType>("Tous");
  const [sort, setSort] = useState<(typeof sorts)[number]>("Récentes");
  // Portée, pas catégorie : « Mes publications » n'est pas un thème de plus
  // dans la liste, c'est un autre point de vue sur le même fil.
  const [scope, setScope] = useState<"tous" | "moi">("tous");
  const [editing, setEditing] = useState<CommunityPost | null>(null);
  const [editText, setEditText] = useState("");
  const [editCategory, setEditCategory] = useState("Réflexion");
  const [editRemoveMedia, setEditRemoveMedia] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CommunityPost | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [composer, setComposer] = useState("");
  const [composerCategory, setComposerCategory] = useState("Réflexion");
  const [publishing, setPublishing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [openComments, setOpenComments] = useState<Set<string>>(new Set());
  const [reportingPostId, setReportingPostId] = useState<string | null>(null);
  /** Auteur dont la fiche est ouverte — son identifiant suffit. */
  const [ficheId, setFicheId] = useState<string | null>(null);

  const { content: dailyContent, loading: dailyLoading } = useDailyContent();

  // ─ Media composer state ───────────────────────────────────────────────────
  const [composerMedia, setComposerMedia] = useState<File | null>(null);
  const [composerMediaType, setComposerMediaType] = useState<"image" | "video" | null>(null);
  const [composerMediaPreview, setComposerMediaPreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const { features } = useSubscription();
  const navigate = useNavigate();

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser();
      if (user) {
        setCurrentUserId(user.id);
        let { data: p } = await supabase
          .from("profiles")
          .select("first_name, city, photos, public_plan, premium_until, is_founder")
          .eq("id", user.id)
          .single();
        if (!p) {
          ({ data: p } = await supabase
            .from("profiles")
            .select("first_name, city, photos")
            .eq("id", user.id)
            .single());
        }
        setCurrentUserProfile(p);
      }
    }
    init();

    // Marque le fil comme lu : la pastille de la barre de navigation
    // compte les publications postérieures à cet horodatage.
    //
    // À l'ouverture et non au démontage : quitter la page peut se faire
    // en fermant l'onglet, où aucun nettoyage n'est garanti — la pastille
    // resterait alors allumée sur des publications déjà vues.
    markCommunityRead();
  }, []);

  useEffect(() => {
    async function loadPosts() {
      setLoading(true);
      try {
        // PostgREST rejette la requête ENTIÈRE si une seule colonne demandée
        // n'existe pas — et le fil revient vide sans que rien ne l'explique.
        // C'est ce qui s'est produit avec `is_premium`. On retente donc avec
        // le jeu de colonnes minimal garanti plutôt que de tout perdre.
        const COLS_FULL =
          "id, user_id, category, text, image_url, video_url, likes_count, comments_count, created_at, edited_at, " +
          // Le strict nécessaire à l'en-tête d'une publication. La fiche
          // complète va chercher ses vingt colonnes elle-même, au clic :
          // les charger ici, ce serait cinquante profils complets à
          // chaque ouverture du fil pour une seule fiche consultée.
          "profiles!community_posts_user_id_fkey(id, first_name, city, photos, is_verified, public_plan, premium_until, is_founder)";
        const COLS_MIN =
          "id, user_id, category, text, image_url, video_url, likes_count, comments_count, created_at, " +
          "profiles!community_posts_user_id_fkey(id, first_name, city, photos)";

        let { data, error } = await supabase
          .from("community_posts")
          .select(COLS_FULL)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) {
          console.warn("[communauté] colonnes optionnelles absentes, repli :", error.message);
          ({ data, error } = await supabase
            .from("community_posts")
            .select(COLS_MIN)
            .order("created_at", { ascending: false })
            .limit(50));
        }

        if (error) throw error;
        if (data) {
          let userLikes = new Set<string>();
          let userSaves = new Set<string>();
          if (currentUserId) {
            const [{ data: likes }, { data: saves }] = await Promise.all([
              supabase.from("community_likes").select("post_id").eq("user_id", currentUserId),
              supabase.from("community_saves").select("post_id").eq("user_id", currentUserId),
            ]);
            likes?.forEach((l: any) => userLikes.add(l.post_id));
            saves?.forEach((s: any) => userSaves.add(s.post_id));
          }

          setPosts(data.map((p: any) => ({
            ...p,
            profile: p.profiles,
            liked: userLikes.has(p.id),
            saved: userSaves.has(p.id),
            comments_count: p.comments_count || 0,
          })));
        }
      } catch (err) {
        // Visible pour l'utilisateur : un fil vide sans explication laisse
        // croire que sa publication n'a pas été enregistrée.
        console.error("Erreur chargement posts:", err);
        toast.error("Impossible de charger les publications");
      } finally {
        setLoading(false);
      }
    }
    loadPosts();
  }, [currentUserId]);

  // ─ Mes publications : chargement dédié ────────────────────────────────────
  // Le fil général s'arrête à 50 publications. Sans cette requête, un membre
  // actif ne verrait pas ses plus anciennes dans son propre onglet — et
  // croirait qu'elles ont été supprimées.
  useEffect(() => {
    if (scope !== "moi" || !currentUserId) return;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("community_posts")
        .select(
          "id, user_id, category, text, image_url, video_url, likes_count, " +
          "comments_count, created_at, edited_at",
        )
        .eq("user_id", currentUserId)
        .order("created_at", { ascending: false })
        .limit(200);

      if (cancelled || error || !data) {
        if (error) console.error("[communauté] mes publications:", error);
        return;
      }

      // Fusion par identifiant : celles déjà présentes gardent leur état
      // local (liked, saved, profil joint), les manquantes sont ajoutées.
      setPosts(prev => {
        const known = new Set(prev.map(p => p.id));
        const missing = data
          .filter((p: any) => !known.has(p.id))
          .map((p: any) => ({
            ...p,
            profile: currentUserProfile
              ? {
                  id: currentUserId,
                  first_name: currentUserProfile.first_name ?? "Moi",
                  city: currentUserProfile.city ?? null,
                  photos: currentUserProfile.photos ?? null,
                  is_verified: currentUserProfile.is_verified ?? false,
                  premium_until: currentUserProfile.premium_until ?? null,
                  is_founder: currentUserProfile.is_founder ?? false,
                }
              : null,
            liked: false,
            saved: false,
            comments_count: p.comments_count || 0,
          })) as CommunityPost[];

        if (missing.length === 0) return prev;
        return [...prev, ...missing].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
      });
    })();

    return () => { cancelled = true; };
  }, [scope, currentUserId, currentUserProfile]);

  // ─ Media cleanup ─────────────────────────────────────────────────────────
  const clearMedia = () => {
    if (composerMediaPreview) URL.revokeObjectURL(composerMediaPreview);
    setComposerMedia(null);
    setComposerMediaType(null);
    setComposerMediaPreview(null);
    setUploadProgress(0);
    if (imageInputRef.current) imageInputRef.current.value = "";
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const handleFileSelect = (file: File, type: "image" | "video") => {
    const maxBytes = type === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    const maxLabel = type === "image" ? "5 MB" : "25 MB";

    if (file.size > maxBytes) {
      toast.error(`Fichier trop volumineux. Maximum ${maxLabel} pour les ${type === "image" ? "images" : "vidéos"}.`);
      return;
    }

    clearMedia();
    const preview = URL.createObjectURL(file);
    setComposerMedia(file);
    setComposerMediaType(type);
    setComposerMediaPreview(preview);
  };

  // ─ Upload to Supabase Storage ─────────────────────────────────────────────
  const uploadMedia = async (): Promise<{ image_url: string | null; video_url: string | null }> => {
    if (!composerMedia || !composerMediaType || !currentUserId) {
      return { image_url: null, video_url: null };
    }

    // Le trigger en base refuserait la publication : autant ne pas
    // téléverser un fichier pour rien, ni laisser espérer l'utilisateur.
    if (composerMediaType === "video" && !features.communityVideo) {
      toast.error("Passez VIP pour publier des vidéos dans la communauté", {
        action: { label: "Voir les formules", onClick: () => navigate({ to: "/abonnement" }) },
      });
      return { image_url: null, video_url: null };
    }

    if (!features.communityMedia) {
      toast.error("Passez Premium pour illustrer vos publications", {
        action: { label: "Voir les formules", onClick: () => navigate({ to: "/abonnement" }) },
      });
      return { image_url: null, video_url: null };
    }

    setUploadingMedia(true);
    setUploadProgress(10);

    const ext = composerMedia.name.split(".").pop() || (composerMediaType === "image" ? "jpg" : "mp4");
    const path = `${currentUserId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    try {
      setUploadProgress(30);
      const { error } = await supabase.storage
        .from("community-media")
        .upload(path, composerMedia, {
          cacheControl: "3600",
          upsert: false,
          contentType: composerMedia.type,
        });

      if (error) throw error;
      setUploadProgress(80);

      const { data: urlData } = supabase.storage
        .from("community-media")
        .getPublicUrl(path);

      setUploadProgress(100);
      const publicUrl = urlData.publicUrl;

      return composerMediaType === "image"
        ? { image_url: publicUrl, video_url: null }
        : { image_url: null, video_url: publicUrl };
    } catch (e: any) {
      console.error("Upload error:", e);
      throw new Error(e.message || "Erreur lors de l'upload du fichier");
    } finally {
      setUploadingMedia(false);
    }
  };

  // ─ Toggles ──────────────────────────────────────────────────────────────

  const toggleLike = async (id: string) => {
    if (!currentUserId) { toast.error("Connectez-vous pour aimer une publication"); return; }
    const post = posts.find(p => p.id === id);
    if (!post) return;
    const isLiking = !post.liked;

    setPosts(all => all.map(p => p.id !== id ? p : { ...p, liked: isLiking, likes_count: isLiking ? p.likes_count + 1 : p.likes_count - 1 }));

    try {
      if (isLiking) {
        await supabase.from("community_likes").insert({ post_id: id, user_id: currentUserId });
      } else {
        await supabase.from("community_likes").delete().eq("post_id", id).eq("user_id", currentUserId);
      }
    } catch (e) {
      console.error(e);
      setPosts(all => all.map(p => p.id !== id ? p : { ...p, liked: !isLiking, likes_count: !isLiking ? p.likes_count + 1 : p.likes_count - 1 }));
    }
  };

  const toggleSave = async (id: string) => {
    if (!currentUserId) { toast.error("Connectez-vous pour sauvegarder"); return; }
    const post = posts.find(p => p.id === id);
    if (!post) return;
    const isSaving = !post.saved;

    setPosts(all => all.map(p => p.id !== id ? p : { ...p, saved: isSaving }));

    try {
      if (isSaving) {
        await supabase.from("community_saves").insert({ post_id: id, user_id: currentUserId });
        toast.success("Publication sauvegardée 📌");
      } else {
        await supabase.from("community_saves").delete().eq("post_id", id).eq("user_id", currentUserId);
        toast("Publication retirée de vos sauvegardes");
      }
    } catch (e) {
      console.error(e);
      setPosts(all => all.map(p => p.id !== id ? p : { ...p, saved: !isSaving }));
    }
  };

  const toggleComments = (id: string) => {
    setOpenComments(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const sharePost = async (id: string) => {
    const url = `${window.location.origin}/communaute?post=${id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "AgapeMeet", text: "Voir cette publication sur AgapeMeet", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Lien copié dans le presse-papier !");
      }
    } catch (e) {
      await navigator.clipboard.writeText(url);
      toast.success("Lien copié !");
    }
  };

  const publish = async () => {
    if (!composer.trim() && !composerMedia) return;
    if (!currentUserId) { toast.error("Vous devez être connecté pour publier"); return; }

    setPublishing(true);
    try {
      let mediaUrls = { image_url: null as string | null, video_url: null as string | null };

      if (composerMedia) {
        mediaUrls = await uploadMedia();

        // Un média a été choisi mais n'a pas pu être joint — formule
        // insuffisante, ou échec du téléversement. Publier quand même
        // enverrait un texte amputé de ce qui en faisait le sens, après
        // un message d'erreur : on interrompt.
        if (!mediaUrls.image_url && !mediaUrls.video_url) {
          setPublishing(false);
          return;
        }
      }

      const { data, error } = await supabase.from("community_posts").insert({
        user_id: currentUserId,
        category: composerCategory,
        text: composer.trim(),
        image_url: mediaUrls.image_url,
        video_url: mediaUrls.video_url,
        likes_count: 0,
        comments_count: 0,
      }).select().single();

      if (error) throw error;

      const newPost: CommunityPost = {
        ...data,
        profile: {
          id: currentUserId,
          first_name: currentUserProfile?.first_name || "Moi",
          city: currentUserProfile?.city || null,
          photos: currentUserProfile?.photos || null,
          is_verified: false,
          premium_until: currentUserProfile?.premium_until ?? null,
          is_founder: currentUserProfile?.is_founder ?? false,
        },
        liked: false,
        saved: false,
        comments_count: 0,
      };
      setPosts(prev => [newPost, ...prev]);
      setComposer("");
      clearMedia();
      toast.success("Publication partagée avec la communauté ✨");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erreur lors de la publication");
    } finally {
      setPublishing(false);
      setUploadProgress(0);
    }
  };

  const visible = useMemo(() => {
    let list = posts;
    if (scope === "moi") list = list.filter(p => p.user_id === currentUserId);
    if (category !== "Tous") list = list.filter(p => p.category === category);
    if (sort === "Populaires") list = [...list].sort((a, b) => b.likes_count - a.likes_count);
    return list;
  }, [posts, category, sort, scope, currentUserId]);

  /** Bilan affiché en tête de « Mes publications ». */
  const myStats = useMemo(() => {
    const mine = posts.filter(p => p.user_id === currentUserId);
    return {
      count: mine.length,
      likes: mine.reduce((s, p) => s + (p.likes_count || 0), 0),
      comments: mine.reduce((s, p) => s + (p.comments_count || 0), 0),
    };
  }, [posts, currentUserId]);

  const openEdit = (post: CommunityPost) => {
    setEditing(post);
    setEditText(post.text);
    setEditCategory(post.category);
    setEditRemoveMedia(false);
  };

  const saveEdit = async () => {
    if (!editing) return;

    const keptMedia = !editRemoveMedia && (editing.image_url || editing.video_url);
    if (!editText.trim() && !keptMedia) {
      toast.error("Une publication ne peut pas être entièrement vide");
      return;
    }

    setSavingEdit(true);
    try {
      const patch: Record<string, any> = {
        text: editText.trim(),
        category: editCategory,
      };
      if (editRemoveMedia) {
        patch.image_url = null;
        patch.video_url = null;
      }

      const { data, error } = await supabase
        .from("community_posts")
        .update(patch)
        .eq("id", editing.id)
        .select("id, text, category, image_url, video_url, edited_at")
        .maybeSingle();

      if (error) throw error;

      // Même piège que pour la suppression : une modification refusée par
      // RLS ne renvoie pas d'erreur, elle ne touche simplement aucune
      // ligne. `.single()` aurait levé une erreur illisible ; `maybeSingle`
      // permet de dire ce qui s'est réellement passé.
      if (!data) {
        toast.error("Modification refusée", {
          description: "Vous n'avez pas les droits sur cette publication.",
        });
        setSavingEdit(false);
        return;
      }

      // On reprend `edited_at` renvoyé par la base plutôt que d'en fabriquer
      // un côté client : c'est le serveur qui fait foi, et un décalage
      // d'horloge afficherait une date de modification incohérente.
      setPosts(prev => prev.map(p => (p.id === editing.id ? { ...p, ...data } : p)));
      setEditing(null);
      toast.success("Publication modifiée");
    } catch (err: any) {
      console.error("[communauté] modification:", err);
      toast.error(err?.message ?? "La modification a échoué");
    } finally {
      setSavingEdit(false);
    }
  };

  const removePost = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      // `.select()` est indispensable ici. Sans lui, une suppression
      // refusée par une politique RLS ne renvoie AUCUNE erreur : la
      // requête réussit et n'efface simplement rien. C'est exactement ce
      // qui se passait — la publication réapparaissait au rechargement,
      // sans le moindre message.
      const { data, error } = await supabase
        .from("community_posts")
        .delete()
        .eq("id", confirmDelete.id)
        .select("id");

      if (error) throw error;

      if (!data || data.length === 0) {
        toast.error("Suppression refusée", {
          description: "Vous n'avez pas les droits sur cette publication, ou elle a déjà été supprimée.",
        });
        setDeleting(false);
        return;
      }

      setPosts(prev => prev.filter(p => p.id !== confirmDelete.id));
      setConfirmDelete(null);
      toast.success("Publication supprimée");
    } catch (err: any) {
      console.error("[communauté] suppression:", err);
      // Le message de la base est affiché tel quel : « la suppression a
      // échoué » n'apprenait rien, ni à vous ni à moi.
      toast.error(err?.message ?? "La suppression a échoué");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="px-4 pt-4 pb-24">
      <GuideEcran ecran="communaute" />

      <h1 className="font-serif text-2xl font-semibold">Communauté</h1>
      <p className="text-xs text-muted-foreground mb-4">Ensemble, grandissons dans la foi.</p>

      {/* Verset du jour */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl p-5 mb-4 relative overflow-hidden text-white shadow-elegant min-h-[140px]">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-primary/70" />
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-gold/20 blur-3xl" />
        <div className="relative">
          <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-widest font-semibold text-gold">
            <BookOpen className="w-3.5 h-3.5" /> Verset du jour
          </span>
          {dailyLoading || !dailyContent ? (
            <div className="animate-pulse mt-3 space-y-2">
              <div className="h-4 bg-white/20 rounded w-full"></div>
              <div className="h-4 bg-white/20 rounded w-4/5"></div>
              <div className="h-3 bg-white/20 rounded w-1/4 mt-4"></div>
            </div>
          ) : (
            <>
              <p className="font-serif text-lg italic mt-2 leading-snug">« {dailyContent.verse_text} »</p>
              <p className="text-xs opacity-90 mt-2 font-medium">— {dailyContent.verse_ref}</p>
            </>
          )}
        </div>
      </motion.div>

      {/* Défi hebdo */}
      <div className="rounded-2xl bg-gold-soft border border-gold/30 p-4 mb-5 flex items-start gap-3 min-h-[80px]">
        <div className="w-10 h-10 shrink-0 rounded-full bg-gold text-gold-foreground flex items-center justify-center shadow-soft">
          <Flame className="w-5 h-5" />
        </div>
        <div className="flex-1">
          {dailyLoading || !dailyContent ? (
            <div className="animate-pulse space-y-2 mt-1">
              <div className="h-3 bg-gold/30 rounded w-1/2"></div>
              <div className="h-3 bg-gold/30 rounded w-full"></div>
            </div>
          ) : (
            <>
              <div className="text-[11px] uppercase tracking-wider font-semibold text-gold-foreground/80">{dailyContent.challenge_title}</div>
              <div className="text-sm font-medium mt-0.5">{dailyContent.challenge_text}</div>
            </>
          )}
        </div>
      </div>

      {/* Testimonials couples */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="font-serif text-lg font-semibold">Couples AgapeMeet</h3>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
          {coupleTestimonials.map(c => (
            <div key={c.id} className="shrink-0 w-64 rounded-2xl overflow-hidden bg-card border border-border/50 shadow-soft">
              <div className="aspect-[4/3]"><img src={c.photo} alt={c.names} className="w-full h-full object-cover" /></div>
              <div className="p-3">
                <div className="font-serif font-semibold">{c.names}</div>
                <div className="text-[11px] text-muted-foreground">{c.city}</div>
                <p className="text-xs mt-1.5 leading-relaxed">{c.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════ Composer ═══════════ */}
      <div className="rounded-2xl bg-card border border-border/50 p-3 mb-4 shadow-soft">
        <div className="flex items-start gap-3">
          <Avatar
            src={currentUserProfile?.photos?.[0]}
            name={currentUserProfile?.first_name}
            className="w-9 h-9 text-sm flex-shrink-0 mt-1"
          />
          <div className="flex-1">
            <textarea
              value={composer}
              onChange={e => setComposer(e.target.value)}
              placeholder="Partagez un témoignage, une prière, un verset…"
              rows={2}
              maxLength={800}
              className="w-full resize-none bg-transparent focus:outline-none text-sm placeholder:text-muted-foreground"
            />

            {/* Media preview */}
            {composerMedia && composerMediaPreview && composerMediaType && (
              <ComposerMediaPreview
                file={composerMedia}
                previewUrl={composerMediaPreview}
                mediaType={composerMediaType}
                onRemove={clearMedia}
              />
            )}

            {/* Upload progress */}
            {uploadingMedia && <UploadProgressBar progress={uploadProgress} />}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/40 gap-2">
          <select
            value={composerCategory}
            onChange={e => setComposerCategory(e.target.value)}
            className="text-xs text-muted-foreground bg-transparent border border-border rounded-lg px-2 py-1 focus:outline-none"
          >
            {categories.filter(c => c !== "Tous").map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <div className="flex items-center gap-2">
            {/* Image — la restriction s'annonce AVANT le choix du fichier.
                Laisser sélectionner une photo, afficher l'aperçu, puis
                refuser à la publication, c'est faire porter l'effort à
                l'utilisateur pour lui répondre non ensuite. */}
            <button
              id="composer-image-btn"
              onClick={() => {
                if (!features.communityMedia) {
                  toast.error("Passez Premium pour publier avec des photos", {
                    action: { label: "Voir les formules", onClick: () => navigate({ to: "/abonnement" }) },
                  });
                  return;
                }
                imageInputRef.current?.click();
              }}
              disabled={uploadingMedia || publishing}
              title={features.communityMedia
                ? "Ajouter une image (max 5 MB)"
                : "Passe Premium pour ajouter une photo"}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all disabled:opacity-40 ${
                composerMediaType === "image"
                  ? "border-primary bg-primary/10 text-primary"
                  : !features.communityMedia
                    ? "border-border text-muted-foreground/60"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
              }`}
            >
              {features.communityMedia
                ? <ImageIcon className="w-3.5 h-3.5" />
                : <Lock className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Image</span>
            </button>

            {/* Vidéo */}
            <button
              id="composer-video-btn"
              onClick={() => {
                if (!features.communityVideo) {
                  toast.error("Passez VIP pour publier des vidéos dans la communauté", {
                    action: { label: "Voir les formules", onClick: () => navigate({ to: "/abonnement" }) },
                  });
                  return;
                }
                videoInputRef.current?.click();
              }}
              disabled={uploadingMedia || publishing}
              title={features.communityVideo
                ? "Ajouter une vidéo (max 25 MB)"
                : "Passe VIP pour ajouter une vidéo"}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all disabled:opacity-40 ${
                composerMediaType === "video"
                  ? "border-primary bg-primary/10 text-primary"
                  : !features.communityVideo
                    ? "border-border text-muted-foreground/60"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
              }`}
            >
              {features.communityVideo
                ? <Video className="w-3.5 h-3.5" />
                : <Lock className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Vidéo</span>
            </button>

            {/* Publish button */}
            <button
              id="composer-publish-btn"
              onClick={publish}
              disabled={(!composer.trim() && !composerMedia) || publishing || uploadingMedia}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-sm font-medium shadow-elegant disabled:opacity-40 transition-opacity"
            >
              {publishing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Publier
            </button>
          </div>
        </div>

        {/* Hint */}
        {!composerMedia && (
          <p className="text-[10px] text-muted-foreground/60 mt-1.5 text-right">
            📷 Image max 5 MB · 🎬 Vidéo max 25 MB
          </p>
        )}
      </div>

      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file, "image");
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/x-msvideo"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file, "video");
        }}
      />

      {/* Portée : le fil de tous, ou le sien */}
      <div className="flex rounded-2xl border border-border bg-card p-1 mb-3">
        {([
          { key: "tous", label: "La communauté" },
          { key: "moi", label: "Mes publications" },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setScope(t.key)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
              scope === t.key
                ? "bg-primary text-primary-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.key === "moi" && myStats.count > 0 && (
              <span className="ml-1.5 text-xs opacity-80">({myStats.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Bilan personnel — visible seulement sur son propre fil */}
      {scope === "moi" && myStats.count > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          <MiniStat label="Publications" value={myStats.count} />
          <MiniStat label="J'aime reçus" value={myStats.likes} />
          <MiniStat label="Commentaires" value={myStats.comments} />
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 mb-3 scrollbar-none">
        {categories.map(c => (
          <button key={c} onClick={() => setCategory(c)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all ${
              category === c ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-foreground/80 hover:border-primary/40"}`}>
            {c}
          </button>
        ))}
      </div>
      <div className="flex gap-2 mb-4">
        {sorts.map(s => (
          <button key={s} onClick={() => setSort(s)}
            className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${sort === s ? "bg-secondary text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            {s}
          </button>
        ))}
      </div>

      {/* Feed */}
      {loading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <div key={i} className="rounded-2xl bg-secondary/40 animate-pulse h-36" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-14 px-6 text-center text-sm text-muted-foreground">
          {scope === "moi"
            ? category !== "Tous"
              // Distinguer « rien publié » de « rien dans cette catégorie »
              // évite de croire qu'une publication a disparu.
              ? `Vous n'avez rien publié dans « ${category} ».`
              : "Vous n'avez pas encore publié. Partagez un témoignage, une prière ou un verset qui vous porte."
            : "Aucune publication pour l'instant. Soyez le premier à partager !"}
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((p, i) => (
            <motion.article key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className="rounded-2xl bg-card border border-border/50 shadow-soft overflow-hidden">
              {/* Header */}
              <header className="flex items-center gap-3 p-3">
                {/* Avatar et prénom mènent au profil de l'auteur.
                    Une publication qui touche donne envie de savoir qui
                    l'a écrite — c'est le chemin le plus naturel vers une
                    rencontre, et il n'existait pas : on lisait un beau
                    témoignage sans aucun moyen d'aller plus loin.
                    Le prénom autant que la photo, parce que c'est là que
                    le doigt se pose spontanément.

                    Rien pour soi-même : ouvrir sa propre fiche depuis le
                    fil n'apprend rien, /profil est fait pour cela. */}
                <BoutonAuteur
                  profil={p.profile}
                  soi={p.user_id === currentUserId}
                  onOuvrir={setFicheId}
                >
                  <Avatar
                    src={p.profile?.photos?.[0]}
                    name={p.profile?.first_name}
                    className="w-10 h-10 text-sm"
                  />
                </BoutonAuteur>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <BoutonAuteur
                      profil={p.profile}
                      soi={p.user_id === currentUserId}
                      onOuvrir={setFicheId}
                      className="min-w-0"
                    >
                      <span className="font-semibold text-sm truncate block">{p.profile?.first_name || "Membre"}</span>
                    </BoutonAuteur>
                    {p.profile?.is_verified && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                    <PlanBadge profile={p.profile} compact />
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {timeAgo(p.created_at)} · {p.profile?.city || ""}
                    {p.edited_at && (
                      <span title={`Modifiée le ${new Date(p.edited_at).toLocaleString("fr-FR")}`}>
                        {" "}· modifiée
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-secondary text-primary font-semibold">
                  {p.category}
                </span>

                {/* Actions réservées à l'auteur. Le test porte sur `user_id`
                    et non sur la portée affichée : ses publications
                    apparaissent aussi dans le fil général, où il doit
                    pouvoir les corriger sans changer d'onglet. */}
                {p.user_id === currentUserId && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                        aria-label="Actions sur ma publication"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-xl w-48">
                      <DropdownMenuItem onSelect={() => openEdit(p)} className="cursor-pointer gap-2">
                        <Pencil className="w-4 h-4" /> Modifier
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => sharePost(p.id)}
                        className="cursor-pointer gap-2"
                      >
                        <Share2 className="w-4 h-4" /> Partager
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => setConfirmDelete(p)}
                        className="cursor-pointer gap-2 text-destructive focus:text-destructive focus:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4" /> Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </header>

              {/* Body text */}
              {p.text && (
                <div className="px-4 pb-3 text-sm leading-relaxed whitespace-pre-line">{p.text}</div>
              )}

              {/* Media */}
              {p.video_url && (
                <FeedVideo url={p.video_url} />
              )}
              {!p.video_url && p.image_url && (
                <div className="max-h-96 overflow-hidden">
                  <img src={p.image_url} alt="" className="w-full object-cover" />
                </div>
              )}

              {/* Actions */}
              <footer className="grid grid-cols-4 divide-x divide-border/50 border-t border-border/50">
                <PostAction icon={Heart} label={String(p.likes_count || 0)} active={p.liked} activeClass="text-red-500"
                  onClick={() => toggleLike(p.id)} fillWhenActive />

                <button
                  onClick={() => toggleComments(p.id)}
                  className="py-2.5 flex items-center justify-center gap-1.5 text-xs font-medium hover:bg-secondary/60 transition-colors text-muted-foreground">
                  <MessageCircle className="w-4 h-4" />
                  <span>{p.comments_count || 0}</span>
                  {openComments.has(p.id) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>

                <PostAction icon={Share2} label="Partager" onClick={() => sharePost(p.id)} />

                <PostAction icon={Bookmark} label={p.saved ? "Sauvé" : "Sauver"} active={p.saved}
                  activeClass="text-primary" onClick={() => toggleSave(p.id)} fillWhenActive />
              </footer>

              {/* Report */}
              <div className="flex justify-end px-3 pb-2">
                {currentUserId && currentUserId !== p.user_id && (
                  <button onClick={() => setReportingPostId(p.id)}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors">
                    <Flag className="w-3 h-3" /> Signaler
                  </button>
                )}
              </div>

              {/* Comments */}
              <AnimatePresence>
                {openComments.has(p.id) && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
                    <CommentsSection
                      postId={p.id}
                      currentUserId={currentUserId}
                      currentUserProfile={currentUserProfile}
                      commentsCount={p.comments_count}
                      onCountUpdate={newCount => setPosts(all => all.map(post => post.id !== p.id ? post : { ...post, comments_count: newCount }))}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.article>
          ))}
        </div>
      )}

      {/* Report Modal */}
      <AnimatePresence>
        {reportingPostId && currentUserId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ReportModal postId={reportingPostId} userId={currentUserId} onClose={() => setReportingPostId(null)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modification ───────────────────────────────────────── */}
      <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif">Modifier ma publication</DialogTitle>
            <DialogDescription>
              La mention « modifiée » apparaîtra sous votre nom.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Catégorie
              </label>
              <select
                value={editCategory}
                onChange={e => setEditCategory(e.target.value)}
                className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm"
              >
                {categories.filter(c => c !== "Tous").map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Texte
              </label>
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                rows={6}
                className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* Le média se retire, mais ne se remplace pas ici : téléverser
                un nouveau fichier demanderait de rejouer tout le contrôle de
                formule et de taille du composeur. Mieux vaut inviter à
                republier que proposer un chemin à demi fiable. */}
            {(editing?.image_url || editing?.video_url) && (
              <label className="flex items-start gap-2.5 rounded-xl border border-border p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editRemoveMedia}
                  onChange={e => setEditRemoveMedia(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  Retirer {editing?.video_url ? "la vidéo" : "la photo"}
                  <span className="block text-[11px] text-muted-foreground mt-0.5">
                    Pour en joindre une autre, supprimez cette publication et republiez.
                  </span>
                </span>
              </label>
            )}
          </div>

          <DialogFooter className="gap-2">
            <button
              onClick={() => setEditing(null)}
              className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary"
            >
              Annuler
            </button>
            <button
              onClick={saveEdit}
              disabled={savingEdit}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
            >
              {savingEdit && <Loader2 className="w-4 h-4 animate-spin" />}
              Enregistrer
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Suppression ────────────────────────────────────────── */}
      <Dialog open={!!confirmDelete} onOpenChange={o => !o && setConfirmDelete(null)}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Supprimer cette publication ?</DialogTitle>
            <DialogDescription>
              Elle disparaîtra du fil, avec ses commentaires et ses « j'aime ».
              Cette action est définitive.
            </DialogDescription>
          </DialogHeader>

          {confirmDelete && (
            <p className="text-sm text-muted-foreground line-clamp-3 rounded-xl bg-secondary/50 p-3 italic">
              « {confirmDelete.text} »
            </p>
          )}

          <DialogFooter className="gap-2">
            <button
              onClick={() => setConfirmDelete(null)}
              className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary"
            >
              Annuler
            </button>
            <button
              onClick={removePost}
              disabled={deleting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold disabled:opacity-50"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Supprimer
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {ficheId && <FicheProfil userId={ficheId} onClose={() => setFicheId(null)} />}
    </div>
  );
}

// ─── Auteur cliquable ─────────────────────────────────────────────────────────
/**
 * Enveloppe l'avatar ou le prénom d'un auteur.
 *
 * Rend un `<button>` quand il y a quelque chose à ouvrir, un simple
 * `<span>` sinon — pour soi-même, ou pour une publication dont l'auteur
 * a supprimé son compte. Un bouton qui ne fait rien est pire qu'un texte
 * inerte : on l'essaie, et l'on conclut que l'application est cassée.
 */
function BoutonAuteur({
  profil, soi, onOuvrir, className = "", children,
}: {
  profil: CommunityPost["profile"];
  soi: boolean;
  onOuvrir: (userId: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  if (!profil?.id || soi) {
    return <span className={`shrink-0 ${className}`}>{children}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => onOuvrir(profil.id)}
      aria-label={`Voir le profil de ${profil.first_name || "ce membre"}`}
      className={`shrink-0 text-left rounded-full hover:opacity-80 active:scale-95 transition-all ${className}`}
    >
      {children}
    </button>
  );
}

// ─── Statistique compacte ─────────────────────────────────────────────────────
function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-secondary/50 py-2.5 text-center">
      <div className="font-serif text-lg font-bold leading-none">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

// ─── Post Action Button ───────────────────────────────────────────────────────
function PostAction({ icon: Icon, label, onClick, active, activeClass = "", fillWhenActive }: {
  icon: typeof Heart; label: string; onClick: () => void;
  active?: boolean; activeClass?: string; fillWhenActive?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={`py-2.5 flex items-center justify-center gap-1.5 text-xs font-medium hover:bg-secondary/60 transition-colors ${active ? activeClass : "text-muted-foreground"}`}>
      <Icon className="w-4 h-4" fill={active && fillWhenActive ? "currentColor" : "none"} />
      {label && <span>{label}</span>}
    </button>
  );
}

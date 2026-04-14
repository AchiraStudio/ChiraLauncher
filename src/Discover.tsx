import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./lib/supabase";
import { useProfileStore } from "./store/profileStore";
import {
    Trophy, Activity, User, Sparkles, MessageSquare, Loader2,
    Image as ImageIcon, Video, Send, Pin, Megaphone, CloudOff,
    ShieldAlert, X, Search, Link2, Heart, Share2, Gamepad2, Trash2,
    Bold, Italic, Underline, Heading1, Heading2, Quote, Code, Lock
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "./lib/utils";
import { ConnectButton } from "./components/ui/ConnectButton";

interface Profile {
    id: string;
    username: string;
    avatar_url: string | null;
    xp: number;
    role: 'user' | 'admin';
}

interface FeedItem {
    id: string;
    user_id: string;
    event_type: string;
    game_title: string;
    details: string | null;
    content_text: string | null;
    media_url: string | null;
    media_type: 'image' | 'video' | 'youtube' | 'link' | null;
    is_pinned: boolean;
    xp_gained: number;
    created_at: string;
    profiles: Profile | null;
}

interface RecentChat {
    contact_id: string;
    last_message: string;
    timestamp: number;
    profile?: Profile;
}

function computeLevel(xp: number) {
    let level = 1;
    while (true) {
        const nextXp = Math.pow(level, 2) * 50;
        if (xp >= nextXp) {
            level++;
        } else {
            break;
        }
    }
    return level;
}

const getYouTubeId = (url: string) => {
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
};

export function Discover() {
    const navigate = useNavigate();
    const { profile: localProfile } = useProfileStore();

    const [leaderboard, setLeaderboard] = useState<Profile[]>([]);
    const [feed, setFeed] = useState<FeedItem[]>([]);
    const [recentChats, setRecentChats] = useState<RecentChat[]>([]);
    const [isFetching, setIsFetching] = useState(true);

    const [postText, setPostText] = useState("");
    const [isPosting, setIsPosting] = useState(false);
    const [pinPost, setPinPost] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);

    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [mediaPreview, setMediaPreview] = useState<string | null>(null);
    const [mediaType, setMediaType] = useState<'image' | 'video' | 'youtube' | 'link' | null>(null);

    const [showLinkInput, setShowLinkInput] = useState(false);
    const [linkUrl, setLinkUrl] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textAreaRef = useRef<HTMLTextAreaElement>(null);

    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<Profile[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        let isMounted = true;
        if (!localProfile?.supabase_user_id) {
            setIsFetching(false);
            return;
        }

        const fetchData = async () => {
            try {
                // Fetch Leaderboard
                const { data: leaders } = await supabase
                    .from("profiles")
                    .select("id, username, avatar_url, xp, role")
                    .order("xp", { ascending: false })
                    .limit(10);

                if (leaders && isMounted) {
                    setLeaderboard(leaders as Profile[]);
                    const me = leaders.find(l => l.id === localProfile?.supabase_user_id);
                    if (me && me.role === 'admin') setIsAdmin(true);
                }

                // Fetch Feed
                const { data: activities } = await supabase
                    .from("activity_feed")
                    .select("*, profiles(id, username, avatar_url, xp, role)")
                    .order("is_pinned", { ascending: false })
                    .order("created_at", { ascending: false })
                    .limit(50);

                if (activities && isMounted) setFeed(activities as FeedItem[]);

                // Fetch Recent Chats from local SQLite, then hydrate with Supabase profiles
                const chats = await invoke<RecentChat[]>("get_recent_chats");
                if (chats.length > 0 && isMounted) {
                    const contactIds = chats.map(c => c.contact_id);
                    const { data: chatProfiles } = await supabase
                        .from("profiles")
                        .select("id, username, avatar_url, role")
                        .in("id", contactIds);

                    const hydratedChats = chats.map(c => ({
                        ...c,
                        profile: chatProfiles?.find(p => p.id === c.contact_id) as Profile | undefined
                    }));
                    setRecentChats(hydratedChats);
                }

            } catch (e) {
                console.error("Failed to fetch discover data:", e);
            } finally {
                if (isMounted) setIsFetching(false);
            }
        };

        fetchData();

        const channel = supabase
            .channel("public:activity_feed")
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_feed" }, async (payload) => {
                try {
                    const { data: userData } = await supabase
                        .from("profiles")
                        .select("*")
                        .eq("id", payload.new.user_id)
                        .single();

                    if (userData && isMounted) {
                        const newEvent = { ...payload.new, profiles: userData } as FeedItem;
                        setFeed((prev) => {
                            const pinned = prev.filter(p => p.is_pinned);
                            const unpinned = prev.filter(p => !p.is_pinned);
                            if (newEvent.is_pinned) return [newEvent, ...pinned, ...unpinned].slice(0, 50);
                            return [...pinned, newEvent, ...unpinned].slice(0, 50);
                        });
                    }
                } catch (e) {
                    console.error("Failed to process new activity:", e);
                }
            })
            .on("postgres_changes", { event: "DELETE", schema: "public", table: "activity_feed" }, (payload) => {
                setFeed((prev) => prev.filter(item => item.id !== payload.old.id));
            })
            .subscribe();

        return () => {
            isMounted = false;
            supabase.removeChannel(channel);
        };
    }, [localProfile?.supabase_user_id]);

    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            return;
        }

        const delayDebounceFn = setTimeout(async () => {
            setIsSearching(true);
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('id, username, avatar_url, xp, role')
                    .ilike('username', `%${searchQuery}%`)
                    .limit(5);

                if (error) throw error;
                if (data) setSearchResults(data as Profile[]);
            } catch (e) {
                console.error("Search failed:", e);
            } finally {
                setIsSearching(false);
            }
        }, 400);

        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery]);

    const insertFormat = (prefix: string, suffix: string, defaultText: string = "text") => {
        const textarea = textAreaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = postText;

        const before = text.substring(0, start);
        const selected = text.substring(start, end);
        const after = text.substring(end);

        const contentToWrap = selected || defaultText;
        const newText = `${before}${prefix}${contentToWrap}${suffix}${after}`;
        setPostText(newText);

        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + prefix.length, start + prefix.length + contentToWrap.length);
        }, 0);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 100 * 1024 * 1024) {
            toast.error("File exceeds 100MB limit.");
            return;
        }

        if (type === 'video') {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.onloadedmetadata = () => {
                window.URL.revokeObjectURL(video.src);
                if (video.duration > 31) {
                    toast.error("Videos must be 30 seconds or less.");
                    return;
                }
                finalizeFileSelection(file, type, URL.createObjectURL(file));
            }
            video.src = URL.createObjectURL(file);
        } else {
            finalizeFileSelection(file, type, URL.createObjectURL(file));
        }
    };

    const handleAttachLink = () => {
        if (!linkUrl.trim()) return;

        const ytId = getYouTubeId(linkUrl);
        if (ytId) {
            finalizeFileSelection(null, 'youtube', ytId);
        } else if (linkUrl.match(/\.(jpeg|jpg|gif|png|webp)$/i)) {
            finalizeFileSelection(null, 'image', linkUrl);
        } else if (linkUrl.match(/\.(mp4|webm|ogg)$/i)) {
            finalizeFileSelection(null, 'video', linkUrl);
        } else {
            finalizeFileSelection(null, 'link', linkUrl);
        }

        setLinkUrl("");
        setShowLinkInput(false);
    };

    const finalizeFileSelection = (file: File | null, type: 'image' | 'video' | 'youtube' | 'link', previewUrl: string) => {
        setSelectedFile(file);
        setMediaType(type);
        setMediaPreview(previewUrl);
    };

    const clearMedia = () => {
        setSelectedFile(null);
        setMediaType(null);
        if (mediaPreview && !mediaPreview.startsWith('http') && mediaType !== 'youtube') {
            URL.revokeObjectURL(mediaPreview);
        }
        setMediaPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleCreatePost = async () => {
        if (!postText.trim() && !mediaPreview) return;
        if (!localProfile?.supabase_user_id) return;

        setIsPosting(true);
        let finalMediaUrl = mediaPreview;

        try {
            if (selectedFile) {
                const fileExt = selectedFile.name.split('.').pop();
                const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
                const filePath = `${localProfile.supabase_user_id}/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('media')
                    .upload(filePath, selectedFile);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filePath);
                finalMediaUrl = publicUrl;
            }

            const formattedHTML = postText.trim().replace(/\n/g, '<br/>');

            const { error } = await supabase.from("activity_feed").insert({
                user_id: localProfile.supabase_user_id,
                event_type: "post",
                game_title: "Global Grid",
                details: "",
                content_text: formattedHTML,
                is_pinned: isAdmin ? pinPost : false,
                media_url: finalMediaUrl,
                media_type: mediaType,
            });

            if (error) throw error;

            setPostText("");
            setPinPost(false);
            clearMedia();
            toast.success("Transmission broadcasted.");
        } catch (e: any) {
            toast.error("Failed to broadcast", { description: e.message });
        } finally {
            setIsPosting(false);
        }
    };

    const handleDeletePost = async (postId: string) => {
        if (!confirm("Are you sure you want to purge this transmission?")) return;
        try {
            const { error } = await supabase.from('activity_feed').delete().eq('id', postId);
            if (error) throw error;
            setFeed(feed.filter(f => f.id !== postId));
            toast.success("Transmission purged.");
        } catch (e: any) {
            toast.error("Failed to purge", { description: e.message });
        }
    };

    return (
        <div className="min-h-full w-full bg-background relative overflow-y-auto overflow-x-hidden custom-scrollbar">
            <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-blue-600/10 blur-[150px] rounded-full pointer-events-none" />
            <div className="absolute top-[40%] left-[-10%] w-[500px] h-[500px] bg-purple-600/5 blur-[150px] rounded-full pointer-events-none" />

            <div className="relative z-10 px-10 md:px-14 pt-14 pb-32 max-w-[1600px] mx-auto w-full grid grid-cols-1 xl:grid-cols-12 gap-12">

                <div className="xl:col-span-8 flex flex-col gap-6">

                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                            <Activity className="text-accent" size={28} />
                            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">The Grid</h2>
                        </div>
                    </div>

                    {localProfile?.is_cloud_synced ? (
                        <div className="bg-[#0f1423]/80 backdrop-blur-3xl border border-white/[0.08] rounded-[2rem] p-6 shadow-2xl flex flex-col relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent to-purple-500" />

                            <div className="flex items-center gap-1 mb-4 pb-3 border-b border-white/[0.05] ml-14">
                                <button onClick={() => insertFormat("<b>", "</b>")} className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded transition-colors" title="Bold"><Bold size={16} /></button>
                                <button onClick={() => insertFormat("<i>", "</i>")} className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded transition-colors" title="Italic"><Italic size={16} /></button>
                                <button onClick={() => insertFormat("<u>", "</u>")} className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded transition-colors" title="Underline"><Underline size={16} /></button>
                                <div className="w-px h-4 bg-white/10 mx-2" />
                                <button onClick={() => insertFormat("<h1>", "</h1>", "Heading")} className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded transition-colors" title="Large Header"><Heading1 size={16} /></button>
                                <button onClick={() => insertFormat("<h2>", "</h2>", "Subheading")} className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded transition-colors" title="Medium Header"><Heading2 size={16} /></button>
                                <div className="w-px h-4 bg-white/10 mx-2" />
                                <button onClick={() => insertFormat("<blockquote>", "</blockquote>", "Quote")} className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded transition-colors" title="Quote Block"><Quote size={16} /></button>
                                <button onClick={() => insertFormat("<pre><code>", "</code></pre>", "Code")} className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded transition-colors" title="Code Block"><Code size={16} /></button>
                            </div>

                            <div className="flex gap-4">
                                <div className="w-10 h-10 rounded-full bg-black/50 overflow-hidden shrink-0 border border-white/10">
                                    {localProfile.avatar_url ? <img src={localProfile.avatar_url} className="w-full h-full object-cover" /> : <User className="w-full h-full p-2 text-white/20" />}
                                </div>
                                <textarea
                                    ref={textAreaRef}
                                    value={postText}
                                    onChange={(e) => setPostText(e.target.value)}
                                    placeholder="Format your transmission using the tools above..."
                                    className="w-full bg-transparent text-[15px] text-white placeholder:text-white/30 outline-none resize-none pt-1 h-20 custom-scrollbar"
                                />
                            </div>

                            {mediaPreview && (
                                <div className="relative w-fit ml-14 mt-2 border border-white/10 rounded-2xl overflow-hidden bg-black/50 shadow-inner">
                                    <button onClick={clearMedia} className="absolute top-3 right-3 bg-black/60 hover:bg-red-500 p-2 rounded-xl text-white transition-all z-10 backdrop-blur-md">
                                        <X size={14} />
                                    </button>
                                    {mediaType === 'image' && <img src={mediaPreview} className="max-h-64 object-contain" />}
                                    {mediaType === 'video' && <video src={mediaPreview} className="max-h-64" controls />}
                                    {mediaType === 'youtube' && (
                                        <img src={`https://img.youtube.com/vi/${mediaPreview}/hqdefault.jpg`} className="max-h-64 object-cover" />
                                    )}
                                    {mediaType === 'link' && (
                                        <div className="px-6 py-8 flex items-center gap-3 text-accent bg-accent/5"><Link2 size={24} /> {mediaPreview}</div>
                                    )}
                                </div>
                            )}

                            <AnimatePresence>
                                {showLinkInput && !mediaPreview && (
                                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="ml-14 flex items-center gap-2 mt-4">
                                        <input
                                            type="text" value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                                            placeholder="Paste URL (YouTube, Images, Web)..."
                                            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-accent"
                                        />
                                        <button onClick={handleAttachLink} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-xl font-bold text-xs transition-colors">Add Media</button>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/[0.05] ml-14">
                                <div className="flex items-center gap-1">
                                    <input type="file" accept="image/*" className="hidden" id="img-upload" ref={fileInputRef} onChange={(e) => handleFileSelect(e, 'image')} />
                                    <label htmlFor="img-upload" className="flex items-center gap-2 px-3 py-2 text-white/50 hover:text-accent hover:bg-accent/10 rounded-xl transition-all cursor-pointer text-xs font-bold">
                                        <ImageIcon size={16} /> Image
                                    </label>

                                    <input type="file" accept="video/*" className="hidden" id="vid-upload" onChange={(e) => handleFileSelect(e, 'video')} />
                                    <label htmlFor="vid-upload" className="flex items-center gap-2 px-3 py-2 text-white/50 hover:text-accent hover:bg-accent/10 rounded-xl transition-all cursor-pointer text-xs font-bold">
                                        <Video size={16} /> Video
                                    </label>

                                    <button onClick={() => setShowLinkInput(!showLinkInput)} className="flex items-center gap-2 px-3 py-2 text-white/50 hover:text-accent hover:bg-accent/10 rounded-xl transition-all text-xs font-bold">
                                        <Link2 size={16} /> Link Embed
                                    </button>

                                    {isAdmin && (
                                        <label className="flex items-center gap-2 ml-4 cursor-pointer text-red-400/60 hover:text-red-400 bg-red-500/5 hover:bg-red-500/10 px-3 py-2 rounded-xl transition-colors">
                                            <input type="checkbox" checked={pinPost} onChange={(e) => setPinPost(e.target.checked)} className="accent-red-500 w-3.5 h-3.5" />
                                            <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"><Pin size={12} /> Pin</span>
                                        </label>
                                    )}
                                </div>
                                <button
                                    onClick={handleCreatePost}
                                    disabled={isPosting || (!postText.trim() && !mediaPreview)}
                                    className="bg-accent hover:brightness-110 disabled:bg-white/10 disabled:text-white/30 text-black px-8 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-accent/20"
                                >
                                    {isPosting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                    Broadcast
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-blue-900/10 border border-blue-500/20 rounded-[2rem] p-10 text-center flex flex-col items-center justify-center gap-3 shadow-inner">
                            <CloudOff className="text-blue-400 mb-2" size={32} />
                            <p className="text-blue-300/80 text-sm font-bold uppercase tracking-widest">Read-Only Mode</p>
                            <p className="text-white/40 text-xs max-w-md">Connect your identity to access the posting grid, upload media, and encrypt communications.</p>
                            <ConnectButton variant="primary" className="mt-4" />
                        </div>
                    )}

                    <div className="space-y-6">
                        {isFetching ? (
                            <div className="flex justify-center py-20"><Loader2 className="animate-spin text-accent w-10 h-10" /></div>
                        ) : feed.length === 0 ? (
                            <div className="text-center text-white/30 py-20 font-bold uppercase tracking-widest text-xs border border-dashed border-white/10 rounded-3xl">No Recent Activity</div>
                        ) : (
                            <AnimatePresence>
                                {feed.map((item) => {
                                    if (!item.profiles) return null;

                                    const isAchievement = item.event_type === 'achievement';
                                    const isPlaytime = item.event_type === 'playtime';

                                    const isAuthor = localProfile?.supabase_user_id === item.user_id;
                                    const canDelete = isAuthor || isAdmin;

                                    return (
                                        <motion.div
                                            key={item.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                            className={cn(
                                                "backdrop-blur-3xl rounded-[2rem] p-6 shadow-2xl flex flex-col border transition-all hover:bg-white/[0.02]",
                                                item.is_pinned ? "bg-red-500/5 border-red-500/30 shadow-[0_0_40px_rgba(239,68,68,0.15)]" : "bg-[#0a0f18]/80 border-white/[0.08]"
                                            )}
                                        >
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-black/50 border border-white/10 overflow-hidden shrink-0 relative cursor-pointer" onClick={() => navigate(`/messages/${item.user_id}`)}>
                                                        {item.profiles.avatar_url ? <img src={item.profiles.avatar_url} className="w-full h-full object-cover" /> : <User className="w-full h-full p-2 text-white/20" />}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-white text-[15px]">{item.profiles.username}</span>
                                                            {item.profiles.role === 'admin' && <ShieldAlert size={12} className="text-red-400" />}
                                                            {item.is_pinned && (
                                                                <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest bg-red-500 text-white px-1.5 py-0.5 rounded shadow-md">
                                                                    <Megaphone size={8} /> Official
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 text-[10px] tracking-wide font-medium mt-0.5">
                                                            <span className="text-white/40">
                                                                {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                                                            </span>

                                                            {canDelete && (
                                                                <>
                                                                    <span className="text-white/20">•</span>
                                                                    <button
                                                                        onClick={() => handleDeletePost(item.id)}
                                                                        className="text-red-500/50 hover:text-red-400 transition-colors flex items-center gap-1"
                                                                    >
                                                                        <Trash2 size={10} /> Delete
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {(isAchievement || isPlaytime) && (
                                                    <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
                                                        <Gamepad2 size={12} className="text-white/40" />
                                                        <span className="text-[10px] font-bold text-white/60 tracking-wider truncate max-w-[150px]">{item.game_title}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {item.event_type === 'post' ? (
                                                <div
                                                    className="text-[15px] leading-relaxed mb-4 text-white/90 [&>b]:font-bold [&>i]:italic [&>u]:underline [&>h1]:text-2xl [&>h1]:font-black [&>h1]:mb-3 [&>h2]:text-xl [&>h2]:font-bold [&>h2]:mb-2 [&>blockquote]:border-l-4 [&>blockquote]:border-accent [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:text-white/60 [&>blockquote]:my-3 [&>pre]:bg-black/50 [&>pre]:p-4 [&>pre]:rounded-xl [&>pre]:font-mono [&>pre]:text-[13px] [&>pre]:text-blue-300 [&>pre]:my-3 [&>a]:text-accent hover:[&>a]:underline [&>img]:rounded-xl [&>img]:max-h-[400px] [&>img]:object-contain [&>img]:mt-3"
                                                    dangerouslySetInnerHTML={{ __html: item.content_text || "" }}
                                                />
                                            ) : (
                                                <p className="text-[15px] leading-relaxed whitespace-pre-wrap mb-4 text-white/60 italic font-medium">
                                                    {item.details}
                                                </p>
                                            )}

                                            {item.media_url && (
                                                <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/50 mb-4 shadow-inner">
                                                    {item.media_type === 'image' && (
                                                        <img src={item.media_url} alt="Post Attachment" className="w-full max-h-[600px] object-cover" loading="lazy" />
                                                    )}
                                                    {item.media_type === 'video' && (
                                                        <video src={item.media_url} className="w-full max-h-[600px]" controls preload="metadata" />
                                                    )}
                                                    {item.media_type === 'youtube' && (
                                                        <iframe
                                                            className="w-full aspect-video"
                                                            src={`https://www.youtube.com/embed/${item.media_url}`}
                                                            allowFullScreen
                                                        />
                                                    )}
                                                    {item.media_type === 'link' && (
                                                        <a href={item.media_url} target="_blank" rel="noreferrer" className="flex items-center gap-4 p-5 hover:bg-white/5 transition-colors">
                                                            <div className="w-12 h-12 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
                                                                <Link2 size={20} />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-white font-bold text-sm">External Link</p>
                                                                <p className="text-white/40 text-xs truncate mt-0.5">{item.media_url}</p>
                                                            </div>
                                                        </a>
                                                    )}
                                                </div>
                                            )}

                                            <div className="flex items-center justify-between pt-4 border-t border-white/[0.05]">
                                                <div className="flex items-center gap-1">
                                                    <button className="flex items-center gap-2 text-white/40 hover:text-accent hover:bg-accent/10 px-3 py-1.5 rounded-lg transition-colors text-xs font-bold">
                                                        <Heart size={16} /> <span className="opacity-0 group-hover:opacity-100 transition-opacity">Like</span>
                                                    </button>
                                                    <button className="flex items-center gap-2 text-white/40 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors text-xs font-bold">
                                                        <MessageSquare size={16} /> <span className="opacity-0 group-hover:opacity-100 transition-opacity">Reply</span>
                                                    </button>
                                                </div>

                                                <div className="flex items-center gap-3">
                                                    {item.xp_gained > 0 && (
                                                        <div className="flex items-center gap-1.5 bg-accent/10 border border-accent/20 px-2.5 py-1 rounded-md">
                                                            <Sparkles size={10} className="text-accent" />
                                                            <span className="text-accent text-[9px] font-black tracking-widest uppercase">+{item.xp_gained} XP</span>
                                                        </div>
                                                    )}
                                                    <button className="text-white/30 hover:text-white p-1.5 rounded-lg transition-colors">
                                                        <Share2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        )}
                    </div>
                </div>

                <div className="xl:col-span-4 flex flex-col gap-6 relative">
                    <div className="sticky top-14 space-y-8">

                        {localProfile?.is_cloud_synced && (
                            <div className="relative z-30">
                                <div className="relative group">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 group-focus-within:text-accent transition-colors" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Find Pilot by Callsign..."
                                        className="w-full bg-[#0a0f18]/90 backdrop-blur-3xl border border-white/[0.08] rounded-2xl pl-11 pr-10 py-4 text-sm text-white outline-none focus:border-accent/50 transition-all shadow-xl placeholder:text-white/30"
                                    />
                                    {isSearching ? (
                                        <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-accent animate-spin" />
                                    ) : searchQuery && (
                                        <button onClick={() => setSearchQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors">
                                            <X size={16} />
                                        </button>
                                    )}
                                </div>

                                <AnimatePresence>
                                    {searchQuery.trim() && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className="absolute top-full left-0 right-0 mt-2 bg-[#0a0f18]/95 backdrop-blur-3xl border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden"
                                        >
                                            {searchResults.length === 0 && !isSearching ? (
                                                <div className="p-6 text-center text-white/30 text-xs font-bold uppercase tracking-widest">No pilots found</div>
                                            ) : (
                                                searchResults.map(user => (
                                                    <div key={user.id} className="flex items-center gap-4 p-4 hover:bg-white/5 transition-colors border-b border-white/[0.04] last:border-0 group">
                                                        <div className="w-10 h-10 rounded-xl bg-black/50 overflow-hidden border border-white/10 relative shrink-0">
                                                            {user.avatar_url ? <img src={user.avatar_url} className="w-full h-full object-cover" /> : <User className="w-full h-full p-2 text-white/20" />}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                                                                {user.username}
                                                                {user.role === 'admin' && <ShieldAlert size={10} className="text-red-400" />}
                                                            </p>
                                                            <p className="text-[10px] text-accent font-mono font-bold tracking-widest">{user.xp.toLocaleString()} XP</p>
                                                        </div>
                                                        {user.id !== localProfile.supabase_user_id && (
                                                            <button
                                                                onClick={() => navigate(`/messages/${user.id}`)}
                                                                className="px-3 py-1.5 rounded-lg bg-accent/10 hover:bg-accent text-accent hover:text-black border border-accent/20 flex items-center gap-2 transition-all text-[9px] font-black uppercase tracking-widest shrink-0"
                                                            >
                                                                <MessageSquare size={12} /> Comm
                                                            </button>
                                                        )}
                                                    </div>
                                                ))
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}

                        {localProfile?.is_cloud_synced && recentChats.length > 0 && (
                            <div>
                                <div className="flex items-center gap-3 mb-4">
                                    <Lock className="text-green-400" size={18} />
                                    <h2 className="text-xl font-black text-white uppercase tracking-tighter">Active Comms</h2>
                                </div>
                                <div className="bg-[#0a0f18]/90 backdrop-blur-3xl border border-white/[0.08] rounded-[2rem] p-3 shadow-2xl flex flex-col gap-1">
                                    {recentChats.map(chat => (
                                        <button
                                            key={chat.contact_id}
                                            onClick={() => navigate(`/messages/${chat.contact_id}`)}
                                            className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-white/5 transition-all text-left group"
                                        >
                                            <div className="w-10 h-10 rounded-xl bg-black/50 overflow-hidden border border-white/10 relative shrink-0">
                                                {chat.profile?.avatar_url ? <img src={chat.profile.avatar_url} className="w-full h-full object-cover" /> : <User className="w-full h-full p-2 text-white/20" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-center mb-0.5">
                                                    <span className="text-sm font-bold text-white truncate group-hover:text-green-400 transition-colors">
                                                        {chat.profile?.username || "Unknown"}
                                                    </span>
                                                    <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest shrink-0 ml-2">
                                                        {formatDistanceToNow(chat.timestamp, { addSuffix: true })}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-white/50 truncate font-mono">{chat.last_message}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div>
                            <div className="flex items-center gap-3 mb-4">
                                <Trophy className="text-yellow-400" size={20} />
                                <h2 className="text-xl font-black text-white uppercase tracking-tighter">Global Ranks</h2>
                            </div>
                            <div className="bg-[#0a0f18]/90 backdrop-blur-3xl border border-white/[0.08] rounded-[2rem] p-5 shadow-2xl space-y-1">
                                {isFetching ? (
                                    <div className="flex justify-center py-10"><Loader2 className="animate-spin text-accent" /></div>
                                ) : leaderboard.length === 0 ? (
                                    <div className="text-center text-white/30 py-10 font-bold uppercase tracking-widest text-xs">No Data Available</div>
                                ) : leaderboard.map((user, idx) => (
                                    <div key={user.id} className="flex items-center gap-4 p-3 rounded-2xl hover:bg-white/5 transition-colors group border border-transparent hover:border-white/10">
                                        <div className="w-6 text-center font-black text-lg text-white/20 group-hover:text-accent transition-colors">
                                            {idx + 1}
                                        </div>
                                        <div className="w-10 h-10 rounded-xl bg-black/50 overflow-hidden border border-white/10 relative shrink-0">
                                            {user.avatar_url ? <img src={user.avatar_url} className="w-full h-full object-cover" /> : <User className="w-full h-full p-2 text-white/20" />}
                                            {user.role === 'admin' && (
                                                <div className="absolute -bottom-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-lg">
                                                    <ShieldAlert size={10} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-white truncate flex items-center gap-2">
                                                {user.username}
                                                {user.role === 'admin' && <span className="text-[8px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded uppercase tracking-widest">Admin</span>}
                                            </p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-[8px] font-bold text-white/50 uppercase tracking-widest">LVL {computeLevel(user.xp)}</span>
                                                <p className="text-[10px] text-accent font-mono font-bold tracking-widest">{user.xp.toLocaleString()} XP</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
}
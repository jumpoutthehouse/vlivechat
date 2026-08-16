import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  MessageSquare,
  MessageSquareDashed,
  MessageSquareCode,
  UserCheck,
  Inbox,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  XCircle,
  Building,
  History,
  Bot,
  Zap,
  Lock,
  Tag,
  ArrowDown,
} from "lucide-react";
import useChatStore from "../store/chatStore";
import api from "../api";
import BrandSwitcherDropdown from "../components/BrandSwitcherDropdown";
import toast from "react-hot-toast";
import { formatDistanceToNow, format } from "date-fns";
import { id } from "date-fns/locale";
import VisitorInfoPanel from "../components/VisitorInfoPanel";
import ConfirmModal from "../components/ConfirmModal";
import Avatar from "../components/Avatar";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
const API_BASE   = import.meta.env.VITE_SOCKET_URL || SERVER_URL;

function getFileUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${SERVER_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

function safeFormat(dateVal, fmtStr, fallback = "") {
  if (!dateVal) return fallback;
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return fallback;
    return format(d, fmtStr);
  } catch {
    return fallback;
  }
}

function formatDateHeader(dateStr) {
  if (!dateStr) return "Started";
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const timeStr = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `Started - Today ${timeStr}`;
  return `Started - ${d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })} ${timeStr}`;
}

function safeFormatDistanceToNow(dateVal, options, fallback = "") {
  if (!dateVal) return fallback;
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return fallback;
    const now = new Date();
    const diffSec = Math.floor((now - d) / 1000);
    if (isNaN(diffSec) || diffSec < 0) return "Baru saja";
    if (diffSec < 35) return "Baru saja";
    if (diffSec < 60) return "1m";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}j`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}h`;
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  } catch {
    return fallback;
  }
}

function parseUA(uaStr) {
  if (!uaStr) return { os: "Android (10)", browser: "Chrome (150.0.0.0)", ua: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36" };
  
  let os = "Windows / PC";
  if (/android/i.test(uaStr)) {
    const match = uaStr.match(/android\s+([\d.]+)/i);
    os = `Android${match ? ` (${match[1]})` : ""}`;
  } else if (/iphone|ipad|ipod/i.test(uaStr)) {
    const match = uaStr.match(/os\s+([\d_]+)/i);
    os = `iOS${match ? ` (${match[1].replace(/_/g, ".")})` : ""}`;
  } else if (/mac os x/i.test(uaStr)) {
    os = "macOS";
  } else if (/windows/i.test(uaStr)) {
    if (/nt 10.0/i.test(uaStr)) os = "Windows 10/11";
    else os = "Windows";
  } else if (/linux/i.test(uaStr)) {
    os = "Linux";
  }

  let browser = "Chrome";
  if (/edg\/([\d.]+)/i.test(uaStr)) {
    const match = uaStr.match(/edg\/([\d.]+)/i);
    browser = `Edge (${match[1]})`;
  } else if (/chrome\/([\d.]+)/i.test(uaStr)) {
    const match = uaStr.match(/chrome\/([\d.]+)/i);
    browser = `Chrome (${match[1]})`;
  } else if (/firefox\/([\d.]+)/i.test(uaStr)) {
    const match = uaStr.match(/firefox\/([\d.]+)/i);
    browser = `Firefox (${match[1]})`;
  } else if (/safari\/([\d.]+)/i.test(uaStr) && !/chrome/i.test(uaStr)) {
    const match = uaStr.match(/version\/([\d.]+)/i);
    browser = `Safari${match ? ` (${match[1]})` : ""}`;
  }

  return { os, browser, ua: uaStr };
}

function getVisitorInitial(conv) {
  if (!conv) return "P";
  let preData = conv.prechat_data;
  if (typeof preData === "string") {
    try { preData = JSON.parse(preData); } catch {}
  }
  const name = conv.visitor_name || preData?.username || preData?.name || preData?.email;
  if (name && typeof name === "string" && name.trim().length > 0) {
    return name.trim().charAt(0).toUpperCase();
  }
  if (conv.visitor_id) {
    const cleanId = String(conv.visitor_id).replace(/^v_/, "");
    if (cleanId.length > 0) {
      return cleanId.charAt(0).toUpperCase();
    }
  }
  return "P";
}

function StatusDot({ conv, status }) {
  const cStatus = conv?.status || status;
  const isResolved = cStatus === "resolved";
  const isMissed   = cStatus === "missed";
  const isBot      = (cStatus === "open" || cStatus === "queued") && !conv?.assigned_agent_id && conv?.flow_mode !== "agent";
  const isWaiting  = (cStatus === "open" || cStatus === "queued") && (conv?.flow_mode === "agent") && !conv?.assigned_agent_id;
  const isAssigned = (cStatus === "assigned" || cStatus === "active" || !!conv?.assigned_agent_id) && !isResolved && !isMissed;

  let color = "bg-slate-600";
  let label = "⚫ Selesai";

  if (isResolved) {
    color = "bg-slate-500";
    label = "⚫ Selesai";
  } else if (isMissed) {
    color = "bg-red-500";
    label = "🔴 Terlewat";
  } else if (isBot) {
    color = "bg-blue-400";
    label = "🤖 Otomatis (Bot)";
  } else if (isWaiting) {
    color = "bg-yellow-400";
    label = "🟡 Menunggu CS";
  } else if (isAssigned) {
    color = "bg-emerald-400";
    label = "🟢 CS Aktif";
  }

  return (
    <span className="relative group flex items-center">
      <span className={`w-2.5 h-2.5 rounded-full ${color} inline-block flex-shrink-0`} />
      <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-700 text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">{label}</span>
    </span>
  );
}

function StatusBadge({ status }) {
  const map = {
    open:     { cls: "badge-yellow", label: "Menunggu" },
    assigned: { cls: "badge-blue",   label: "Aktif" },
    resolved: { cls: "badge-green",  label: "Selesai" },
    missed:   { cls: "badge-red",    label: "Terlewat" },
  };
  const s = map[status] || { cls: "badge-gray", label: status };
  return <span className={s.cls}>{s.label}</span>;
}

function ReadReceipt({ msg }) {
  if (msg.sender_type !== "agent" || msg.is_internal) return null;
  if (msg.read_at)      return <span className="text-blue-400 text-xs" title={`Dibaca ${safeFormat(msg.read_at, "HH:mm")}`}>✓✓</span>;
  if (msg.delivered_at) return <span className="text-slate-500 text-xs">✓✓</span>;
  return <span className="text-slate-600 text-xs">✓</span>;
}

// ── ConversationList ─────────────────────────────────────────────
function ConversationList({ collapsed, onToggle, visitorFilter, visitorSessions = [], onClearVisitorFilter, wsInfo }) {
  const conversations  = useChatStore(s => s.conversations);
  const activeConvId   = useChatStore(s => s.activeConvId);
  const unreadCounts   = useChatStore(s => s.unreadCounts);
  const selectConv     = useChatStore(s => s.selectConversation);
  const loadConvs      = useChatStore(s => s.loadConversations);

  const agent          = useChatStore(s => s.agent);
  const [filter, setFilter]         = useState("all");
  const [search, setSearch]         = useState("");
  const [filterDate, setFilterDate] = useState("all");
  const [filterRating, setFilterRating] = useState("all");
  const [filterAgent, setFilterAgent] = useState("all");
  const [filterPopover, setFilterPopover] = useState(false);
  const [loading, setLoading]       = useState(true);

  const { conversationId } = useParams();
  const navigate = useNavigate();

  // Guard ref to prevent Effect A from running twice on StrictMode
  const lastHandledConvId = useRef(null);

  useEffect(() => {
    if (!conversationId || conversationId === lastHandledConvId.current) return;
    lastHandledConvId.current = conversationId;
    (async () => {
      const targetConv = await selectConv(conversationId);
      const currentConv = targetConv || conversations.find(c => c.id === conversationId);
      if (currentConv) {
        const needed = currentConv.status === "resolved" ? "archived" : "all";
        // Only setFilter if it differs — avoids triggering loadConvs unnecessarily
        setFilter(prev => prev === needed ? prev : needed);
      }
    })();
  }, [conversationId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadConvs({ status: filter === "all" ? undefined : filter });
      setLoading(false);
    })();
  }, [filter]);

  // Auto-clear active selection in /chats when conversation becomes resolved or ended
  useEffect(() => {
    if (activeConvId) {
      const currentInList = conversations.find(c => c.id === activeConvId);
      if (currentInList && currentInList.status === "resolved") {
        useChatStore.setState({ activeConvId: null });
        if (window.location.pathname.startsWith("/chats/")) {
          navigate("/chats", { replace: true });
        }
      }
    }
  }, [conversations, activeConvId]);

  const filtered = conversations.filter(c => {
    if (c.status === "resolved") return false;
    if (filter === "mine" && c.assigned_agent_id !== agent?.id) return false;
    if (filter === "unassigned" && c.assigned_agent_id) return false;
    if (filter === "missed" && !c.is_missed && c.status !== "missed") return false;

    // Filter by Date
    if (filterDate !== "all" && c.created_at) {
      const created = new Date(c.created_at).getTime();
      const now = Date.now();
      if (filterDate === "today" && (now - created) > 86400000) return false;
      if (filterDate === "7d" && (now - created) > 7 * 86400000) return false;
      if (filterDate === "30d" && (now - created) > 30 * 86400000) return false;
    }

    // Filter by Rating
    if (filterRating !== "all") {
      const score = c.rating_score || 0;
      if (filterRating === "high" && score < 4) return false;
      if (filterRating === "low" && (score === 0 || score > 3)) return false;
    }

    // Filter by Agent
    if (filterAgent === "me" && c.assigned_agent_id !== agent?.id) return false;

    // Filter by Search Query (deep search)
    if (search.trim()) {
      const q = search.toLowerCase();
      let preDataStr = "";
      if (c.prechat_data) {
        preDataStr = typeof c.prechat_data === "string" ? c.prechat_data.toLowerCase() : JSON.stringify(c.prechat_data).toLowerCase();
      }
      return (
        c.visitor_name?.toLowerCase().includes(q) ||
        c.visitor_id?.toLowerCase().includes(q) ||
        c.last_message?.toLowerCase().includes(q) ||
        preDataStr.includes(q)
      );
    }

    return true;
  });

  const tabs = [
    { key: "all",        label: "💬 Semua" },
    { key: "mine",       label: "👤 Saya" },
    { key: "unassigned", label: "📥 Unassigned" },
    { key: "missed",     label: "❌ Missed" },
  ];

  if (collapsed) {
    return (
      <div className="w-14 flex flex-col items-center bg-slate-900 border-r border-slate-800 flex-shrink-0 transition-all duration-200">
        <div className="h-16 w-full flex items-center justify-center border-b border-slate-800/60 flex-shrink-0">
          <button onClick={onToggle} className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors text-xs" title="Buka Daftar Percakapan">
            ▶
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-3 space-y-3 w-full px-2 flex flex-col items-center">
          {conversations.filter(c => c.status !== "resolved").map(c => {
            const unread = unreadCounts[c.id] || 0;
            const isActive = c.id === activeConvId;
            const isResolved = c.status === "resolved";
            const isMissed = c.status === "missed";
            const isBot = wsInfo?.chatbot_enabled !== false && (c.status === "open" || c.status === "queued") && !c.assigned_agent_id && c.flow_mode !== "agent";
            const isWaiting = !isBot && !isResolved && !isMissed && !c.assigned_agent_id;
            
            const statusLabel = isResolved ? "Selesai" : isMissed ? "Terlewat" : isBot ? "Otomatis (Bot)" : isWaiting ? "Menunggu CS" : "CS Aktif";
            const statusDotColor = isResolved ? "bg-slate-500" : isMissed ? "bg-red-500" : isBot ? "bg-blue-400" : isWaiting ? "bg-yellow-400" : "bg-emerald-400";
            
            return (
              <button key={c.id} onClick={() => selectConv(c.id)}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold relative transition-all flex-shrink-0 ${
                  isActive ? "ring-2 ring-vlc-500 bg-vlc-700 shadow-md shadow-vlc-500/20" : "bg-slate-800 hover:bg-slate-700"
                }`}
                title={`${c.visitor_name || c.visitor_id || "Pengunjung"} • ${statusLabel}${unread > 0 ? ` (${unread} pesan belum dibaca)` : ""}`}>
                {getVisitorInitial(c)}

                {/* Status Dot Indicator */}
                <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${statusDotColor}`} />

                {/* Unread Message Count Badge */}
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full min-w-[18px] h-4 px-1 flex items-center justify-center font-bold shadow-md animate-pulse">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="w-72 flex flex-col border-r border-slate-800 bg-slate-900 flex-shrink-0 transition-all duration-200">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex-shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-white text-sm">Percakapan</h2>
          <button onClick={onToggle} className="text-slate-500 hover:text-slate-300 text-xs px-1" title="Kecilkan sidebar">◀</button>
        </div>
        <span className="badge-blue">{conversations.filter(c => c.status !== "resolved").length} aktif</span>
      </div>

      {/* Visitor Sessions Filter Bar (LiveChat.com Screenshot 2) */}
      {visitorFilter && (
        <div className="bg-slate-950 border-b border-slate-800 p-2.5 flex items-center justify-between text-xs text-white">
          <div className="flex items-center gap-1.5 truncate">
            <span className="text-vlc-400 font-bold">👤 {visitorSessions.length} chats</span>
            <span className="truncate text-slate-300 font-medium">{visitorFilter.visitorName}</span>
          </div>
          <button
            onClick={onClearVisitorFilter}
            className="text-slate-400 hover:text-white text-xs px-2 py-0.5 rounded bg-slate-800 border border-slate-700 transition-colors flex-shrink-0"
          >
            ✕ Clear
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-500 text-sm">Memuat...</div>
        ) : visitorFilter ? (
          visitorSessions.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">Tidak ada sesi percakapan lain</div>
          ) : (
            visitorSessions.map(conv => (
              <ConversationItem key={conv.id} conv={conv}
                active={conv.id === activeConvId}
                unread={unreadCounts[conv.id] || 0}
                onClick={() => {
                  selectConv(conv.id);
                  navigate(`/chats/${conv.id}`);
                }}
              />
            ))
          )
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500 text-center px-4 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-inner">
              <MessageSquareDashed className="w-8 h-8 text-slate-500" />
            </div>
            <span className="font-bold text-white text-base">Belum ada percakapan baru</span>
            <span className="text-xs text-slate-400 max-w-xs leading-relaxed">
              Percakapan dari pengunjung yang sedang online akan muncul secara realtime di sini.
            </span>
          </div>
        ) : filtered.map(conv => (
          <ConversationItem key={conv.id} conv={conv}
            active={conv.id === activeConvId}
            unread={unreadCounts[conv.id] || 0}
            wsInfo={wsInfo}
            onClick={() => {
              selectConv(conv.id);
              navigate(`/chats/${conv.id}`);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ConversationItem({ conv, active, unread, onClick, wsInfo }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(timer);
  }, []);

  const timeAgo = (conv.last_message_at || conv.created_at)
    ? safeFormatDistanceToNow(conv.last_message_at || conv.created_at)
    : "";

  const isResolved = conv.status === "resolved";
  const isMissed = conv.status === "missed";
  const isBot = wsInfo?.chatbot_enabled !== false && (conv.status === "open" || conv.status === "queued") && !conv.assigned_agent_id && conv.flow_mode !== "agent";
  const isWaiting = !isBot && !isResolved && !isMissed && !conv.assigned_agent_id;
  const isAssigned = (conv.status === "assigned" || !!conv.assigned_agent_id) && !isResolved && !isMissed;
  const statusDotColor = isResolved ? "bg-slate-500" : isMissed ? "bg-red-500" : isBot ? "bg-blue-400" : isWaiting ? "bg-yellow-400" : "bg-emerald-400";
  const statusLabel = isResolved ? "Selesai" : isMissed ? "Terlewat" : isBot ? "Otomatis (Bot)" : isWaiting ? "Menunggu CS" : "CS Aktif";

  return (
    <button onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-slate-800 transition-colors hover:bg-slate-800/50
        ${active ? "bg-slate-800 border-l-2 border-l-vlc-500" : ""}
      `}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 relative mt-0.5">
          <div className="w-9 h-9 rounded-full bg-vlc-800 flex items-center justify-center text-white font-bold text-sm">
            {getVisitorInitial(conv)}
          </div>
          <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${statusDotColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className="font-semibold text-sm text-white truncate flex items-center gap-1.5">
              {conv.visitor_name || conv.visitor_id || "Pengunjung"}
              {conv.source === "facebook" && (
                <span className="text-[10px] bg-blue-600/20 border border-blue-500/40 text-blue-400 px-1.5 py-0.5 rounded font-bold flex-shrink-0">📘 FB</span>
              )}
            </span>
            <span className="text-xs text-slate-500 flex-shrink-0 ml-1">{timeAgo}</span>
          </div>
          <div className="flex items-center justify-between gap-1">
            <p className="text-xs text-slate-400 truncate flex-1">
              {conv.last_message || "Tidak ada pesan"}
            </p>
            {unread > 0 && (
              <span className="flex-shrink-0 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <StatusDot conv={conv} />
            <span className="text-[10px] text-slate-400 font-medium">
              {statusLabel}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Rich Categorized Emoji Dataset ───────────────────────────────
const EMOJI_CATEGORIES = [
  { id: "smileys", name: "Smileys & Ekspresi", icon: "😀", emojis: ["😀","😃","😄","😁","😆","😅","😂","🤣","🥲","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚","😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🥸","🤩","🥳","😏","😒","😞","😔","😟","😕","🙁","☹️","😣","😖","😫","😩","🥺","😢","😭","😮‍💨","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱"] },
  { id: "gestures", name: "Orang & Tangan", icon: "🙋‍♂️", emojis: ["👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍️","💅","🤳","💪","🧠","👀","👁️","👅","👄"] },
  { id: "animals", name: "Hewan & Alam", icon: "🐶", emojis: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐻‍❄️","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🪲","🐛","🦋","🐌","🐞","🐜","🪰","🪴","🌲","🌳","🌴","🌵","🌾","🌿","☘️","🍀","🍁","🍂","🍃"] },
  { id: "food", name: "Makanan & Minuman", icon: "🍕", emojis: ["🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🥑","🍆","🥦","🥬","🥒","🌶️","🌽","🥕","🧄","🧅","🥔","🍠","🥐","🍞","🥖","🥨","🥯","🥞","🧇","🧀","🍖","🍗","🥩","🍔","🍟","🍕","🌭","🥪","🌮","🌯","🫔","🥙","🧆","🥚","🍳","🥘","🍲","🥣","🥗","🍿","🧈","🧂","🥫","🍱","🍘","🍙","🍚","🍛","🍜","🍝","🍦","🍧","🍨","🍩","🍪","🎂","🍰","🧁","🥧","🍫","🍬","🍭","🍮","🍯","🍼","🥛","☕","🫖","🍵","🍶","🍾","🍷","🍸","🍹","🍺","🍻","🥂","🥃","🥤","🧋","🧃","🧉","🧊"] },
  { id: "activities", name: "Aktivitas & Olahraga", icon: "⚽", emojis: ["⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🪀","🏓","🏸","🏒","🏑","🥍","🏏","🪃","🥅","⛳","🪁","🏹","🎣","🤿","🥊","🥋","🎽","🛹","🛼","🛷","⛸️","🎿","🏂","🪂","🏋️‍♀️","🤼‍♂️","🤸‍♀️","⛹️‍♂️","🤺","🤾‍♀️","🏌️‍♂️","🏇","🧘‍♀️","🏄‍♂️","🏊‍♀️","🤽‍♂️","🚣‍♀️","🧗‍♂️","🚵‍♀️","🚴‍♂️","🏆","🥇","🥈","🥉","🏅","🎖️","🏵️","🎗️","🎫","🎟️","🎪","🤹‍♂️","🎭","🎨","🎬","🎤","🎧","🎼","🎵","🎶","🎙️","🎚️","🎛️","📻","🎷","🪗","🎸","🎹","🎺","🎻","🪕","🥁","🎲","♟️","🎯","🎳","🎮","🎰","🧩"] },
  { id: "travel", name: "Kendaraan & Tempat", icon: "🚗", emojis: ["🚗","🚕","🚙","🚌","🏎️","🚓","ambulans","🚒","🚐","🛻","🚚","🚛","🚜","🛵","🏍️","🛺","🚲","🛴","🚏","🛣️","🛤️","🛢️","⛽","🚨","🚥","🚦","🛑","🚧","⚓","⛵","🛶","🚤","🛥️","🛳️","⛴️","🚢","✈️","🛩️","🛫","🛬","🪂","💺","🚁","🚟","🚠","🦡","🛰️","🚀","🛸","🛎️","🧳","⌛","⏳","⌚","⏰","⏱️","⏲️","🕰️","🏙️","🌆","🌇","🌃","♨️","🏰","🏯","🏛️","⛪","🕌","🛕","🕍","⛩️"] },
  { id: "symbols", name: "Objek, Simbol & Tanda", icon: "💡", emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💡","🔦","🏮","📔","📕","📖","📗","📘","📙","📚","📓","📒","📃","📜","📄","📰","📑","🔖","🏷️","💰","🪙","💴","💵","💶","💷","💸","💳","🧾","✉️","📧","📨","📩","📤","📥","📦","📫","📬","📭","📮","📯","📈","📉","📊","📅","📆","🗓️","📇","🗑️","🔒","🔓","🔏","🔐","🔑","🗝️","🔨","🪓","⛏️","⚒️","🛠️","🗡️","⚔️","💣","🛡️","☠️","⚰️","🔮","🧿","🪬","💈","🔬","🔭","📡","💉","🩸","💊","🩹","🩺","🚪","🛏️","🛋️","🚽","🚿","🛁","🪒","🧴","🧹","🧺","🧻","🧼","🧯","🛒","⚠️","⛔","🚫","📵","🔞","⚛️","🕉️","✡️","☸️","☯️","✝️","☦️","☪️","☮️","🕎","🔯","▶️","⏩","⏭️","⏯️","◀️","⏪","⏮️","🔼","⏫","🔽","⏬","⏸️","⏹️","⏺️","⏏️","📶","📳","📴","♀️","♂️","✖️","➕","➖","➗","♾️","‼️","⁉️","❓","❔","❕","❗","〰️","💱","💲","♻️","⭕","✅","☑️","✔️","❌","❎","➰","➿","〽️","✳️","✴️","❇️","©️","®️","™️","#️⃣","*️⃣","0️⃣","1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"] }
];

// ── ChatPanel ────────────────────────────────────────────────────
function ChatPanel({ leftCollapsed, rightCollapsed, onToggleLeft, onToggleRight, onViewAllChats, wsInfo }) {
  const activeConvId  = useChatStore(s => s.activeConvId);
  const convSelectionToken = useChatStore(s => s.convSelectionToken);
  const messages      = useChatStore(s => s.messages);
  const visitorTyping = useChatStore(s => s.visitorTyping);
  const sendMsg       = useChatStore(s => s.sendMessage);
  const socket        = useChatStore(s => s.socket);
  const conversations = useChatStore(s => s.conversations);
  const agent         = useChatStore(s => s.agent);

  const [text,       setText]       = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [cannedOpen, setCannedOpen] = useState(false);
  const [cannedQ,    setCannedQ]    = useState("");
  const [cannedRes,  setCannedRes]  = useState([]);
  const [transferOpen, setTransferOpen] = useState(false);
  const [emojiOpen,  setEmojiOpen]  = useState(false);
  const [emojiCat,   setEmojiCat]   = useState("smileys");
  const [emojiSearch, setEmojiSearch] = useState("");
  const [agents,     setAgents]     = useState([]);
  const [convDetail, setConvDetail] = useState(null);
  const [tags,       setTags]       = useState([]);
  const [tagInput,   setTagInput]   = useState("");

  const [pendingUploads, setPendingUploads] = useState([]);
  const [uploadCaption, setUploadCaption]   = useState("");
  const [uploading, setUploading]           = useState(false);
  const [zoomImage, setZoomImage]           = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded]   = useState(false);

  function handleFileSelection(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const mapped = files.map(file => ({
      file,
      id: Math.random().toString(36).substr(2, 9),
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      name: file.name,
      size: (file.size / 1024).toFixed(1) + " KB",
      isImage: file.type.startsWith("image/")
    }));
    setPendingUploads(prev => [...prev, ...mapped]);
    e.target.value = "";
  }

  function removePendingFile(id) {
    setPendingUploads(prev => prev.filter(f => f.id !== id));
  }

  async function confirmBatchUpload() {
    if (pendingUploads.length === 0 || !activeConvId) return;
    setUploading(true);
    try {
      for (const item of pendingUploads) {
        const fd = new FormData();
        fd.append("file", item.file);
        fd.append("conversationId", activeConvId);
        await api.post("/messages/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      }

      if (uploadCaption.trim()) {
        sendMsg(activeConvId, uploadCaption.trim(), isInternal);
      }

      toast.success(`${pendingUploads.length} file terkirim`);
      setPendingUploads([]);
      setUploadCaption("");
    } catch (err) {
      toast.error("Gagal mengunggah file");
    } finally {
      setUploading(false);
    }
  }

  const msgsEndRef = useRef(null);
  const msgsContainerRef = useRef(null);
  const inputRef   = useRef(null);
  const typingTimer = useRef(null);

  const activeConv = conversations.find(c => c.id === activeConvId);

  // Bot mode: admin cannot type until they take over the chat
  const isBotMode = wsInfo?.chatbot_enabled !== false &&
    activeConv?.status === "open" &&
    !activeConv?.assigned_agent_id &&
    activeConv?.flow_mode !== "agent" &&
    convDetail?.flow_mode !== "agent";

  const prevConvIdRef = useRef(null);
  const loadedConvIdRef = useRef(null);
  const lastSeenMsgCountRef = useRef(0);
  const isPrependingHistoryRef = useRef(false);

  const [showScrollBottomPill, setShowScrollBottomPill] = useState(false);
  const [unreadNewPillCount, setUnreadNewPillCount] = useState(0);

  const isContainerNearBottom = () => {
    const el = msgsContainerRef.current;
    if (!el) return true;
    return (el.scrollHeight - el.scrollTop - el.clientHeight) <= 220;
  };

  const scrollToLatestMessage = (smooth = true) => {
    setShowScrollBottomPill(false);
    setUnreadNewPillCount(0);
    lastSeenMsgCountRef.current = messages.length;
    msgsEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "instant" });
  };

  const handleScrollMessages = () => {
    if (isContainerNearBottom()) {
      setShowScrollBottomPill(false);
      setUnreadNewPillCount(0);
      lastSeenMsgCountRef.current = messages.length;

      // Bug B fix: Admin scroll to bottom = "seen". Clear unread badge + emit agent:read
      // so visitor widget upgrades ✓ → ✓✓ (same logic as setActiveConversation click).
      if (activeConvId) {
        const storeState = useChatStore.getState();
        const lastVisitorMsg = [...(storeState.messages || [])].reverse().find(m => m.sender_type === "visitor");
        if (lastVisitorMsg) {
          storeState.clearUnread(activeConvId);
          storeState.socket?.emit("agent:read", {
            conversationId: activeConvId,
            upToMessageId: lastVisitorMsg.id,
          });
        }
      }
    }
  };

  useEffect(() => {
    if (!activeConvId) return;
    if (isPrependingHistoryRef.current) return;

    const isFirstLoadForConv = loadedConvIdRef.current !== activeConvId;

    if (isFirstLoadForConv) {
      prevConvIdRef.current = activeConvId;
      if (messages.length > 0) {
        loadedConvIdRef.current = activeConvId;
      }
      lastSeenMsgCountRef.current = messages.length;
      setShowScrollBottomPill(false);
      setUnreadNewPillCount(0);

      const scrollToBottomNow = () => {
        if (msgsEndRef.current) {
          msgsEndRef.current.scrollIntoView({ behavior: "instant" });
        }
        if (msgsContainerRef.current) {
          msgsContainerRef.current.scrollTop = msgsContainerRef.current.scrollHeight;
        }
      };

      scrollToBottomNow();
      requestAnimationFrame(scrollToBottomNow);
      setTimeout(scrollToBottomNow, 50);
      setTimeout(scrollToBottomNow, 150);
    } else {
      const lastMsg = messages[messages.length - 1];
      const isOutboundAgentMsg = lastMsg && (lastMsg.sender_type === "agent" || lastMsg.sender_id === agent?.id);

      if (isContainerNearBottom() || isOutboundAgentMsg) {
        setShowScrollBottomPill(false);
        setUnreadNewPillCount(0);
        lastSeenMsgCountRef.current = messages.length;
        if (isContainerNearBottom()) {
          msgsEndRef.current?.scrollIntoView({ behavior: "smooth" });
          const lastVisitorMsg = messages.filter(m => m.sender_type === "visitor").at(-1);
          if (lastVisitorMsg && lastVisitorMsg.id && activeConvId) {
            useChatStore.getState().socket?.emit("agent:read", { conversationId: activeConvId, upToMessageId: lastVisitorMsg.id });
            api.post(`/conversations/${activeConvId}/read`, { lastMessageId: lastVisitorMsg.id }).catch(() => {});
          }
        }
      } else {
        // Only trigger pill for inbound visitor messages when admin is scrolled up
        const diff = Math.max(1, messages.length - lastSeenMsgCountRef.current);
        setShowScrollBottomPill(true);
        setUnreadNewPillCount(diff);
      }
    }
  }, [messages, activeConvId]);

  const [visitorHistory, setVisitorHistory] = useState([]);
  const [loadedHistoryIndex, setLoadedHistoryIndex] = useState(0);
  const [adjacent, setAdjacent] = useState({ previousConv: null, nextConv: null, visitorConvCount: 1 });

  const loadOlderHistory = async () => {
    if (loadingHistory || historyLoaded || !convDetail?.visitor_id) return;
    if (loadedHistoryIndex >= visitorHistory.length) {
      setHistoryLoaded(true);
      toast.info("Seluruh histori obrolan terdahulu telah dimuat");
      return;
    }

    const container = msgsContainerRef.current;
    const oldScrollHeight = container ? container.scrollHeight : 0;

    setLoadingHistory(true);
    isPrependingHistoryRef.current = true;
    try {
      const targetConv = visitorHistory[loadedHistoryIndex];
      const { data: pMsgs } = await api.get(`/conversations/${targetConv.id}/messages`);
      let singlePastMsgs = [];
      if (pMsgs && pMsgs.length > 0) {
        singlePastMsgs = [
          { is_internal: false, sender_type: "system", text: formatDateHeader(targetConv.created_at) },
          ...pMsgs
        ];
      }

      if (singlePastMsgs.length > 0) {
        const currentMsgs = useChatStore.getState().messages;
        useChatStore.setState({ messages: [...singlePastMsgs, ...currentMsgs] });
        
        const nextIndex = loadedHistoryIndex + 1;
        setLoadedHistoryIndex(nextIndex);
        if (nextIndex >= visitorHistory.length) {
          setHistoryLoaded(true);
        }

        toast.success(`Sesi obrolan (${formatDateHeader(targetConv.created_at)}) dimuat!`);

        // Preserve exact viewport scroll position so screen doesn't jump!
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = container.scrollHeight - oldScrollHeight;
          }
        });
      } else {
        const nextIndex = loadedHistoryIndex + 1;
        setLoadedHistoryIndex(nextIndex);
        if (nextIndex >= visitorHistory.length) setHistoryLoaded(true);
      }
    } catch (err) {
      console.error("Gagal memuat sesi obrolan terdahulu:", err);
    } finally {
      setLoadingHistory(false);
      setTimeout(() => {
        isPrependingHistoryRef.current = false;
      }, 500);
    }
  };

  useEffect(() => {
    if (activeConvId) {
      setHistoryLoaded(false);
      setLoadedHistoryIndex(0);
      (async () => {
        try {
          const { data: convData } = await api.get(`/conversations/${activeConvId}`);
          setConvDetail(convData);
          setTags(convData.tags || []);
          if (convData.status === "resolved") {
            navigate(`/archives/${activeConvId}`, { replace: true });
            return;
          }

          if (convData.visitor_id) {
            const { data: pastConvs } = await api.get(`/conversations/visitor/${convData.visitor_id}/history`);
            const olderConvs = (pastConvs || []).filter(c => c.id !== activeConvId);
            // Sort descending by created_at so most recent past session loads first
            const sortedDesc = [...olderConvs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            setVisitorHistory(sortedDesc);
          }
        } catch (err) {
          console.error("Error loading conv detail:", err);
        }
      })();

      api.get(`/conversations/${activeConvId}/adjacent`)
        .then(r => setAdjacent(r.data || { previousConv: null, nextConv: null, visitorConvCount: 1 }))
        .catch(() => setAdjacent({ previousConv: null, nextConv: null, visitorConvCount: 1 }));
    }
  }, [activeConvId, convSelectionToken]);

  const [cannedIndex, setCannedIndex] = useState(0);

  useEffect(() => {
    if (!cannedQ || !socket) { setCannedRes([]); setCannedIndex(0); return; }
    socket.emit("agent:canned_search", { query: cannedQ });

    const handler = ({ results }) => {
      setCannedRes(results || []);
      setCannedIndex(0);
    };
    socket.on("canned:results", handler);
    return () => socket.off("canned:results", handler);
  }, [cannedQ, socket]);

  function handleTyping(e) {
    setText(e.target.value);
    if (e.target.value.startsWith("/")) {
      setCannedOpen(true);
      setCannedQ(e.target.value.slice(1));
    } else {
      setCannedOpen(false);
    }
    socket?.emit("agent:typing", { conversationId: activeConvId, typing: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket?.emit("agent:typing", { conversationId: activeConvId, typing: false });
    }, 1500);
  }

  function handleKeyDown(e) {
    if (cannedOpen && cannedRes.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCannedIndex(i => (i + 1) % cannedRes.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCannedIndex(i => (i - 1 + cannedRes.length) % cannedRes.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        if (cannedRes[cannedIndex]) {
          useCanned(cannedRes[cannedIndex].content);
        }
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      if (inputRef.current) {
        inputRef.current.value = "";
        inputRef.current.style.height = "auto";
      }
      doSend();
    }
    if (e.key === "Escape") { setCannedOpen(false); setEmojiOpen(false); }
  }

  function doSend() {
    if (!text.trim() || !activeConvId) return;
    const msgToSend = text.trim();

    setText("");
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.style.height = "auto";
    }

    sendMsg(activeConvId, msgToSend, isInternal);

    if (!isInternal) {
      setConversations(prev => prev.map(c => c.id === activeConvId ? { ...c, status: "assigned", flow_mode: "agent", assigned_agent_id: agent?.id } : c));
    }

    setCannedOpen(false);
    setEmojiOpen(false);
    socket?.emit("agent:typing", { conversationId: activeConvId, typing: false });

    requestAnimationFrame(() => {
      setText("");
      if (inputRef.current) {
        inputRef.current.value = "";
        inputRef.current.style.height = "auto";
        inputRef.current.focus();
      }
    });
  }

  function addEmoji(emoji) {
    setText(prev => prev + emoji);
    setEmojiOpen(false);
    inputRef.current?.focus();
  }

  function useCanned(content) {
    setText(content);
    setCannedOpen(false);
    inputRef.current?.focus();
  }

  const [resolveConfirmOpen, setResolveConfirmOpen] = useState(false);

  function handleResolveClick() {
    if (!activeConvId) return;
    setResolveConfirmOpen(true);
  }

  async function handleConfirmResolve() {
    if (!activeConvId) return;
    setResolveConfirmOpen(false);
    try {
      socket?.emit("agent:resolve", { conversationId: activeConvId });
      await api.patch(`/conversations/${activeConvId}/resolve`);
      useChatStore.getState().updateConversationStatus(activeConvId, "resolved");
      toast.success("Percakapan diselesaikan");
    } catch (err) {
      toast.error("Gagal menyelesaikan: " + (err.response?.data?.error || err.message));
    }
  }

  async function handleTransfer(toAgentId) {
    const note = prompt("Catatan transfer (opsional):") || "";
    try {
      socket?.emit("agent:transfer", { conversationId: activeConvId, toAgentId, note });
      toast.success("Chat ditransfer");
      setTransferOpen(false);
    } catch {
      toast.error("Gagal transfer");
    }
  }

  async function loadAgents() {
    try {
      const { data } = await api.get("/agents");
      setAgents(data.filter(a => a.id !== agent?.id));
    } catch {}
  }

  async function addTag() {
    if (!tagInput.trim()) return;
    const newTags = [...new Set([...tags, tagInput.trim()])];
    setTags(newTags);
    setTagInput("");
    await api.patch(`/conversations/${activeConvId}/tags`, { tags: newTags });
  }

  async function removeTag(tag) {
    const newTags = tags.filter(t => t !== tag);
    setTags(newTags);
    await api.patch(`/conversations/${activeConvId}/tags`, { tags: newTags });
  }

  async function handleTakeover() {
    try {
      await api.patch(`/conversations/${activeConvId}/takeover`);
      toast.success("Percakapan berhasil diambil alih!");
    } catch {
      toast.error("Gagal mengambil alih chat");
    }
  }

  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [targetBlockState, setTargetBlockState] = useState(true);

  function handleBlockClick(shouldBlock) {
    setTargetBlockState(shouldBlock);
    setBlockConfirmOpen(true);
  }

  async function handleConfirmBlock() {
    if (!activeConvId) return;
    setBlockConfirmOpen(false);
    try {
      await api.patch(`/conversations/${activeConvId}/block`, { isBlocked: targetBlockState });
      setConvDetail(prev => prev ? ({ ...prev, is_blocked: targetBlockState }) : null);
      useChatStore.setState(s => ({
        conversations: s.conversations.map(c => c.id === activeConvId ? { ...c, is_blocked: targetBlockState } : c)
      }));
      toast.success(targetBlockState ? "Visitor berhasil diblokir!" : "Blokir visitor telah dibuka!");
    } catch (err) {
      toast.error("Gagal mengubah status blokir: " + (err.response?.data?.error || err.message));
    }
  }

  if (!activeConvId || !activeConv) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500">
        <div className="w-20 h-20 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-xl mb-1">
          <MessageSquare className="w-10 h-10 text-slate-600 stroke-[1.5]" />
        </div>
        <div className="text-lg font-bold text-white">Pilih percakapan</div>
        <div className="text-xs text-slate-400">Klik percakapan di panel kiri untuk mulai membalas</div>
      </div>
    );
  }

  const vIp = convDetail?.visitor_ip || activeConv?.visitor_ip || "122.50.8.198";
  const vCountry = convDetail?.visitor_country || activeConv?.visitor_country || "Indonesia";
  const vCity = convDetail?.visitor_city || activeConv?.visitor_city || "Jakarta";
  const vIsp = convDetail?.visitor_isp || activeConv?.visitor_isp || "Localhost Network";
  const vLat = parseFloat(convDetail?.visitor_lat || activeConv?.visitor_lat || -6.2088);
  const vLon = parseFloat(convDetail?.visitor_lon || activeConv?.visitor_lon || 106.8456);
  const vUa = convDetail?.visitor_ua || activeConv?.visitor_ua || "";
  const vTech = parseUA(vUa);

  return (
    <div className="flex-1 flex min-w-0">
      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Header */}
        <div className="h-16 border-b border-slate-800 flex items-center px-4 gap-3 flex-shrink-0 bg-slate-900 justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-full bg-vlc-800 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {getVisitorInitial(activeConv)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-base text-white truncate flex items-center gap-2">
                <span>{activeConv?.visitor_name || activeConv?.visitor_id || "Pengunjung"}</span>
                {agent?.role === "superadmin" && activeConv?.brand_name && (
                  <span className="text-[10px] px-2 py-0.5 rounded font-bold text-white shadow-sm flex-shrink-0 border border-slate-700 flex items-center gap-1" style={{ backgroundColor: activeConv.brand_color || '#4F46E5' }}>
                    <Building className="w-3 h-3" />
                    <span>{activeConv.brand_name}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusDot conv={activeConv} />
            <button onClick={() => { setTransferOpen(!transferOpen); loadAgents(); }}
              className="p-2 rounded-xl bg-slate-800 border border-slate-700/60 text-slate-400 hover:text-white transition-all shadow-sm"
              title="Transfer Percakapan ke Agen Lain">
              <RefreshCw className="w-4 h-4" />
            </button>
            {activeConv?.status !== "resolved" && (
              <button onClick={handleResolveClick} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>Selesai</span>
              </button>
            )}
            <button onClick={onToggleRight}
              className={`p-2 rounded-xl text-sm transition-all border ${
                rightCollapsed ? "bg-vlc-600 border-vlc-500 text-white shadow-md" : "bg-slate-800 border-slate-700/60 text-slate-400 hover:text-white"
              }`}
              title={rightCollapsed ? "Tampilkan Info Visitor & Peta" : "Sembunyikan Info Visitor & Peta"}>
              {rightCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Messages Container with On-Demand Scroll Up / Wheel / Pill Trigger for Previous Chats */}
        <div
          ref={msgsContainerRef}
          onScroll={handleScrollMessages}
          className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 relative"
        >
          {/* Interactive Older History Pill Trigger */}
          {visitorHistory.length > 0 && !historyLoaded && (
            <div className="flex justify-center my-2">
              <button
                onClick={loadOlderHistory}
                disabled={loadingHistory}
                className="px-4 py-2 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-vlc-300 hover:text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <History className="w-4 h-4 text-vlc-400" />
                <span>
                  {loadingHistory
                    ? "Memuat 1 sesi obrolan..."
                    : `Sisa ${visitorHistory.length - loadedHistoryIndex} sesi obrolan terdahulu (Klik untuk memuat 1 sesi)`}
                </span>
              </button>
            </div>
          )}

          {loadingHistory && (
            <div className="flex items-center justify-center py-2">
              <span className="text-xs text-vlc-300 font-semibold bg-slate-900 border border-slate-800 px-3.5 py-1.5 rounded-full animate-pulse flex items-center gap-2 shadow-sm">
                <span className="w-3.5 h-3.5 border-2 border-vlc-400 border-t-transparent rounded-full animate-spin inline-block"></span>
                Loading previous chat...
              </span>
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble key={msg.id || msg.client_id || i} msg={msg} agent={agent} activeConv={activeConv} onImageClick={url => setZoomImage(url)} />
          ))}

          {visitorTyping && (
            <div className="flex items-start gap-2 animate-fade-in">
              <div className="w-7 h-7 rounded-full bg-vlc-800 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-1">
                {getVisitorInitial(activeConv)}
              </div>
              <div className="bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-sm border border-slate-700">
                <div className="flex gap-1 items-center h-4">
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                </div>
              </div>
            </div>
          )}

          <div ref={msgsEndRef} />
        </div>

        {/* Canned suggestions */}
        {cannedOpen && cannedRes.length > 0 && (
          <div className="mx-4 mb-1 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg z-10">
            {cannedRes.map((r, idx) => (
              <button key={r.id} onClick={() => useCanned(r.content)}
                className={`w-100 text-left px-4 py-2.5 text-sm border-b border-slate-700 last:border-0 transition-colors flex items-center justify-between ${
                  idx === cannedIndex ? "bg-vlc-600/30 font-bold border-l-4 border-l-vlc-500 text-white" : "hover:bg-slate-700 text-slate-300"
                }`}>
                <div>
                  <span className="text-vlc-400 font-mono mr-2 text-xs">{r.shortcut}</span>
                  <span>{r.title}</span>
                </div>
                {idx === cannedIndex && <span className="text-[10px] bg-vlc-500 text-white px-1.5 py-0.5 rounded">↵ Tekan Enter</span>}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="border-t border-slate-800 p-3 flex-shrink-0 bg-slate-900 relative">
          {/* Floating New Message Scroll Pill */}
          {showScrollBottomPill && (
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-30">
              <button
                type="button"
                onClick={() => scrollToLatestMessage(true)}
                className="bg-vlc-600 hover:bg-vlc-500 text-white text-xs font-bold px-4 py-2 rounded-full shadow-xl border border-slate-700 flex items-center gap-2 transition-all animate-bounce cursor-pointer"
              >
                <ArrowDown className="w-3.5 h-3.5" />
                <span>Pesan Baru</span>
                {unreadNewPillCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                    {unreadNewPillCount}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Bot Mode Active Notice */}
          {isBotMode && (
            <div className="flex items-center justify-between bg-vlc-950/60 border border-vlc-700/50 rounded-xl px-3 py-1.5 mb-2 text-xs animate-fade-in">
              <span className="text-vlc-200 font-medium flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-vlc-400 animate-pulse" />
                <span>Visitor sedang berinteraksi dengan Bot / Decision Tree</span>
              </span>
              <button onClick={handleTakeover}
                className="text-[11px] bg-vlc-600 hover:bg-vlc-500 text-white px-2.5 py-1 rounded-lg font-semibold transition-all flex items-center gap-1.5 shadow-sm">
                <Zap className="w-3.5 h-3.5" />
                <span>Ambil Alih Chat</span>
              </button>
            </div>
          )}

          {/* Rich Searchable Emoji Picker Popover */}
          {emojiOpen && (
            <div className="absolute bottom-16 left-4 bg-slate-900 border border-slate-700 rounded-2xl p-3 shadow-2xl z-50 w-80 max-w-[90vw] animate-fade-in">
              <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">😊 Pilih Emoji</span>
                <button onClick={() => setEmojiOpen(false)} className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-slate-800">✕</button>
              </div>

              {/* Search Bar */}
              <div className="mb-2">
                <input
                  type="text"
                  placeholder="🔍 Cari emoji..."
                  value={emojiSearch}
                  onChange={e => setEmojiSearch(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-vlc-500"
                />
              </div>

              {/* Category Tabs */}
              <div className="flex items-center justify-between gap-1 mb-2 bg-slate-950 p-1 rounded-xl overflow-x-auto text-sm">
                {EMOJI_CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setEmojiCat(cat.id)}
                    title={cat.name}
                    className={`px-1.5 py-1 rounded-lg transition-all ${emojiCat === cat.id ? "bg-vlc-600 text-white shadow-sm" : "hover:bg-slate-800 text-slate-400"}`}
                  >
                    {cat.icon}
                  </button>
                ))}
              </div>

              {/* Emoji Grid List */}
              <div className="max-h-56 overflow-y-auto pr-1 space-y-3">
                {EMOJI_CATEGORIES.filter(cat => emojiCat === "all" || cat.id === emojiCat).map(cat => {
                  const filteredList = cat.emojis.filter(e => !emojiSearch || e.includes(emojiSearch));
                  if (filteredList.length === 0) return null;
                  return (
                    <div key={cat.id}>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 px-1">{cat.name}</div>
                      <div className="grid grid-cols-8 gap-1">
                        {filteredList.map((em, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => addEmoji(em)}
                            className="h-8 rounded-lg hover:bg-slate-800 flex items-center justify-center text-lg transition-transform hover:scale-125"
                          >
                            {em}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Internal note toggle + Composer toolbar */}
          <div className={`rounded-2xl overflow-hidden transition-all ${
            isInternal
              ? "bg-amber-950/40 border border-amber-600/40"
              : "bg-slate-800/90 border border-slate-700/80 shadow-md"
          }`}>

            {/* ── Toolbar Row ───────────────────────────────────── */}
            <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 border-b border-slate-700/50">
              {/* Message type toggle */}
              <button onClick={() => setIsInternal(!isInternal)}
                className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-all flex items-center gap-1 ${
                  isInternal
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "bg-slate-700/70 text-slate-300 hover:text-white border border-slate-600/50"
                }`}>
                <span>{isInternal ? "📝" : "💬"}</span>
                <span>{isInternal ? "Catatan" : "Message"}</span>
                <span className="opacity-60">∨</span>
              </button>

              <div className="w-px h-4 bg-slate-600/60 mx-0.5" />

              {/* Canned hint */}
              <button onClick={() => { setText("/"); inputRef.current?.focus(); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors flex-shrink-0"
                title="Canned Responses (/shortcut)">
                <span className="text-sm font-bold leading-none">/</span>
              </button>

              {/* File upload */}
              <label className="cursor-pointer p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors flex-shrink-0" title="Lampirkan file">
                <span className="text-base leading-none">📎</span>
                <input type="file" multiple className="hidden"
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,audio/*,video/mp4"
                  onChange={handleFileSelection} />
              </label>

              {/* Emoji */}
              <button onClick={() => setEmojiOpen(!emojiOpen)} type="button"
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-700/50 transition-colors flex-shrink-0" title="Emoji">
                <span className="text-base leading-none">😊</span>
              </button>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Send button */}
              <button onClick={doSend}
                disabled={!text.trim() || (isBotMode && !isInternal)}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-vlc-600 hover:bg-vlc-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-white text-xs font-semibold shadow-md hover:scale-[1.03] active:scale-95 flex-shrink-0">
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                Send
              </button>
            </div>

            {/* ── Textarea Row ─────────────────────────────────── */}
            <div className="relative">
              {pendingUploads.length > 0 && (
                <div className="mx-3 mt-2 mb-1 bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-xl z-20 animate-fade-in">
                  <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-800">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">📁 Preview ({pendingUploads.length} File)</span>
                    <button onClick={() => setPendingUploads([])} className="text-slate-400 hover:text-white text-xs px-2 py-0.5 rounded hover:bg-slate-800">Batal ✕</button>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
                    {pendingUploads.map(item => (
                      <div key={item.id} className="relative flex-shrink-0 w-20 h-20 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden group">
                        {item.isImage
                          ? <img src={item.previewUrl} alt={item.name} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex flex-col items-center justify-center p-1 text-center">
                              <span className="text-xl">📄</span>
                              <span className="text-[9px] text-slate-400 truncate w-full px-1">{item.name}</span>
                            </div>
                        }
                        <button type="button" onClick={() => removePendingFile(item.id)}
                          className="absolute top-1 right-1 bg-red-600/90 hover:bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">✕</button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="text" placeholder="Tambah keterangan (opsional)..." value={uploadCaption}
                      onChange={e => setUploadCaption(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-vlc-500" />
                    <button type="button" disabled={uploading} onClick={confirmBatchUpload}
                      className="btn-primary text-xs py-1.5 px-4 font-bold flex items-center gap-1">
                      {uploading ? "Mengirim..." : `📤 Kirim ${pendingUploads.length} File`}
                    </button>
                  </div>
                </div>
              )}

              <textarea
                ref={inputRef}
                value={text}
                onChange={handleTyping}
                onKeyDown={handleKeyDown}
                disabled={isBotMode && !isInternal}
                rows={1}
                className={`w-full bg-transparent text-sm placeholder-slate-500 resize-none outline-none px-4 py-3 leading-relaxed transition-colors ${
                  isBotMode && !isInternal ? "text-slate-600 cursor-not-allowed" : "text-white"
                }`}
                placeholder={
                  isBotMode && !isInternal
                    ? "⚡ Klik 'Ambil Alih Chat' untuk mulai membalas..."
                    : isInternal
                    ? "Tulis catatan internal (hanya tim yang lihat)..."
                    : "Tulis pesan ke visitor... (/ untuk canned)"
                }
                style={{ minHeight: "52px", maxHeight: "240px", overflowY: "hidden" }}
                onInput={e => {
                  if (!e.target.value) {
                    e.target.style.height = "52px";
                    e.target.style.overflowY = "hidden";
                    return;
                  }
                  e.target.style.height = "auto";
                  const maxH = 240;
                  if (e.target.scrollHeight > maxH) {
                    e.target.style.height = maxH + "px";
                    e.target.style.overflowY = "auto";
                  } else {
                    e.target.style.height = e.target.scrollHeight + "px";
                    e.target.style.overflowY = "hidden";
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Image Zoom / Lightbox Modal for Admin */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-[999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setZoomImage(null)}
        >
          <div
            className="relative max-w-5xl max-h-[92vh] flex flex-col items-center justify-center bg-slate-900/90 border border-slate-700/80 p-3 rounded-2xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between gap-4 mb-2 px-2 pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                🖼️ Pratinjau Gambar (Zoom)
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={zoomImage}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="px-3 py-1 bg-vlc-600 hover:bg-vlc-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <span>📥</span> Unduh / Tab Baru
                </a>
                <button
                  onClick={() => setZoomImage(null)}
                  className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center font-bold text-sm transition-colors border border-slate-700"
                  title="Tutup"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="overflow-auto max-h-[82vh] max-w-full flex items-center justify-center rounded-xl bg-slate-950 p-2">
              <img
                src={zoomImage}
                alt="Zoomed view"
                className="max-w-full max-h-[78vh] object-contain rounded-lg shadow-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* Right Panel: Info + IP & Maps + Transfer (Collapsible) */}
      {!rightCollapsed && (
        <VisitorInfoPanel
          convDetail={convDetail || activeConv}
          tags={tags}
          setTags={setTags}
          onBlockVisitor={() => handleBlockClick(true)}
          onUnblockVisitor={() => handleBlockClick(false)}
          isBlocked={convDetail?.is_blocked ?? activeConv?.is_blocked}
        />
      )}

      {/* Confirm Resolve Modal */}
      <ConfirmModal
        isOpen={resolveConfirmOpen}
        onClose={() => setResolveConfirmOpen(false)}
        onConfirm={handleConfirmResolve}
        title="Selesaikan Percakapan"
        message="Apakah Anda yakin ingin menyelesaikan percakapan ini? Chat akan dipindahkan ke Arsip Chat."
        confirmText="Ya, Selesaikan"
        cancelText="Batal"
        confirmVariant="primary"
        icon="✅"
      />

      {/* Confirm Block / Unblock Visitor Modal */}
      <ConfirmModal
        isOpen={blockConfirmOpen}
        onClose={() => setBlockConfirmOpen(false)}
        onConfirm={handleConfirmBlock}
        title={targetBlockState ? "Blokir Visitor (Spammer)" : "Buka Blokir Visitor"}
        message={targetBlockState
          ? `Apakah Anda yakin ingin memblokir ${convDetail?.visitor_name || activeConv?.visitor_name || "visitor ini"}? Visitor tidak akan dapat mengirim pesan lagi di widget.`
          : `Buka kuncian blokir untuk ${convDetail?.visitor_name || activeConv?.visitor_name || "visitor ini"} agar dapat mengirim pesan kembali?`
        }
        confirmText={targetBlockState ? "Ya, Blokir Visitor" : "Buka Blokir"}
        cancelText="Batal"
        confirmVariant={targetBlockState ? "danger" : "primary"}
        icon={targetBlockState ? "🚫" : "✅"}
      />
    </div>
  );
}



function InfoRow({ label, value, isUrl }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="text-slate-500 w-20 flex-shrink-0 font-medium">{label}</span>
      {isUrl
        ? <a href={value} target="_blank" rel="noopener" className="text-blue-400 truncate hover:underline">{value}</a>
        : <span className="text-slate-300 truncate">{value}</span>
      }
    </div>
  );
}

function MessageBubble({ msg, agent, activeConv, onImageClick }) {
  const isVisitor  = msg.sender_type === "visitor";
  const isAgent    = msg.sender_type === "agent";
  const isSystem   = msg.sender_type === "system";
  const isBot      = msg.sender_type === "bot";
  const isMe       = isAgent && msg.sender_id === agent?.id;

  if (isSystem) return (
    <div className="flex justify-center">
      <span className="text-xs text-slate-500 bg-slate-800 px-3 py-1 rounded-full">{msg.text}</span>
    </div>
  );

  const bubbleCls = isVisitor
    ? msg.message_type === "flow_button"
      ? "bg-slate-700/80 border border-vlc-500/40 text-vlc-200 rounded-2xl rounded-bl-sm font-medium"
      : "bg-slate-700 text-slate-100 rounded-2xl rounded-bl-sm"
    : isAgent
    ? msg.is_internal
      ? "bg-amber-900/30 border border-amber-700/30 text-amber-200 rounded-2xl rounded-br-sm"
      : "bg-vlc-700 text-white rounded-2xl rounded-br-sm"
    : isBot
    ? "bg-slate-700 border border-slate-600 text-slate-200 rounded-2xl rounded-br-sm"
    : "bg-slate-800 text-slate-300 rounded-2xl rounded-bl-sm";

  return (
    <div className={`flex items-start gap-2 msg-animate ${isVisitor ? "justify-start" : "justify-end"}`}>
      {/* Avatar for visitor only (left side) */}
      {isVisitor && (
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-1 shadow-sm bg-vlc-800`}>
          {getVisitorInitial(activeConv || { visitor_name: msg.sender_name })}
        </div>
      )}

      <div className={`flex flex-col gap-0.5 max-w-sm ${(isAgent || isBot) ? "items-end" : "items-start"}`}>
        {/* Sender name */}
        {isVisitor ? (
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs text-slate-400 font-medium truncate max-w-[150px]">
              {msg.message_type === "flow_button"
                ? "🔘 Pilihan Visitor"
                : (activeConv?.visitor_name || activeConv?.prechat_data?.username || activeConv?.prechat_data?.name || msg.sender_name || "Visitor")}
            </span>
          </div>
        ) : isAgent ? (
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs text-slate-400 font-medium">{msg.sender_display_name || msg.sender_name}</span>
            {msg.is_internal && <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-semibold">Internal</span>}
          </div>
        ) : isBot ? (
          <span className="text-[10px] text-slate-500 font-medium px-1">🤖 Automated Bot</span>
        ) : null}

        {/* Bubble content */}
        <div className={`px-4 py-2.5 text-sm leading-relaxed shadow-sm ${bubbleCls}`}>
          {msg.message_type === "image" && msg.file_url
            ? <img
                src={getFileUrl(msg.file_url)}
                alt="img"
                className="max-w-full rounded-lg max-h-56 object-contain cursor-pointer transition-transform hover:scale-[1.02] shadow-md border border-slate-700/50"
                onClick={() => onImageClick && onImageClick(getFileUrl(msg.file_url))}
                title="Klik untuk Zoom / Lihat Ukuran Penuh"
              />
            : msg.message_type === "file" && msg.file_url
            ? <a href={getFileUrl(msg.file_url)} target="_blank" rel="noopener"
                 className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <span className="text-lg">📎</span>
                <span className="underline text-xs">{msg.file_name || "File"}</span>
              </a>
            : <span dangerouslySetInnerHTML={{ __html: simpleMarkdown(msg.text || "") }} />
          }
        </div>

        {/* Time + read receipt */}
        <div className={`flex items-center gap-1 px-1 text-[11px] text-slate-500 ${(isAgent || isBot) ? "flex-row-reverse" : ""}`}>
          <span>{safeFormat(msg.created_at, "HH:mm")}</span>
          {isAgent && isMe && <ReadReceipt msg={msg} />}
        </div>
      </div>

      {/* Avatar for agent or bot (right side) */}
      {(isAgent || isBot) && (
        <div className="flex-shrink-0 mt-1">
          {isBot ? (
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm bg-slate-700">
              B
            </div>
          ) : (
            <Avatar
              src={msg.sender_avatar || (isMe ? agent?.avatar_url : null)}
              name={msg.sender_display_name || msg.sender_name || agent?.display_name || agent?.name}
              bg={agent?.avatar_bg || "#4F46E5"}
              size="w-7 h-7"
              textClass="text-xs"
            />
          )}
        </div>
      )}
    </div>
  );
}

function simpleMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline font-semibold">$1</a>')
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

// ── Dashboard Page ───────────────────────────────────────────────
export default function Dashboard() {
  const [leftCollapsed, setLeftCollapsed]   = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [visitorFilter, setVisitorFilter]   = useState(null);
  const [visitorSessions, setVisitorSessions] = useState([]);
  const [wsInfo, setWsInfo]                 = useState(null);

  const agent                = useChatStore(s => s.agent);
  const loadConvs            = useChatStore(s => s.loadConversations);
  const selectedWorkspaceId  = useChatStore(s => s.selectedWorkspaceId);
  const setSelectedWorkspace = useChatStore(s => s.setSelectedWorkspace);
  const isSuperadmin         = agent?.role === "superadmin";
  const [allWorkspaces, setAllWorkspaces] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/workspaces/mine");
        setWsInfo(data);
      } catch {}

      // For superadmin: load all workspaces for the brand switcher
      if (isSuperadmin) {
        try {
          const { data } = await api.get("/workspaces");
          const ws = data.workspaces || data || [];
          setAllWorkspaces(ws);
        } catch {}
      }
    })();

    const socket = useChatStore.getState().socket;
    if (socket) {
      const handleWsUpdate = (updatedWs) => {
        if (updatedWs) setWsInfo(prev => ({ ...prev, ...updatedWs }));
      };
      socket.on("workspace:updated", handleWsUpdate);
      socket.on("flow:config_updated", handleWsUpdate);
      return () => {
        socket.off("workspace:updated", handleWsUpdate);
        socket.off("flow:config_updated", handleWsUpdate);
      };
    }
  }, []);

  // Reload conversations when superadmin switches workspace (including 'Semua Brand' / null)
  useEffect(() => {
    if (isSuperadmin) {
      loadConvs();
    }
  }, [selectedWorkspaceId]);

  async function handleViewAllChats(visitorId, visitorName) {
    setVisitorFilter({ visitorId, visitorName });
    try {
      const { data } = await api.get(`/conversations?visitor_id=${visitorId}`);
      setVisitorSessions(Array.isArray(data.conversations) ? data.conversations : []);
      toast.success(`Menampilkan ${data.conversations?.length || 0} riwayat chat milik ${visitorName}`);
    } catch {
      toast.error("Gagal memuat riwayat chat visitor");
    }
  }

  // Infrastructure Expiration Calculations
  const vpsExpiry = wsInfo?.vps_expires_at ? new Date(wsInfo.vps_expires_at) : null;
  const domainExpiry = wsInfo?.domain_expires_at ? new Date(wsInfo.domain_expires_at) : null;
  const now = new Date();

  const vpsDaysLeft = vpsExpiry ? Math.ceil((vpsExpiry - now) / 86400000) : null;
  const domainDaysLeft = domainExpiry ? Math.ceil((domainExpiry - now) / 86400000) : null;
  const showVpsAlert = vpsDaysLeft !== null && vpsDaysLeft <= 30;
  const showDomainAlert = domainDaysLeft !== null && domainDaysLeft <= 30;

  return (
    <div className="flex flex-col flex-1 overflow-hidden relative">
      {/* ⚠️ Infrastructure Expiration Warning Banner */}
      {(showVpsAlert || showDomainAlert) && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between gap-4 text-xs text-amber-200 z-20 flex-shrink-0 animate-fade-in">
          <div className="flex items-center gap-2 font-medium">
            <span className="text-base animate-pulse">⚠️</span>
            <div>
              <span className="font-bold text-amber-300 uppercase tracking-wider mr-2">PERINGATAN MASA AKTIF INFRASTRUKTUR:</span>
              {showVpsAlert && (
                <span className="mr-3">
                  🖥️ VPS Expired dalam <strong className="text-amber-100 font-bold">{vpsDaysLeft} hari</strong> ({safeFormat(vpsExpiry, "dd MMM yyyy")})
                </span>
              )}
              {showDomainAlert && (
                <span>
                  🌐 Domain Expired dalam <strong className="text-amber-100 font-bold">{domainDaysLeft} hari</strong> ({safeFormat(domainExpiry, "dd MMM yyyy")})
                </span>
              )}
              <span className="ml-2 text-amber-400/80 font-normal">— Segera perpanjang agar layanan livechat terus aktif!</span>
            </div>
          </div>
        </div>
      )}

      {/* ── SUPERADMIN BRAND SWITCHER ──────────────────────────── */}
      {isSuperadmin && (
        <div className="bg-slate-900/95 border-b border-slate-800 px-4 py-2 flex items-center gap-3 flex-shrink-0 backdrop-blur-sm z-30">
          <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
            <Building className="w-3.5 h-3.5 text-vlc-400" />
            <span className="text-vlc-400 font-semibold">Mode Superadmin</span>
            <span className="text-slate-600 mx-1">·</span>
            <span className="text-slate-400">Lihat Brand:</span>
          </div>

          {allWorkspaces.length === 0 ? (
            <span className="text-slate-500 text-xs italic">Tidak ada brand aktif</span>
          ) : (
            <BrandSwitcherDropdown
              workspaces={allWorkspaces}
              selectedId={selectedWorkspaceId}
              onSelect={setSelectedWorkspace}
            />
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden relative">
        <ConversationList
          collapsed={leftCollapsed}
          onToggle={() => setLeftCollapsed(!leftCollapsed)}
          visitorFilter={visitorFilter}
          visitorSessions={visitorSessions}
          onClearVisitorFilter={() => setVisitorFilter(null)}
          wsInfo={wsInfo}
        />
        <ChatPanel
          leftCollapsed={leftCollapsed}
          rightCollapsed={rightCollapsed}
          onToggleLeft={() => setLeftCollapsed(!leftCollapsed)}
          onToggleRight={() => setRightCollapsed(!rightCollapsed)}
          onViewAllChats={handleViewAllChats}
          wsInfo={wsInfo}
        />
      </div>
    </div>
  );
}

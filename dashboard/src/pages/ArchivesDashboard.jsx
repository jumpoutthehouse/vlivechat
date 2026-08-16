import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Archive,
  ArchiveX,
  Search,
  SlidersHorizontal,
  ArrowDown,
  ArrowUp,
  Lock,
  Building,
  User,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import api from "../api";
import useChatStore from "../store/chatStore";
import toast from "react-hot-toast";
import VisitorInfoPanel from "../components/VisitorInfoPanel";
import BrandSwitcherDropdown from "../components/BrandSwitcherDropdown";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

function getFileUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${SERVER_URL}${url.startsWith("/") ? "" : "/"}${url}`;
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

function formatNumber(num) {
  return new Intl.NumberFormat("en-US").format(num || 0);
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

function formatTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const timeStr = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return timeStr;
  return `${d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" })} ${timeStr}`;
}

export default function ArchivesDashboard() {
  const { conversationId } = useParams();
  const navigate = useNavigate();

  const [archives, setArchives] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest"); // "newest" | "oldest"
  const [filterPopover, setFilterPopover] = useState(false);
  const [visitorFilter, setVisitorFilter] = useState(null);

  const [activeConvId, setActiveConvId] = useState(conversationId || null);
  const [convDetail, setConvDetail] = useState(null);
  const [messages, setMessages] = useState([]);
  const [tags, setTags] = useState([]);
  const [adjacent, setAdjacent] = useState({ previousConv: null, nextConv: null, visitorConvCount: 1 });
  const [reopening, setReopening] = useState(false);
  const [zoomImage, setZoomImage] = useState(null);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const msgsEndRef = useRef(null);

  const agent                = useChatStore(s => s.agent);
  const selectedWorkspaceId  = useChatStore(s => s.selectedWorkspaceId);
  const setSelectedWorkspace = useChatStore(s => s.setSelectedWorkspace);
  const isSuperadmin         = agent?.role === "superadmin";
  const [allWorkspaces, setAllWorkspaces] = useState([]);

  // Load workspaces for superadmin switcher
  useEffect(() => {
    if (!isSuperadmin) return;
    api.get("/workspaces").then(({ data }) => {
      const ws = data.workspaces || data || [];
      setAllWorkspaces(ws);
    }).catch(() => {});
  }, [isSuperadmin]);

  // Reload archives when superadmin switches workspace
  useEffect(() => {
    if (isSuperadmin) {
      setPage(1);
      fetchArchives(1, false, visitorFilter);
      fetchCount(visitorFilter);
    }
  }, [selectedWorkspaceId]);

  useEffect(() => {
    fetchCount(visitorFilter);
    setPage(1);
    fetchArchives(1, false, visitorFilter);
  }, [search, dateFilter, ratingFilter, agentFilter, sortOrder, visitorFilter]);

  useEffect(() => {
    if (conversationId) {
      setActiveConvId(conversationId);
      loadConvDetail(conversationId);
    } else if (archives.length > 0 && !activeConvId) {
      const firstId = archives[0].id;
      setActiveConvId(firstId);
      navigate(`/archives/${firstId}`, { replace: true });
    }
  }, [conversationId, archives]);

  // Auto-scroll to latest message when opening or switching archived conversation
  useEffect(() => {
    if (messages.length > 0) {
      msgsEndRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [messages, activeConvId]);

  async function fetchCount(vFilter = visitorFilter) {
    try {
      const activeVId = vFilter?.visitorId;
      const { data } = await api.get("/conversations/archives/count", {
        params: {
          visitor_id: activeVId || undefined,
          search: search.trim() || undefined,
          ...(isSuperadmin && selectedWorkspaceId ? { workspace_id: selectedWorkspaceId } : {}),
        }
      });
      setTotalCount(data.total || 0);
    } catch {}
  }

  async function fetchArchives(pageToFetch = 1, isAppend = false, vFilter = visitorFilter) {
    if (isAppend) setLoadingMore(true);
    else setLoading(true);

    try {
      let dateFrom = null;
      if (dateFilter === "today") {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        dateFrom = d.toISOString();
      } else if (dateFilter === "7d") {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        dateFrom = d.toISOString();
      } else if (dateFilter === "30d") {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        dateFrom = d.toISOString();
      }

      const currentVId = (vFilter && vFilter.visitorId) ? vFilter.visitorId : undefined;

      const { data } = await api.get("/conversations", {
        params: {
          status: "archived",
          visitor_id: currentVId,
          search: search.trim() || undefined,
          date_from: dateFrom || undefined,
          sort: sortOrder,
          page: pageToFetch,
          limit: 30,
          // For superadmin: inject selected workspace_id
          ...(isSuperadmin && selectedWorkspaceId ? { workspace_id: selectedWorkspaceId } : {}),
        },
      });

      let list = data.conversations || [];

      // Rating filter
      if (ratingFilter !== "all") {
        list = list.filter(c => {
          const score = c.rating_score || 0;
          if (ratingFilter === "high") return score >= 4;
          if (ratingFilter === "low") return score >= 1 && score <= 3;
          return true;
        });
      }

      if (isAppend) {
        setArchives(prev => [...prev, ...list]);
      } else {
        setArchives(list);
      }

      setHasMore(data.pagination?.hasMore ?? (list.length === 30));
      if (data.pagination?.total !== undefined) setTotalCount(data.pagination.total);

      if (list.length > 0 && !isAppend) {
        setActiveConvId(list[0].id);
      }
    } catch {
      toast.error("Gagal memuat arsip chat");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  function handleListScroll(e) {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollHeight - scrollTop - clientHeight < 100 && hasMore && !loadingMore && !loading) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchArchives(nextPage, true);
    }
  }

  function handleViewAllChats(visitorId, visitorName) {
    const newFilter = { visitorId, visitorName };
    setVisitorFilter(newFilter);
    setPage(1);
    fetchArchives(1, false, newFilter);
    fetchCount(newFilter);
    toast.success(`Menampilkan seluruh riwayat sesi milik ${visitorName}`);
  }

  async function loadConvDetail(id) {
    try {
      const { data: convData } = await api.get(`/conversations/${id}`);
      setConvDetail(convData);
      setTags(convData.tags || []);

      const { data: msgData } = await api.get(`/conversations/${id}/messages`);
      setMessages(msgData || []);

      // Fetch adjacent (previous & next) conversations using array index
      const { data: adjData } = await api.get(`/conversations/${id}/adjacent`);
      setAdjacent(adjData || { previousConv: null, nextConv: null, visitorConvCount: 1 });
    } catch {
      toast.error("Gagal memuat detail percakapan");
    }
  }

  async function handleReopen() {
    if (!activeConvId || reopening) return;
    setReopening(true);
    try {
      const { data } = await api.patch(`/conversations/${activeConvId}/reopen`);
      toast.success("Percakapan berhasil dibuka kembali!");
      navigate(`/chats/${activeConvId}`);
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.activeConversationId) {
        toast("Visitor ini sudah memiliki chat aktif yang baru. Mengalihkan...", { icon: "ℹ️" });
        navigate(`/chats/${err.response.data.activeConversationId}`);
      } else {
        toast.error("Gagal membuka kembali percakapan");
      }
    } finally {
      setReopening(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-950">

      {/* ── SUPERADMIN BRAND SWITCHER ──────────────────────────── */}
      {isSuperadmin && (
        <div className="bg-slate-900/95 border-b border-slate-800 px-4 py-2 flex items-center gap-3 flex-shrink-0 backdrop-blur-sm z-30">
          <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
            <Building className="w-3.5 h-3.5 text-vlc-400" />
            <span className="text-vlc-400 font-semibold">Mode Superadmin</span>
            <span className="text-slate-600 mx-1">·</span>
            <span className="text-slate-400">Arsip Brand:</span>
          </div>

          {allWorkspaces.length === 0 ? (
            <span className="text-slate-500 text-xs italic">Tidak ada brand aktif</span>
          ) : (
            <BrandSwitcherDropdown
              workspaces={allWorkspaces}
              selectedId={selectedWorkspaceId}
              onSelect={setSelectedWorkspace}
              label="Arsip Brand"
            />
          )}
        </div>
      )}

      <div className="flex flex-1 min-w-0 overflow-hidden">
      {/* ── Left Sidebar Panel (Archives List) ────────────────────── */}
      <div className="w-80 lg:w-96 border-r border-slate-800 flex flex-col flex-shrink-0 bg-slate-900">
        {/* Header Total Count Counter */}
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <h1 className="font-bold text-lg text-white flex items-center gap-2">
              <Archive className="w-5 h-5 text-vlc-400" />
              <span>Arsip Chat</span>
            </h1>
            <span className="bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xs font-bold px-2.5 py-1 rounded-full shadow-sm">
              {formatNumber(totalCount)} chats
            </span>
          </div>

          {/* Search bar + Filter button */}
          <div className="relative mb-2 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari nama visitor, ID, IP..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-vlc-500 transition-colors"
              />
            </div>
            <button
              onClick={() => setFilterPopover(!filterPopover)}
              className={`p-2.5 rounded-xl border text-xs flex items-center justify-center transition-all flex-shrink-0 ${
                ratingFilter !== "all" || dateFilter !== "all"
                  ? "bg-vlc-600 border-vlc-500 text-white shadow-md"
                  : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
              }`}
              title="Filter Lanjutan Arsip"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>

            {/* Filter Popover */}
            {filterPopover && (
              <div className="absolute top-11 right-0 w-64 bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-2xl z-50 text-xs space-y-3">
                <div className="flex items-center justify-between font-bold text-white border-b border-slate-800 pb-2">
                  <span className="flex items-center gap-1.5"><SlidersHorizontal className="w-3.5 h-3.5 text-vlc-400" /> Filter Lanjutan</span>
                  <button onClick={() => setFilterPopover(false)} className="text-slate-400 hover:text-white">✕</button>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1 font-medium">Rentang Tanggal</label>
                  <select
                    value={dateFilter}
                    onChange={e => setDateFilter(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-lg p-2 outline-none"
                  >
                    <option value="all">Semua Tanggal</option>
                    <option value="today">Hari Ini</option>
                    <option value="7d">7 Hari Terakhir</option>
                    <option value="30d">30 Hari Terakhir</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1 font-medium">Rating Penilaian</label>
                  <select
                    value={ratingFilter}
                    onChange={e => setRatingFilter(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-lg p-2 outline-none"
                  >
                    <option value="all">Semua Rating</option>
                    <option value="high">Rating Tinggi (4-5 ⭐)</option>
                    <option value="low">Rating Rendah (1-3 ⭐)</option>
                  </select>
                </div>

                {(dateFilter !== "all" || ratingFilter !== "all") && (
                  <button
                    onClick={() => { setDateFilter("all"); setRatingFilter("all"); }}
                    className="w-full text-center text-red-400 hover:text-red-300 font-semibold text-[11px] pt-1"
                  >
                    Reset Filter
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Sort Controls (Newest / Oldest) */}
          <div className="flex items-center justify-between gap-1 mb-2">
            <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-0.5 text-[11px] font-semibold flex-1">
              <button
                onClick={() => setSortOrder("newest")}
                className={`flex-1 py-1.5 px-2 text-center rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  sortOrder === "newest" ? "bg-vlc-600 text-white font-bold shadow-sm" : "text-slate-400 hover:text-white"
                }`}
              >
                <ArrowDown className="w-3.5 h-3.5" />
                <span>Terbaru</span>
              </button>
              <button
                onClick={() => setSortOrder("oldest")}
                className={`flex-1 py-1.5 px-2 text-center rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  sortOrder === "oldest" ? "bg-vlc-600 text-white font-bold shadow-sm" : "text-slate-400 hover:text-white"
                }`}
              >
                <ArrowUp className="w-3.5 h-3.5" />
                <span>Terlama</span>
              </button>
            </div>
          </div>
        </div>

        {/* Visitor Sessions Filter Bar */}
        {visitorFilter && (
          <div className="bg-slate-950 border-b border-slate-800 p-2.5 flex items-center justify-between text-xs text-white flex-shrink-0">
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-vlc-400 font-bold">👤 {totalCount} chats</span>
              <span className="truncate text-slate-300 font-medium">{visitorFilter.visitorName}</span>
            </div>
            <button
              onClick={() => {
                setVisitorFilter(null);
                setPage(1);
                fetchArchives(1, false, null);
              }}
              className="text-slate-400 hover:text-white text-xs px-2 py-0.5 rounded bg-slate-800 border border-slate-700 transition-colors flex-shrink-0"
            >
              ✕ Clear Filter
            </button>
          </div>
        )}

        {/* Conversations List with Infinite Scroll */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60" onScroll={handleListScroll}>
          {loading && page === 1 ? (
            <div className="p-8 text-center text-slate-500 text-sm">Memuat arsip chat...</div>
          ) : archives.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">Tidak ada arsip percakapan</div>
          ) : (
            <>
              {archives.map(c => {
                const isActive = c.id === activeConvId;
                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      setActiveConvId(c.id);
                      navigate(`/archives/${c.id}`);
                    }}
                    className={`p-3.5 cursor-pointer transition-all ${
                      isActive ? "bg-vlc-950/80 border-l-4 border-l-vlc-500 text-white" : "hover:bg-slate-800/60 text-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm truncate text-white">
                        {c.visitor_name || c.visitor_id || "Pengunjung"}
                      </span>
                      <span className="text-[10px] text-slate-500 flex-shrink-0">
                        {formatTime(c.resolved_at || c.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 truncate mb-1.5">
                      {c.last_message || "— Tidak ada pesan —"}
                    </p>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="px-2 py-0.5 rounded font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                        🔒 Archived
                      </span>
                      {c.agent_display_name || c.agent_name ? (
                        <span className="text-slate-300 font-medium truncate max-w-[120px]">
                          👤 {c.agent_display_name || c.agent_name}
                        </span>
                      ) : c.brand_name ? (
                        <span className="text-slate-400 truncate max-w-[120px]">
                          🏢 {c.brand_name}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {loadingMore && (
                <div className="p-3 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-slate-500 border-t-white rounded-full animate-spin inline-block"></span>
                  Memuat sesi lama...
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Main Chat Detail Area ─────────────────────────────────── */}
      {!activeConvId || !convDetail ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500">
          <div className="w-20 h-20 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-xl mb-1">
            <Archive className="w-10 h-10 text-slate-600 stroke-[1.5]" />
          </div>
          <div className="text-lg font-bold text-white">Pilih percakapan arsip</div>
          <div className="text-xs text-slate-400">Klik arsip percakapan di sebelah kiri untuk melihat riwayat</div>
        </div>
      ) : (
        <div className="flex-1 flex min-w-0">
          <div className="flex-1 flex flex-col min-w-0 bg-slate-950">
            {/* Header Bar */}
            <div className="h-16 border-b border-slate-800 flex items-center px-4 gap-3 flex-shrink-0 bg-slate-900 justify-between">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 border border-slate-700">
                  {(convDetail.visitor_name || "V").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-base text-white truncate flex items-center gap-2">
                    <span>{convDetail.visitor_name || convDetail.visitor_id || "Pengunjung"}</span>
                    {agent?.role === "superadmin" && convDetail.brand_name && (
                      <span className="text-[10px] px-2 py-0.5 rounded font-bold text-white shadow-sm flex-shrink-0 border border-slate-700" style={{ backgroundColor: convDetail.brand_color || '#4F46E5' }}>
                        🏢 {convDetail.brand_name}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <span>🔒 Archived Chat</span>
                    <span>•</span>
                    <span>IP: {convDetail.visitor_ip || "Localhost"}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setRightCollapsed(!rightCollapsed)}
                  className={`p-2 rounded-lg text-sm transition-all ${
                    !rightCollapsed ? "bg-vlc-600 text-white shadow-md" : "bg-slate-800 text-slate-400 hover:text-white"
                  }`}
                  title={rightCollapsed ? "Sembunyikan Panel Info Visitor" : "Tampilkan Panel Info Visitor"}
                >
                  {!rightCollapsed ? "▶" : "◀"}
                </button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {/* Started Date Divider */}
              <div className="flex items-center justify-center my-2">
                <span className="text-[11px] font-semibold bg-slate-900 border border-slate-800 text-slate-400 px-3 py-1 rounded-full shadow-sm">
                  {formatDateHeader(convDetail.created_at)}
                </span>
              </div>

              {/* ↑ Previous Chat with this customer button (ONLY if older conversation exists) */}
              {adjacent.previousConv && (
                <div className="flex justify-center my-1">
                  <button
                    onClick={() => navigate(`/archives/${adjacent.previousConv.id}`)}
                    className="px-4 py-1.5 rounded-full bg-vlc-600/20 hover:bg-vlc-600/30 text-vlc-300 hover:text-white border border-vlc-500/40 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                  >
                    <span>↑</span>
                    <span>Previous chat with this customer</span>
                  </button>
                </div>
              )}

              {/* Message bubbles */}
              {messages.map((msg, i) => {
                const isVisitor = msg.sender_type === "visitor";
                const isSystem = msg.sender_type === "system";

                if (isSystem) {
                  return (
                    <div key={msg.id || i} className="flex justify-center my-1">
                      <span className="text-[11px] bg-slate-900/80 border border-slate-800 text-slate-400 px-3 py-1 rounded-full text-center max-w-md">
                        {msg.text}
                      </span>
                    </div>
                  );
                }

                return (
                  <div key={msg.id || i} className={`flex items-start gap-2.5 ${isVisitor ? "" : "flex-row-reverse"}`}>
                    <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-1">
                      {isVisitor ? (convDetail.visitor_name || "V").charAt(0).toUpperCase() : (msg.sender_display_name || msg.sender_name || "CS").charAt(0).toUpperCase()}
                    </div>
                    <div className={`max-w-[70%] flex flex-col ${isVisitor ? "items-start" : "items-end"}`}>
                      <div className="text-[10px] text-slate-400 mb-1 px-1 font-semibold">
                        {isVisitor ? (convDetail.visitor_name || "Visitor") : (msg.sender_display_name || msg.sender_name || "CS")}
                      </div>
                      <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        isVisitor ? "bg-slate-800 text-white rounded-tl-sm border border-slate-700" : "bg-vlc-600 text-white rounded-tr-sm shadow-md"
                      }`}>
                        {msg.message_type === "image" && msg.file_url ? (
                          <img
                            src={getFileUrl(msg.file_url)}
                            alt="file"
                            className="max-w-xs rounded-lg cursor-pointer transition-transform hover:scale-[1.02] shadow-md border border-slate-700/50"
                            onClick={() => setZoomImage(getFileUrl(msg.file_url))}
                          />
                        ) : msg.message_type === "file" && msg.file_url ? (
                          <a
                            href={getFileUrl(msg.file_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                          >
                            <span className="text-lg">📎</span>
                            <span className="underline text-xs">{msg.file_name || "File"}</span>
                          </a>
                        ) : (
                          <span dangerouslySetInnerHTML={{ __html: simpleMarkdown(msg.text || "") }} />
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1 px-1">
                        {formatTime(msg.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* End timestamp note */}
              <div className="text-center text-[11px] text-slate-500 my-2">
                Archived • {formatTime(convDetail.resolved_at || convDetail.updated_at)}
              </div>

              {/* ↓ Next Chat with this customer button (ONLY if newer conversation exists) */}
              {adjacent.nextConv && (
                <div className="flex justify-center my-1">
                  <button
                    onClick={() => {
                      if (adjacent.nextConv.status === "resolved") {
                        navigate(`/archives/${adjacent.nextConv.id}`);
                      } else {
                        navigate(`/chats/${adjacent.nextConv.id}`);
                      }
                    }}
                    className="px-4 py-1.5 rounded-full bg-vlc-600/20 hover:bg-vlc-600/30 text-vlc-300 hover:text-white border border-vlc-500/40 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                  >
                    <span>↓</span>
                    <span>Next chat with this customer</span>
                  </button>
                </div>
              )}

              <div ref={msgsEndRef} />
            </div>

            {/* ── Footer Banner: "This chat has been archived." + [ Open chat ] ── */}
            <div className="border-t border-slate-800 p-6 bg-slate-900/90 flex flex-col items-center justify-center gap-3 flex-shrink-0">
              <span className="text-sm font-medium text-slate-400">
                This chat has been archived.
              </span>
              <button
                onClick={handleReopen}
                disabled={reopening}
                className="px-6 py-2 rounded-xl bg-slate-800 hover:bg-vlc-600 border border-slate-700 hover:border-vlc-500 text-white font-semibold text-sm transition-all shadow-md active:scale-95 disabled:opacity-50"
              >
                {reopening ? "Opening..." : "Open chat"}
              </button>
            </div>
          </div>

          {/* ── Shared Visitor Info Panel ──────────────────────────── */}
          {!rightCollapsed && (
            <VisitorInfoPanel
              convDetail={convDetail}
              tags={tags}
              setTags={setTags}
              onViewAllChats={handleViewAllChats}
            />
          )}
        </div>
      )}
      </div>
    </div>
  );
}

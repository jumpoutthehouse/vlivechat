import { useEffect, useState } from "react";
import { Building, RefreshCw, Clock, ThumbsUp, TrendingUp, TrendingDown, Minus } from "lucide-react";
import useChatStore from "../store/chatStore";
import api, { getFileUrl } from "../api";
import toast from "react-hot-toast";
import BrandSwitcherDropdown from "../components/BrandSwitcherDropdown";
import Avatar from "../components/Avatar";

function getGreetingTime() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
}

export default function Home() {
  const agent = useChatStore((s) => s.agent);
  const selectedWorkspaceId  = useChatStore((s) => s.selectedWorkspaceId);
  const setSelectedWorkspace = useChatStore((s) => s.setSelectedWorkspace);

  const [allWorkspaces, setAllWorkspaces] = useState([]);
  const [mode, setMode] = useState("all"); // "my" | "all"
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const isSuperadmin = agent?.role === "superadmin";

  // Load all workspaces for superadmin workspace selector on /home
  useEffect(() => {
    if (isSuperadmin) {
      api.get("/workspaces")
        .then(({ data }) => setAllWorkspaces(data.workspaces || data || []))
        .catch(() => {});
    }
  }, [isSuperadmin]);

  const socket = useChatStore(s => s.socket);
  const socketConnected = useChatStore(s => s.socketConnected);

  useEffect(() => {
    fetchHomeStats();

    // 1. Live 3-second interval ticker for 100% realtime home stats
    const interval = setInterval(() => {
      fetchHomeStats(true);
    }, 3000);

    // 2. Listen to socket events for instant updates
    if (socket) {
      const handleEvent = () => fetchHomeStats(true);
      socket.on("conversation:new",      handleEvent);
      socket.on("conversation:update",   handleEvent);
      socket.on("conversation:resolved", handleEvent);
      socket.on("agents:update",         handleEvent);
      socket.on("agent:online",          handleEvent);
      socket.on("agent:offline",         handleEvent);
      socket.on("agent:status_changed",  handleEvent);
      socket.on("agent:updated",         handleEvent);

      return () => {
        clearInterval(interval);
        socket.off("conversation:new",      handleEvent);
        socket.off("conversation:update",   handleEvent);
        socket.off("conversation:resolved", handleEvent);
        socket.off("agents:update",         handleEvent);
        socket.off("agent:online",          handleEvent);
        socket.off("agent:offline",         handleEvent);
        socket.off("agent:status_changed",  handleEvent);
        socket.off("agent:updated",         handleEvent);
      };
    }

    return () => clearInterval(interval);
  }, [mode, selectedWorkspaceId, socket, socketConnected]);

  async function fetchHomeStats(silent = false) {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get("/home/stats", {
        params: {
          mode,
          workspace_id: isSuperadmin ? (selectedWorkspaceId || "all") : undefined,
        },
      });
      setStats(data);
    } catch {
      if (!silent) toast.error("Gagal memuat data statistik Home");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  const agentName = agent?.display_name || agent?.name || "CS Admin";
  const selectedBrand = allWorkspaces.find(w => w.id === selectedWorkspaceId);
  const brandName = isSuperadmin 
    ? (selectedBrand ? (selectedBrand.brand_name || selectedBrand.name) : "Semua Brand (Global)")
    : (agent?.workspace_name || "vLiveChat");

  const chartData = stats?.chartData || [
    { day: "Sun", count: 0 },
    { day: "Mon", count: 0 },
    { day: "Tue", count: 0 },
    { day: "Wed", count: 0 },
    { day: "Thu", count: 0 },
    { day: "Fri", count: 0 },
    { day: "Sat", count: 0 },
  ];

  const maxCount = Math.max(...chartData.map((d) => d.count), 10);
  const diff7Days = stats?.diff7Days ?? 0;
  const total7Days = stats?.total7Days ?? 0;

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 text-slate-100 p-6 lg:p-10 font-sans">
      <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
        {/* ── Greeting Header ────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div className="flex items-center gap-4">
            <Avatar src={agent?.avatar_url} name={agentName} bg={agent?.avatar_bg} size="w-14 h-14" textClass="text-xl" />
            <div>
              <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
                <span>{getGreetingTime()}, {agentName}!</span>
              </h1>
              <div className="text-xs text-slate-400 mt-1 flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-vlc-400" />
                  <span>Workspace: <strong className="text-white">{brandName}</strong></span>
                </span>
                <span>•</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Realtime Live Data
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Superadmin Workspace Selector Dropdown on /home */}
            {isSuperadmin && allWorkspaces.length > 0 && (
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl p-1.5">
                <span className="text-xs text-slate-400 font-medium px-1">Brand:</span>
                <BrandSwitcherDropdown
                  workspaces={allWorkspaces}
                  selectedId={selectedWorkspaceId}
                  onSelect={(id) => setSelectedWorkspace(id)}
                  label="Semua Brand (Global)"
                />
                {selectedWorkspaceId && (
                  <button
                    onClick={() => setSelectedWorkspace(null)}
                    className="text-[11px] text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800 hover:bg-slate-700"
                    title="Tampilkan Global Stats Semua Brand"
                  >
                    Reset Global
                  </button>
                )}
              </div>
            )}

            <button
              onClick={fetchHomeStats}
              className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-sm active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-purple-400" : ""}`} />
              <span>Refresh Data</span>
            </button>
          </div>
        </div>

        {/* ── Real-time Overview (3 Metric Cards) ──────────────────── */}
        <div>
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">
            Real time overview
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Card 1: Customers Online */}
            <div className="bg-slate-900/90 border border-slate-800/90 hover:border-vlc-500/40 rounded-2xl p-6 shadow-xl transition-all group">
              <div className="text-xs font-semibold text-slate-400 mb-2">Customers online</div>
              <div className="text-4xl font-extrabold text-white tracking-tight group-hover:scale-105 transition-transform duration-200">
                {loading ? "..." : (stats?.customersOnline ?? 0)}
              </div>
            </div>

            {/* Card 2: Ongoing Chats */}
            <div className="bg-slate-900/90 border border-slate-800/90 hover:border-vlc-500/40 rounded-2xl p-6 shadow-xl transition-all group">
              <div className="text-xs font-semibold text-slate-400 mb-2">Ongoing chats</div>
              <div className="text-4xl font-extrabold text-white tracking-tight group-hover:scale-105 transition-transform duration-200">
                {loading ? "..." : (stats?.ongoingChats ?? 0)}
              </div>
            </div>

            {/* Card 3: Logged in Agents */}
            <div className="bg-slate-900/90 border border-slate-800/90 hover:border-vlc-500/40 rounded-2xl p-6 shadow-xl transition-all group">
              <div className="text-xs font-semibold text-slate-400 mb-2">Logged in agents</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-extrabold text-white tracking-tight group-hover:scale-105 transition-transform duration-200">
                  {loading ? "..." : (stats?.loggedInAgents ?? 0)}
                </span>
                <span className="text-slate-500 text-sm font-bold">
                  of {loading ? "..." : (stats?.totalAgents ?? 0)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Last 7 Days Chart Section ────────────────────────────── */}
        <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-6 lg:p-8 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Last 7 days</h2>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-2xl font-extrabold text-white">
                  {total7Days}
                </span>

                {/* Real comparison badge without gimmick */}
                {diff7Days > 0 ? (
                  <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    +{diff7Days} vs 7 hari lalu
                  </span>
                ) : diff7Days < 0 ? (
                  <span className="text-xs font-semibold text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/20 flex items-center gap-1">
                    <TrendingDown className="w-3 h-3" />
                    {diff7Days} vs 7 hari lalu
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-slate-400 bg-slate-800/80 px-2.5 py-0.5 rounded-full border border-slate-700/60 flex items-center gap-1">
                    <Minus className="w-3 h-3 text-slate-500" />
                    0 vs 7 hari lalu
                  </span>
                )}
              </div>
            </div>

            {/* Mode Switcher: My stats vs All agents */}
            <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs font-semibold">
              <button
                onClick={() => setMode("my")}
                className={`px-4 py-1.5 rounded-lg transition-all ${
                  mode === "my" ? "bg-slate-800 text-white font-bold shadow-md" : "text-slate-400 hover:text-white"
                }`}
              >
                My stats
              </button>
              <button
                onClick={() => setMode("all")}
                className={`px-4 py-1.5 rounded-lg transition-all ${
                  mode === "all" ? "bg-slate-800 text-white font-bold shadow-md" : "text-slate-400 hover:text-white"
                }`}
              >
                All agents
              </button>
            </div>
          </div>

          {/* Bar Chart Visualization */}
          <div className="pt-4">
            <div className="h-48 flex items-end justify-between gap-3 lg:gap-6 px-4">
              {chartData.map((d, idx) => {
                const heightPercent = maxCount > 0
                  ? Math.max(d.count > 0 ? 12 : 4, Math.round((d.count / maxCount) * 100))
                  : 4;
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 group h-full justify-end">
                    {/* Exact Count Number Label Above Bar */}
                    <span className="text-xs font-bold text-slate-300 group-hover:text-white group-hover:scale-110 transition-all">
                      {d.count}
                    </span>

                    {/* Bar */}
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full ${d.count > 0 ? 'bg-vlc-600 hover:bg-vlc-500 shadow-md group-hover:shadow-vlc-500/40' : 'bg-slate-800/40'} rounded-t-lg transition-all duration-300 cursor-pointer`}
                      title={`${d.day} (${d.date}): ${d.count} chat`}
                    />

                    {/* Day Name Label */}
                    <span className="text-xs font-semibold text-slate-400 group-hover:text-white transition-colors mt-1">
                      {d.day}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Summary Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-800/80 text-xs">
            <div className="flex items-center justify-between p-4 bg-slate-950/60 border border-slate-800/60 rounded-xl hover:border-slate-700/80 transition-colors">
              <span className="text-slate-400 font-semibold flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-vlc-400" />
                <span>Queued visitors</span>
              </span>
              <span className="font-extrabold text-white text-lg">{stats?.queuedVisitors ?? 0}</span>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-950/60 border border-slate-800/60 rounded-xl hover:border-slate-700/80 transition-colors">
              <span className="text-slate-400 font-semibold flex items-center gap-2 text-sm">
                <ThumbsUp className="w-4 h-4 text-emerald-400" />
                <span>Chat satisfaction</span>
              </span>
              <span className="font-extrabold text-emerald-400 text-lg">
                {(stats?.totalRatings > 0) ? `${stats.satisfactionRate}% (${stats.totalRatings} rating)` : "0% (Belum ada rating)"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

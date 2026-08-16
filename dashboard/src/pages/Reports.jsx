import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import {
  MessageSquare,
  CheckCircle2,
  XCircle,
  Zap,
  Clock,
  Star,
  ShieldCheck,
  Building,
  Download,
  RefreshCw,
  BarChart2,
  User,
  Users,
  AlertCircle,
  FileSpreadsheet,
} from "lucide-react";
import api, { getFileUrl } from "../api";
import { format, formatDistanceToNow } from "date-fns";
import { id } from "date-fns/locale";
import toast from "react-hot-toast";
import useChatStore from "../store/chatStore";

const COLORS = ["#10b981","#ef4444","#f59e0b","#3b82f6","#8b5cf6"];
const API_BASE = import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";

export default function Reports() {
  const navigate = useNavigate();
  const [period,      setPeriod]      = useState("week");
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  
  // Missed Chat Pagination State
  const [missedChats, setMissedChats] = useState([]);
  const [missedLoading, setMissedLoading] = useState(false);
  const [missedPage, setMissedPage]   = useState(1);
  const [missedLimit, setMissedLimit] = useState(20);
  const [missedTotal, setMissedTotal] = useState(0);
  const [missedTotalPages, setMissedTotalPages] = useState(1);

  // Custom Date & Filtered Export Modal State
  const [showExportModal, setShowExportModal] = useState(false);
  const [useCustomDate, setUseCustomDate]   = useState(false);
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo]     = useState("");
  const [exportWsId, setExportWsId]         = useState("");
  const [exportType, setExportType]         = useState("all");

  const agent = useChatStore(s => s.agent);
  const [activeTab,   setActiveTab]   = useState(agent?.role === "superadmin" ? "brands" : "overview");
  const [exporting,   setExporting]   = useState(false);

  const [brandsData, setBrandsData] = useState([]);
  const [brandsLoading, setBrandsLoading] = useState(false);

  const selectConv = useChatStore(s => s.selectConversation);

  const handleSelectMissedConv = (convId, status) => {
    selectConv(convId);
    if (status === "resolved") {
      navigate(`/archives/${convId}`);
    } else {
      navigate(`/chats/${convId}`);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: r } = await api.get("/reports/overview", { params: { period } });
      setData(r);
    } catch { toast.error("Gagal memuat laporan"); }
    setLoading(false);
  }, [period]);

  const loadMissed = useCallback(async (p = missedPage, l = missedLimit) => {
    setMissedLoading(true);
    try {
      const { data: r } = await api.get("/reports/missed", {
        params: { period, page: p, limit: l }
      });
      const list = r.conversations || r.missed || [];
      const totalCount = (typeof r.total === "number" && r.total > 0) ? r.total : Math.max(list.length, parseInt(r.total) || 0);
      const totalPages = Math.ceil(totalCount / l) || 1;

      setMissedChats(list);
      setMissedTotal(totalCount);
      setMissedTotalPages(totalPages);
    } catch { toast.error("Gagal memuat missed chat"); }
    setMissedLoading(false);
  }, [period, missedPage, missedLimit]);

  const loadBrands = useCallback(async () => {
    setBrandsLoading(true);
    try {
      const { data: r } = await api.get("/reports/brands", { params: { period } });
      setBrandsData(r.brands || []);
    } catch { toast.error("Gagal memuat data brand"); }
    setBrandsLoading(false);
  }, [period]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (activeTab === "missed") loadMissed(missedPage, missedLimit); }, [activeTab, loadMissed, missedPage, missedLimit]);
  // Load brands immediately for superadmin, or when switching to brands tab
  useEffect(() => {
    if (agent?.role === "superadmin" || activeTab === "brands") loadBrands();
  }, [activeTab, loadBrands, agent?.role]);

  const handleExport = () => setShowExportModal(true);

  async function handleExportSubmit(e) {
    if (e) e.preventDefault();
    setExporting(true);
    try {
      const token = localStorage.getItem("vlc_token");
      let url = `${API_BASE}/api/v1/reports/export?export_type=${exportType}`;
      
      if (useCustomDate && exportDateFrom && exportDateTo) {
        url += `&date_from=${encodeURIComponent(exportDateFrom)}&date_to=${encodeURIComponent(exportDateTo)}`;
      } else {
        url += `&period=${period}`;
      }

      if (exportWsId) {
        url += `&workspace_id=${encodeURIComponent(exportWsId)}`;
      }

      const res = await fetch(url, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      const fileLabel = useCustomDate ? `${exportDateFrom}_to_${exportDateTo}` : period;
      a.download = `laporan-vlivechat-${exportType}-${fileLabel}-${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(blobUrl);
      toast.success("📥 Laporan berhasil didownload!");
      setShowExportModal(false);
    } catch (err) {
      toast.error("Gagal export laporan: " + err.message);
    }
    setExporting(false);
  }

  const periodOptions = [
    { key: "day",   label: "Hari Ini" },
    { key: "week",  label: "7 Hari" },
    { key: "month", label: "30 Hari" },
    { key: "year",  label: "1 Tahun" },
  ];

  const tabs = [
    { key: "overview", label: "📊 Overview" },
    { key: "agents",   label: "👤 Performa Agen" },
    { key: "missed",   label: "❌ Missed Chat" },
  ];

  const t = data?.totals || {};
  const sla = data?.sla || {};
  const totalSLA = parseInt(sla.total) || 0;
  const frtPct = totalSLA ? Math.round((parseInt(sla.within_frt_sla || 0) / totalSLA) * 100) : 0;

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-950">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Laporan & Analitik</h1>
            <p className="text-slate-400 text-sm mt-1">Performa tim Customer Service Anda</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {periodOptions.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  period === p.key ? "bg-vlc-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                }`}>
                {p.label}
              </button>
            ))}
            <button onClick={handleExport} disabled={exporting}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm">
              {exporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 mb-6 gap-2">
          {(agent?.role === "superadmin"
            ? [
                { key: "brands",   label: "Multi-Brand Command Center", icon: Building },
                { key: "overview", label: "Overview Performa",          icon: BarChart2 },
                { key: "missed",   label: "Missed Chat & Delay",         icon: AlertCircle },
              ]
            : [
                { key: "overview", label: "Overview Performa",          icon: BarChart2 },
                { key: "missed",   label: "Missed Chat & Delay",         icon: AlertCircle },
              ]
          ).map(tab => {
            const IconComponent = tab.icon;
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`px-5 py-2.5 text-sm font-semibold transition-colors flex items-center gap-2 ${
                  activeTab === tab.key ? "text-white border-b-2 border-vlc-500" : "text-slate-500 hover:text-slate-300"
                }`}>
                <IconComponent className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Brands tab rendered OUTSIDE loading gate so it always shows for superadmin */}
        {activeTab === "brands" && (
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <Building className="w-5 h-5 text-vlc-400" />
                  <span>Multi-Brand Command Center & Analytics</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Ringkasan performa dan pemantauan real-time untuk setiap brand/workspace</p>
              </div>
              <button onClick={loadBrands} disabled={brandsLoading} className="btn-secondary text-xs flex items-center gap-1.5">
                {brandsLoading ? <span className="w-3.5 h-3.5 border-2 border-vlc-400 border-t-transparent rounded-full animate-spin"></span> : <RefreshCw className="w-3.5 h-3.5" />}
                Refresh Data
              </button>
            </div>

            {brandsLoading ? (
              <div className="flex justify-center py-12 text-slate-500">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-vlc-500 border-t-transparent rounded-full animate-spin"></div>
                  <span>Memuat data brand...</span>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase">
                      <th className="pb-3">Brand / Workspace</th>
                      <th className="pb-3 text-center">Total Chat</th>
                      <th className="pb-3 text-center">Selesai</th>
                      <th className="pb-3 text-center">Terlewat</th>
                      <th className="pb-3 text-center">CS Online</th>
                      <th className="pb-3 text-center">Avg Response</th>
                      <th className="pb-3 text-right">Aksi Watcher</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {brandsData.map(b => (
                      <tr key={b.workspace_id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 font-semibold text-white">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: b.brand_color || "#4F46E5" }}></span>
                            <div>
                              <div>{b.brand_name}</div>
                              <div className="text-[10px] text-slate-500 font-mono">{b.workspace_code}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-center font-bold text-white">{b.total_chats || 0}</td>
                        <td className="py-3 text-center text-emerald-400 font-bold">{b.resolved_chats || 0}</td>
                        <td className="py-3 text-center text-red-400 font-bold">{b.missed_chats || 0}</td>
                        <td className="py-3 text-center">
                          <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-bold">
                            {b.online_agents || 0} CS
                          </span>
                        </td>
                        <td className="py-3 text-center font-mono text-slate-300">{b.avg_response_sec ? `${b.avg_response_sec}s` : "—"}</td>
                        <td className="py-3 text-right">
                          <button onClick={() => navigate(`/chats?w=${b.workspace_id}`)}
                            className="btn-ghost text-xs text-vlc-400 hover:text-white px-2 py-1 rounded">
                            Lihat Feed →
                          </button>
                        </td>
                      </tr>
                    ))}
                    {brandsData.length === 0 && (
                      <tr><td colSpan={7} className="py-8 text-center text-slate-500">Tidak ada data workspace</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20 text-slate-500">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-vlc-500 border-t-transparent rounded-full animate-spin"></div>
              <span>Memuat laporan...</span>
            </div>
          </div>
        ) : activeTab !== "brands" && (
          <>
            {activeTab === "overview" && (
              <>
                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <StatCard icon={MessageSquare} label="Total Chat" value={t.total || 0} color="blue" />
                  <StatCard icon={CheckCircle2} label="Diselesaikan" value={t.resolved || 0} color="green" />
                  <StatCard icon={XCircle} label="Terlewat & Delay" value={t.missed || 0} color="red" />
                  <StatCard icon={Zap} label="Avg FRT" value={`${t.avg_frt_min || 0} mnt`} color="yellow" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <StatCard icon={Clock} label="Avg Resolusi" value={`${t.avg_resolution_min || 0} mnt`} color="purple" />
                  <StatCard icon={XCircle} label="Missed Murni" value={t.missed_pure || 0} color="red" />
                  <StatCard icon={Star} label="Avg Rating" value={t.avg_rating ? Number(t.avg_rating).toFixed(1) + "/5" : "—"} color="yellow" />
                  <StatCard icon={ShieldCheck} label="SLA Kepatuhan" value={`${frtPct}%`} color={frtPct >= 80 ? "green" : "red"} />
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                  <div className="card p-5">
                    <h3 className="font-bold text-white mb-4 text-sm">Volume Chat per Hari</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={data?.byDay || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="date" tickFormatter={v => format(new Date(v),"dd/MM")} tick={{ fill: "#64748b", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#64748b", fontSize: 11 }} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", color: "#f1f5f9" }}
                          labelFormatter={v => {
                            try { return format(new Date(v), "dd MMM yyyy", { locale: id }); } catch { return v; }
                          }}
                        />
                        <Bar dataKey="total"    fill="#3b82f6" radius={[4,4,0,0]} name="Total" />
                        <Bar dataKey="resolved" fill="#10b981" radius={[4,4,0,0]} name="Selesai" />
                        <Bar dataKey="missed"   fill="#ef4444" radius={[4,4,0,0]} name="Terlewat & Delay" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="card p-5">
                    <h3 className="font-bold text-white mb-4 text-sm">SLA First Response Time Breakdown</h3>
                    {totalSLA > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie
                            data={[
                              { name: "Dalam SLA",            value: parseInt(sla.within_frt_sla || 0) },
                              { name: "Melewati SLA / Delay", value: parseInt(t.missed || 0) },
                            ].filter(d => d.value > 0)}
                            cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                            dataKey="value" paddingAngle={3}
                          >
                            <Cell fill="#10b981" />
                            <Cell fill="#ef4444" />
                          </Pie>
                          <Tooltip contentStyle={{ background:"#1e293b",border:"1px solid #334155",borderRadius:"8px",color:"#f1f5f9" }} />
                          <Legend iconType="circle" wrapperStyle={{ fontSize: "12px", color: "#94a3b8" }} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-48 text-slate-500 text-sm">Tidak ada data</div>
                    )}
                  </div>
                </div>
              </>
            )}

            {activeTab === "agents" && (
              <div className="card p-5">
                <h3 className="font-bold text-white mb-4 text-sm">Performa Agen</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-400 uppercase tracking-wider">
                        <th className="text-left pb-3 font-semibold">Agen</th>
                        <th className="text-right pb-3 font-semibold">Total</th>
                        <th className="text-right pb-3 font-semibold">Selesai</th>
                        <th className="text-right pb-3 font-semibold">Avg FRT</th>
                        <th className="text-right pb-3 font-semibold">Avg Rating</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {(data?.byAgent || []).map(a => (
                        <tr key={a.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              {a.avatar_url
                                ? <img src={getFileUrl(a.avatar_url)} className="w-7 h-7 rounded-full object-cover" alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                : <div className="w-7 h-7 rounded-full bg-vlc-600 flex items-center justify-center text-white text-xs font-bold">
                                    {(a.display_name || a.name || "?").charAt(0)}
                                  </div>
                              }
                              <span className="text-white font-medium">{a.display_name || a.name}</span>
                            </div>
                          </td>
                          <td className="py-3 text-right text-slate-300">{a.total_handled || 0}</td>
                          <td className="py-3 text-right text-emerald-400">{a.resolved || 0}</td>
                          <td className="py-3 text-right text-slate-300">{a.avg_frt_min ? a.avg_frt_min + " mnt" : "—"}</td>
                          <td className="py-3 text-right">
                            {a.avg_rating
                              ? <span className="text-yellow-400 font-semibold">⭐ {Number(a.avg_rating).toFixed(1)}</span>
                              : <span className="text-slate-500">—</span>
                            }
                          </td>
                        </tr>
                      ))}
                      {(!data?.byAgent || data.byAgent.length === 0) && (
                        <tr><td colSpan={5} className="py-8 text-center text-slate-500">Tidak ada data agent</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "missed" && (
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-white text-sm">❌ Missed Chat — Klik untuk Lihat Percakapan</h3>
                  <div className="flex items-center gap-3">
                    <select value={missedLimit} onChange={e => { setMissedLimit(Number(e.target.value)); setMissedPage(1); }}
                      className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white">
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                    <button onClick={loadMissed} className="text-xs text-slate-400 hover:text-white transition-colors">🔄 Refresh</button>
                  </div>
                </div>
                {missedLoading ? (
                  <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
                    <div className="w-6 h-6 border-2 border-vlc-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                    Memuat...
                  </div>
                ) : missedChats.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                    <div className="text-4xl mb-3">✅</div>
                    <div className="text-sm">Tidak ada missed chat dalam periode ini</div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {missedChats.map(c => (
                        <button key={c.id} onClick={() => handleSelectMissedConv(c.id, c.status)}
                          className="w-full text-left p-4 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700 hover:border-vlc-500/50 transition-all group">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className="w-9 h-9 rounded-full bg-red-900/50 flex items-center justify-center text-red-300 font-bold text-sm flex-shrink-0 mt-0.5">
                                {(c.visitor_name || c.visitor_id || "V").charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="font-semibold text-sm text-white truncate">
                                    {c.visitor_name || c.visitor_id || "Pengunjung"}
                                  </span>
                                  {(c.brand_name || c.workspace_name) && (
                                    <span className="text-[10px] px-2 py-0.5 rounded font-bold text-white flex-shrink-0"
                                          style={{ backgroundColor: c.brand_color || "#3b82f6" }}>
                                      {c.brand_name || c.workspace_name}
                                    </span>
                                  )}
                                  {c.sla_first_response_exceeded && (
                                    <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold flex-shrink-0">SLA FRT</span>
                                  )}
                                  {c.sla_resolution_exceeded && (
                                    <span className="text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded font-bold flex-shrink-0">SLA RES</span>
                                  )}
                                </div>
                                {c.first_message && (
                                  <p className="text-xs text-slate-400 truncate">"{c.first_message}"</p>
                                )}
                                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500">
                                  <span>{c.message_count || 0} pesan</span>
                                  {c.agent_name && <span>• Agen: {c.agent_display_name || c.agent_name}</span>}
                                </div>
                              </div>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <div className="text-xs font-bold text-red-400 mb-0.5">
                                {c.missed_at
                                  ? `⏱️ Terlewat: Pukul ${format(new Date(c.missed_at), "HH:mm:ss 'WIB'", { locale: id })}`
                                  : c.created_at
                                  ? `⏱️ Dibuat: Pukul ${format(new Date(c.created_at), "HH:mm:ss 'WIB'", { locale: id })}`
                                  : ""}
                              </div>
                              <div className="text-[10px] text-slate-400 mb-1">
                                {c.missed_at
                                  ? format(new Date(c.missed_at), "dd MMM yyyy", { locale: id })
                                  : c.created_at
                                  ? format(new Date(c.created_at), "dd MMM yyyy", { locale: id })
                                  : ""}
                                {" • "}
                                {c.created_at ? formatDistanceToNow(new Date(c.created_at), { locale: id, addSuffix: true }) : ""}
                              </div>
                              <span className="text-[10px] bg-vlc-600/20 text-vlc-400 px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                Buka Chat →
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                    {/* Pagination Bar */}
                    <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-800 text-xs text-slate-400 flex-wrap gap-3">
                      <div>Menampilkan <strong className="text-white">Hal {missedPage}</strong> dari <strong className="text-white">{missedTotalPages}</strong> (Total <strong className="text-emerald-400">{missedTotal}</strong>)</div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setMissedPage(p => Math.max(1, p - 1))} disabled={missedPage <= 1} className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white disabled:opacity-40">‹</button>
                        {Array.from({ length: Math.min(5, missedTotalPages) }, (_, i) => {
                          const pageNum = i + 1;
                          return (
                            <button key={pageNum} onClick={() => setMissedPage(pageNum)}
                              className={`w-7 h-7 rounded-lg text-xs font-bold ${missedPage === pageNum ? "bg-vlc-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>
                              {pageNum}
                            </button>
                          );
                        })}
                        <button onClick={() => setMissedPage(p => Math.min(missedTotalPages, p + 1))} disabled={missedPage >= missedTotalPages} className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white disabled:opacity-40">›</button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Export Modal ── */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-white font-bold text-lg flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                  Export Laporan Excel
                </h2>
                <p className="text-slate-400 text-xs mt-0.5">Pilih rentang tanggal & jenis data yang ingin di-export</p>
              </div>
              <button onClick={() => setShowExportModal(false)} className="text-slate-500 hover:text-white text-xl font-bold transition-colors">✕</button>
            </div>

            <form onSubmit={handleExportSubmit} className="space-y-4">
              {/* Export Type */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Jenis Data</label>
                <select value={exportType} onChange={e => setExportType(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-vlc-500">
                  <option value="all">Semua (Overview + Agen + Missed)</option>
                  <option value="overview">Overview Performa</option>
                  <option value="agents">Performa Agen</option>
                  <option value="missed">Missed Chat & Delay</option>
                </select>
              </div>

              {/* Date Range Toggle */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Rentang Waktu</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setUseCustomDate(false)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-all ${
                      !useCustomDate ? "bg-vlc-600 border-vlc-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                    }`}>
                    Pakai Periode Aktif ({periodOptions.find(p => p.key === period)?.label})
                  </button>
                  <button type="button" onClick={() => setUseCustomDate(true)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-all ${
                      useCustomDate ? "bg-vlc-600 border-vlc-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                    }`}>
                    Pilih Tanggal
                  </button>
                </div>
              </div>

              {/* Custom Date Inputs */}
              {useCustomDate && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Dari Tanggal</label>
                    <input type="date" value={exportDateFrom} onChange={e => setExportDateFrom(e.target.value)} required
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-vlc-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Sampai Tanggal</label>
                    <input type="date" value={exportDateTo} onChange={e => setExportDateTo(e.target.value)} required
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-vlc-500" />
                  </div>
                </div>
              )}

              {/* Workspace Filter (superadmin only) */}
              {agent?.role === "superadmin" && brandsData.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Filter Brand/Workspace</label>
                  <select value={exportWsId} onChange={e => setExportWsId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-vlc-500">
                    <option value="">Semua Brand</option>
                    {brandsData.map(b => (
                      <option key={b.workspace_id} value={b.workspace_id}>{b.brand_name || b.workspace_name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowExportModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-sm font-semibold transition-all">
                  Batal
                </button>
                <button type="submit" disabled={exporting || (useCustomDate && (!exportDateFrom || !exportDateTo))}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {exporting
                    ? <><RefreshCw className="w-4 h-4 animate-spin" /> Mengunduh...</>
                    : <><Download className="w-4 h-4" /> Download Excel</>
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: IconComp, label, value, color }) {
  const colorMap = {
    blue:   "from-blue-500/10  to-blue-500/5  border-blue-500/20  text-blue-400",
    green:  "from-emerald-500/10 to-emerald-500/5 border-emerald-500/20 text-emerald-400",
    red:    "from-red-500/10   to-red-500/5   border-red-500/20   text-red-400",
    yellow: "from-amber-500/10 to-amber-500/5 border-amber-500/20 text-amber-400",
    purple: "from-purple-500/10 to-purple-500/5 border-purple-500/20 text-purple-400",
  };
  const cls = colorMap[color] || colorMap.blue;
  const textColor = cls.split(" ").at(-1);

  return (
    <div className={`bg-gradient-to-br ${cls} border rounded-2xl p-4 flex flex-col justify-between shadow-lg`}>
      <div className="flex items-center justify-between mb-2">
        <div className={`w-9 h-9 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-center ${textColor}`}>
          {typeof IconComp === "string" ? <span>{IconComp}</span> : <IconComp className="w-5 h-5" />}
        </div>
      </div>
      <div>
        <div className={`text-2xl font-black mb-0.5 ${textColor}`}>{value}</div>
        <div className="text-xs text-slate-400 font-semibold">{label}</div>
      </div>
    </div>
  );
}

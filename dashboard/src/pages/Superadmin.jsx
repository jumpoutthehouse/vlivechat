import { useEffect, useState, useRef } from "react";
import {
  LayoutGrid, Building2, Trash2, ClipboardList,
  Plus, Edit3, Users, MessageSquare, Activity,
  CheckCircle, XCircle, ChevronDown, ChevronUp,
  Globe, Key, Palette, UserPlus, Eye, EyeOff, RefreshCw, AlertTriangle,
  UserX, ShieldOff,
} from "lucide-react";
import api from "../api";
import useChatStore from "../store/chatStore";
import toast from "react-hot-toast";
import { format } from "date-fns";

export default function Superadmin() {
  const [stats,      setStats]      = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [auditLogs,  setAuditLogs]  = useState([]);
  const [auditMeta,  setAuditMeta]  = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [auditWsFilter, setAuditWsFilter] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [auditLoading, setAuditLoading] = useState(false);
  const [activeTab,  setActiveTab]  = useState("overview");
  const [loading,    setLoading]    = useState(true);

  // Clear DB state
  const [clearForm, setClearForm] = useState({ workspace_id: "", date_from: "", date_to: "", status: "" });
  const [preview,    setPreview]    = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [clearing,   setClearing]   = useState(false);

  // Delete brand state
  const [deleteWs,      setDeleteWs]      = useState(null);  // workspace to delete
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [forceDelete,   setForceDelete]   = useState(false);

  // New workspace/brand form
  const [showBrandForm, setShowBrandForm] = useState(false);
  const [brandForm, setBrandForm] = useState({
    name: "", code: "", brand_name: "", brand_color: "#1e3a5f",
    welcome_title: "Halo! Ada yang bisa kami bantu?",
    welcome_subtitle: "Tim CS kami siap membantu 24/7.",
    owner_email: "", use_template: true,
  });
  const [brandSaving, setBrandSaving] = useState(false);

  // Edit workspace modal
  const [editWs, setEditWs] = useState(null);
  const [editWsForm, setEditWsForm] = useState({});
  const [editWsSaving, setEditWsSaving] = useState(false);

  // Create agent for workspace (from superadmin)
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [agentForm, setAgentForm] = useState({
    workspace_id: "", name: "", email: "", password: "",
    role: "admin", display_name: "", title: "", max_conversations: 5,
    permissions: ["livechat", "archives"],
  });
  const [agentSaving, setAgentSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);

  // Expanded workspace row
  const [expandedWs, setExpandedWs] = useState(null);
  const [wsAgents, setWsAgents] = useState({});
  const [wsAgentsLoading, setWsAgentsLoading] = useState({});

  // Reset Agent Password Modal (Superadmin)
  const [resetPwAgent, setResetPwAgent] = useState(null);
  const [newAgentPw, setNewAgentPw] = useState("");
  const [resetPwSaving, setResetPwSaving] = useState(false);

  async function handleResetAgentPassword() {
    if (!resetPwAgent) return;
    if (!newAgentPw || newAgentPw.trim().length < 8) {
      toast.error("Password minimal 8 karakter");
      return;
    }
    setResetPwSaving(true);
    try {
      const { data } = await api.post(`/agents/${resetPwAgent.id}/reset-password`, {
        new_password: newAgentPw.trim(),
      });
      toast.success(data.message || `Password untuk ${resetPwAgent.name} berhasil diperbarui!`);
      setResetPwAgent(null);
      setNewAgentPw("");
    } catch (err) {
      toast.error(err.response?.data?.error || "Gagal mengubah password");
    }
    setResetPwSaving(false);
  }

  const socket          = useChatStore(s => s.socket);
  const socketConnected = useChatStore(s => s.socketConnected);

  useEffect(() => {
    loadAll();
  }, []);

  // When socket (re)connects, clear wsAgents cache so fresh data is loaded on next expand
  const prevSAConnected = useRef(false);
  useEffect(() => {
    if (socketConnected && !prevSAConnected.current) {
      // Invalidate cached wsAgents so they reload with fresh is_online state
      setWsAgents({});
    }
    prevSAConnected.current = socketConnected;
  }, [socketConnected]);

  // Realtime socket listeners — re-attach whenever socket instance changes
  useEffect(() => {
    if (!socket) return;

    const patchAgentInWs = (agentId, patch) => {
      setWsAgents(prev => {
        const updated = {};
        for (const wsId of Object.keys(prev)) {
          updated[wsId] = (prev[wsId] || []).map(a =>
            a.id === agentId ? { ...a, ...patch } : a
          );
        }
        return updated;
      });
    };

    const handleOnline  = ({ agentId }) => patchAgentInWs(agentId, { is_online: true,  status: "online" });
    const handleOffline = ({ agentId }) => patchAgentInWs(agentId, { is_online: false, status: "offline" });
    const handleStatus  = ({ agentId, status }) => patchAgentInWs(agentId, { status, is_online: status !== "offline" });

    socket.on("agent:online",         handleOnline);
    socket.on("agent:offline",        handleOffline);
    socket.on("agent:status_changed", handleStatus);

    return () => {
      socket.off("agent:online",         handleOnline);
      socket.off("agent:offline",        handleOffline);
      socket.off("agent:status_changed", handleStatus);
    };
  }, [socket]);


  async function fetchAuditLogs(page = 1, limit = auditMeta.limit, wsId = auditWsFilter, act = auditActionFilter) {
    setAuditLoading(true);
    try {
      let url = `/superadmin/audit-logs?page=${page}&limit=${limit}`;
      if (wsId) url += `&workspace_id=${encodeURIComponent(wsId)}`;
      if (act)  url += `&action=${encodeURIComponent(act)}`;
      const { data } = await api.get(url);
      if (data?.data) {
        setAuditLogs(data.data);
        setAuditMeta(data.pagination || { page, limit, total: data.data.length, totalPages: 1 });
      } else if (Array.isArray(data)) {
        setAuditLogs(data);
        setAuditMeta({ page: 1, limit: data.length, total: data.length, totalPages: 1 });
      }
    } catch {
      toast.error("Gagal memuat audit log");
    }
    setAuditLoading(false);
  }

  // Lazy load audit logs when switching to audit tab or changing filters
  useEffect(() => {
    if (activeTab === "audit") {
      fetchAuditLogs(1, auditMeta.limit, auditWsFilter, auditActionFilter);
    }
  }, [activeTab, auditWsFilter, auditActionFilter]);

  async function loadAll() {
    setLoading(true);
    try {
      const [statsRes, wsRes] = await Promise.all([
        api.get("/superadmin/stats"),
        api.get("/superadmin/workspaces"),
      ]);
      setStats(statsRes.data);
      setWorkspaces(wsRes.data);
    } catch { toast.error("Gagal memuat data superadmin"); }
    setLoading(false);
  }

  // ── Load agents for a workspace ────────────────────────────────
  async function loadWsAgents(wsId) {
    if (wsAgents[wsId]) return; // cached
    setWsAgentsLoading(p => ({ ...p, [wsId]: true }));
    try {
      const { data } = await api.get(`/agents?workspace_id=${wsId}`);
      setWsAgents(p => ({ ...p, [wsId]: data }));
    } catch { toast.error("Gagal memuat agent workspace"); }
    setWsAgentsLoading(p => ({ ...p, [wsId]: false }));
  }

  function toggleExpand(wsId) {
    if (expandedWs === wsId) {
      setExpandedWs(null);
    } else {
      setExpandedWs(wsId);
      loadWsAgents(wsId);
    }
  }

  // ── Create Workspace ───────────────────────────────────────────
  async function handleCreateBrand() {
    if (!brandForm.name || !brandForm.code) {
      toast.error("Nama dan Code workspace wajib diisi"); return;
    }
    setBrandSaving(true);
    try {
      await api.post("/workspaces", {
        ...brandForm,
        brand_name: brandForm.brand_name || brandForm.name,
      });
      toast.success(`Brand "${brandForm.brand_name || brandForm.name}" berhasil dibuat!`);
      setBrandForm({ name: "", code: "", brand_name: "", brand_color: "#1e3a5f",
        welcome_title: "Halo! Ada yang bisa kami bantu?",
        welcome_subtitle: "Tim CS kami siap membantu 24/7.",
        owner_email: "", use_template: true });
      setShowBrandForm(false);
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || "Gagal membuat brand");
    }
    setBrandSaving(false);
  }

  async function handleDeleteBrand() {
    if (!deleteWs) return;
    setDeleteLoading(true);
    try {
      const url = forceDelete ? `/workspaces/${deleteWs.id}?force=true` : `/workspaces/${deleteWs.id}`;
      const { data } = await api.delete(url);
      toast.success(data.message);
      setDeleteWs(null);
      setForceDelete(false);
      loadAll();
    } catch (err) {
      const msg = err.response?.data?.error || "Gagal menghapus brand";
      if (err.response?.status === 409) {
        toast.error(msg);
        setForceDelete(true); // offer force delete
      } else {
        toast.error(msg);
      }
    }
    setDeleteLoading(false);
  }

  // ── Edit Workspace ─────────────────────────────────────────────
  function openEditWs(ws) {
    setEditWs(ws);
    setEditWsForm({
      name: ws.name || "",
      code: ws.code || "",
      brand_name: ws.brand_name || "",
      brand_color: ws.brand_color || "#1e3a5f",
      welcome_title: ws.welcome_title || "",
      welcome_subtitle: ws.welcome_subtitle || "",
      owner_email: ws.owner_email || "",
      is_active: ws.is_active,
    });
  }
  async function handleEditWs() {
    if (!editWs) return;
    setEditWsSaving(true);
    try {
      await api.patch(`/workspaces/${editWs.id}`, editWsForm);
      toast.success("Workspace diperbarui!");
      setEditWs(null);
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || "Gagal memperbarui workspace");
    }
    setEditWsSaving(false);
  }

  // ── Create Agent for Workspace ─────────────────────────────────
  async function handleCreateAgent() {
    if (!agentForm.workspace_id) { toast.error("Pilih brand/workspace terlebih dahulu"); return; }
    if (!agentForm.name || !agentForm.email || !agentForm.password) {
      toast.error("Nama, email, dan password wajib diisi"); return;
    }
    setAgentSaving(true);
    try {
      await api.post("/agents", agentForm);
      const ws = workspaces.find(w => w.id === agentForm.workspace_id);
      toast.success(`Agent berhasil dibuat di brand "${ws?.brand_name || ws?.name}"!`);
      setAgentForm({ workspace_id: "", name: "", email: "", password: "",
        role: "admin", display_name: "", title: "", max_conversations: 5,
        permissions: ["livechat", "archives"] });
      setShowAgentForm(false);
      // Refresh agents cache for that workspace
      setWsAgents(p => { const n = {...p}; delete n[agentForm.workspace_id]; return n; });
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || "Gagal membuat agent");
    }
    setAgentSaving(false);
  }

  // ── Clear DB ───────────────────────────────────────────────────
  async function previewClear() {
    if (!clearForm.date_from && !clearForm.date_to && !clearForm.workspace_id && !clearForm.status) {
      toast.error("Isi minimal satu filter"); return;
    }
    setPreviewing(true);
    try {
      const { data } = await api.get("/superadmin/clear/preview", { params: { ...clearForm } });
      setPreview(data);
    } catch (err) { toast.error(err.response?.data?.error || "Gagal preview"); }
    setPreviewing(false);
  }

  async function executeClear() {
    if (!preview) return;
    const total = preview.preview?.reduce((a, b) => a + parseInt(b.conversation_count || 0), 0) || 0;
    if (!confirm(`⚠️ PERINGATAN!\n\nAnda akan menghapus ${total} conversation secara PERMANEN.\nOperasi ini tidak bisa dibatalkan!\n\nLanjutkan?`)) return;
    const c2 = prompt('Ketik "HAPUS" untuk konfirmasi:');
    if (c2 !== "HAPUS") { toast.error("Dibatalkan"); return; }
    setClearing(true);
    try {
      const { data } = await api.post("/superadmin/clear", { ...clearForm, confirm: true });
      toast.success(data.message);
      setPreview(null);
      setClearForm({ workspace_id: "", date_from: "", date_to: "", status: "" });
      loadAll();
    } catch (err) { toast.error(err.response?.data?.error || "Gagal menghapus"); }
    setClearing(false);
  }

  const tabs = [
    { key: "overview",   label: "Overview",    icon: LayoutGrid },
    { key: "workspaces", label: "Brands",       icon: Building2 },
    { key: "clear",      label: "Clear Data",   icon: Trash2 },
    { key: "audit",      label: "Audit Log",    icon: ClipboardList },
  ];

  const PERM_OPTIONS = [
    { id: "livechat",  label: "Live Chat" },
    { id: "archives",  label: "Arsip Chat" },
    { id: "reports",   label: "Laporan" },
    { id: "agents",    label: "Kelola Agent" },
    { id: "settings",  label: "Pengaturan" },
  ];

  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-slate-500">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-vlc-500 border-t-transparent rounded-full animate-spin"></div>
        <span>Memuat data platform...</span>
      </div>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-950">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-vlc-600 rounded-xl flex items-center justify-center shadow-lg">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Superadmin Panel</h1>
              <p className="text-slate-400 text-sm">Platform management — vlivechat</p>
            </div>
          </div>
          <button onClick={loadAll} className="btn-ghost text-xs flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl mb-6 flex-wrap">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`flex-1 min-w-[100px] py-2.5 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                  activeTab === t.key
                    ? "bg-gradient-to-r from-purple-600 to-vlc-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                }`}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── OVERVIEW ─────────────────────────────────────────── */}
        {activeTab === "overview" && stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <SuperStat icon={<Building2 className="w-6 h-6" />} label="Total Brand" value={stats.workspaces} color="purple" />
            <SuperStat icon={<Users className="w-6 h-6" />} label="Total Agent" value={stats.agents} color="blue" />
            <SuperStat icon={<MessageSquare className="w-6 h-6" />} label="Total Chat (all time)" value={stats.total_conversations} />
            <SuperStat icon={<Activity className="w-6 h-6" />} label="Chat Aktif" value={stats.active_conversations} color="green" />
            <SuperStat icon={<ClipboardList className="w-6 h-6" />} label="Chat Hari Ini" value={stats.today_conversations} color="blue" />
          </div>
        )}

        {/* ── BRANDS / WORKSPACES ───────────────────────────────── */}
        {activeTab === "workspaces" && (
          <div className="space-y-4">
            {/* Action buttons */}
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setShowBrandForm(v => !v)}
                className="btn-primary flex items-center gap-2">
                <Plus className="w-4 h-4" />
                {showBrandForm ? "Tutup Form" : "Buat Brand Baru"}
              </button>
              <button onClick={() => setShowAgentForm(v => !v)}
                className="btn-secondary flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                {showAgentForm ? "Tutup Form" : "Buat Agent untuk Brand"}
              </button>
            </div>

            {/* ── CREATE BRAND FORM ──────────────────────────────── */}
            {showBrandForm && (
              <div className="card p-6 border border-purple-700/40 bg-purple-950/10 space-y-4 animate-bounce-in">
                <h2 className="font-bold text-white flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-purple-400" /> Buat Brand / Workspace Baru
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Nama Workspace *</label>
                    <input className="input" value={brandForm.name} placeholder="Contoh: Nama Brand Workspace"
                      onChange={e => setBrandForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">
                      Code Unik * <span className="text-slate-500 normal-case font-normal">(dipakai di embed widget)</span>
                    </label>
                    <input className="input font-mono" value={brandForm.code} placeholder="contoh: nama-brand"
                      onChange={e => setBrandForm(f => ({ ...f, code: e.target.value.toLowerCase().replace(/\s+/g, "_") }))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Nama Brand (tampil di widget)</label>
                    <input className="input" value={brandForm.brand_name} placeholder="Contoh: Nama Brand Anda"
                      onChange={e => setBrandForm(f => ({ ...f, brand_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Warna Brand</label>
                    <div className="flex gap-2">
                      <input type="color" value={brandForm.brand_color}
                        onChange={e => setBrandForm(f => ({ ...f, brand_color: e.target.value }))}
                        className="w-12 h-10 rounded-lg border border-slate-600 cursor-pointer bg-transparent" />
                      <input className="input flex-1 font-mono" value={brandForm.brand_color}
                        onChange={e => setBrandForm(f => ({ ...f, brand_color: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Judul Sambutan Widget</label>
                    <input className="input" value={brandForm.welcome_title}
                      onChange={e => setBrandForm(f => ({ ...f, welcome_title: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Subtitle Sambutan Widget</label>
                    <input className="input" value={brandForm.welcome_subtitle}
                      onChange={e => setBrandForm(f => ({ ...f, welcome_subtitle: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Email Owner (opsional)</label>
                    <input className="input" type="email" value={brandForm.owner_email} placeholder="admin@perusahaan.com"
                      onChange={e => setBrandForm(f => ({ ...f, owner_email: e.target.value }))} />
                  </div>

                </div>

                {/* Template Chatbot Picker */}
                <div className="rounded-xl border border-slate-700 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-800 border-b border-slate-700">
                    <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">🤖 Template Chatbot Awal</div>
                    <p className="text-xs text-slate-500 mt-0.5">Pilih konfigurasi chatbot untuk brand ini.</p>
                  </div>
                  <div className="p-4 space-y-3">
                    <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      brandForm.use_template
                        ? "border-vlc-500 bg-vlc-900/30"
                        : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
                    }`}>
                      <input type="radio" name="template_mode" checked={brandForm.use_template === true}
                        onChange={() => setBrandForm(f => ({ ...f, use_template: true }))}
                        className="mt-0.5 accent-vlc-500" />
                      <div>
                        <div className="text-sm font-semibold text-white">📋 Gunakan Template Standar</div>
                        <div className="text-xs text-slate-400 mt-0.5">Sudah tersedia node: Kendala Akun, Pembayaran, Bonus, Aplikasi, Link Alternatif, Hubungi CS. Bisa langsung diedit.</div>
                      </div>
                    </label>
                    <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      !brandForm.use_template
                        ? "border-vlc-500 bg-vlc-900/30"
                        : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
                    }`}>
                      <input type="radio" name="template_mode" checked={brandForm.use_template === false}
                        onChange={() => setBrandForm(f => ({ ...f, use_template: false }))}
                        className="mt-0.5 accent-vlc-500" />
                      <div>
                        <div className="text-sm font-semibold text-white">🗒️ Mulai dari Nol</div>
                        <div className="text-xs text-slate-400 mt-0.5">Chatbot kosong — tambahkan node sendiri sesuai kebutuhan brand.</div>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowBrandForm(false)} className="btn-secondary flex-1">Batal</button>
                  <button onClick={handleCreateBrand} disabled={brandSaving} className="btn-primary flex-1">
                    {brandSaving ? "Membuat..." : "✓ Buat Brand"}
                  </button>
                </div>
                {/* Embed code preview */}
                {brandForm.code && (
                  <div className="bg-slate-900 rounded-xl p-4 border border-slate-700 mt-2">
                    <p className="text-xs text-slate-400 mb-2 flex items-center gap-1">
                      <Key className="w-3 h-3" /> Preview embed code untuk website brand ini:
                    </p>
                    <pre className="text-xs text-emerald-400 font-mono overflow-x-auto whitespace-pre-wrap">{`<script>
  window.VLiveChat = {
    workspace: '${brandForm.code || "kode-brand-anda"}',
    apiBase: 'http://ALAMAT_SERVER:3001',
  };
</script>
<script src="http://ALAMAT_SERVER:3001/widget/widget.js" async></script>`}</pre>
                  </div>
                )}
              </div>
            )}

            {/* ── CREATE AGENT FORM ──────────────────────────────── */}
            {showAgentForm && (
              <div className="card p-6 border border-blue-700/40 bg-blue-950/10 space-y-4 animate-bounce-in">
                <h2 className="font-bold text-white flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-blue-400" /> Buat Agent untuk Brand
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Pilih Brand / Workspace *</label>
                    <select className="input" value={agentForm.workspace_id}
                      onChange={e => setAgentForm(f => ({ ...f, workspace_id: e.target.value }))}>
                      <option value="">— Pilih Brand —</option>
                      {workspaces.map(ws => (
                        <option key={ws.id} value={ws.id}>
                          {ws.brand_name || ws.name} ({ws.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Nama Lengkap *</label>
                    <input className="input" value={agentForm.name} placeholder="Contoh: CS / Admin Brand"
                      onChange={e => setAgentForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Email *</label>
                    <input className="input" type="email" value={agentForm.email} placeholder="admin@perusahaan.com"
                      onChange={e => setAgentForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Password *</label>
                    <div className="relative">
                      <input className="input pr-10" type={showPw ? "text" : "password"} value={agentForm.password}
                        placeholder="Min. 8 karakter"
                        onChange={e => setAgentForm(f => ({ ...f, password: e.target.value }))} />
                      <button type="button" onClick={() => setShowPw(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Role</label>
                    <select className="input" value={agentForm.role}
                      onChange={e => setAgentForm(f => ({ ...f, role: e.target.value }))}>
                      <option value="admin">Admin</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="agent">Agent</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Nama Tampil (opsional)</label>
                    <input className="input" value={agentForm.display_name} placeholder="sama dengan nama lengkap"
                      onChange={e => setAgentForm(f => ({ ...f, display_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Jabatan (opsional)</label>
                    <input className="input" value={agentForm.title} placeholder="Contoh: Admin, Head CS, Supervisor"
                      onChange={e => setAgentForm(f => ({ ...f, title: e.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase mb-2 block">Hak Akses Menu</label>
                    <div className="grid grid-cols-3 gap-2 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                      {PERM_OPTIONS.map(p => (
                        <label key={p.id} className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer p-1 rounded hover:bg-slate-800">
                          <input type="checkbox"
                            checked={agentForm.permissions.includes(p.id)}
                            onChange={e => {
                              const cur = agentForm.permissions;
                              setAgentForm(f => ({
                                ...f,
                                permissions: e.target.checked ? [...new Set([...cur, p.id])] : cur.filter(x => x !== p.id)
                              }));
                            }}
                            className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-vlc-500 focus:ring-vlc-500"
                          />
                          {p.label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowAgentForm(false)} className="btn-secondary flex-1">Batal</button>
                  <button onClick={handleCreateAgent} disabled={agentSaving} className="btn-primary flex-1">
                    {agentSaving ? "Membuat..." : "✓ Buat Agent"}
                  </button>
                </div>
              </div>
            )}

            {/* ── WORKSPACE LIST ─────────────────────────────────── */}
            <div className="card overflow-hidden">
              <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                <span className="font-bold text-white text-sm flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-purple-400" />
                  Semua Brand ({workspaces.length})
                </span>
              </div>
              <div className="divide-y divide-slate-800">
                {workspaces.map(ws => (
                  <div key={ws.id}>
                    {/* Workspace Row */}
                    <div className="p-4 hover:bg-slate-800/30 transition-colors">
                      <div className="flex items-center gap-4">
                        {/* Color dot */}
                        <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-bold text-lg shadow-md"
                          style={{ background: ws.brand_color || "#1e3a5f" }}>
                          {(ws.brand_name || ws.name || "B").charAt(0).toUpperCase()}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white">{ws.brand_name || ws.name}</span>
                            <span className="font-mono text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">{ws.code}</span>
                            {ws.is_active
                              ? <span className="badge-green text-[10px]">Aktif</span>
                              : <span className="badge-red text-[10px]">Nonaktif</span>}
                          </div>
                          <div className="flex gap-4 text-xs text-slate-400 mt-1 flex-wrap">
                            <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {ws.agent_count || 0} agent</span>
                            <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {ws.total_conversations || 0} chat</span>
                            <span className="flex items-center gap-1"><Activity className="w-3 h-3 text-emerald-400" /> {ws.active_conversations || 0} aktif</span>
                            {ws.owner_email && <span className="text-slate-500">{ws.owner_email}</span>}
                          </div>
                          {/* Embed code snippet */}
                          <div className="mt-1.5">
                            <code className="text-[10px] text-vlc-400 bg-slate-900/80 px-2 py-0.5 rounded font-mono">
                              workspace: '{ws.code}'
                            </code>
                          </div>
                        </div>
                        {/* Actions */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button onClick={() => openEditWs(ws)}
                            className="btn-ghost text-xs flex items-center gap-1">
                            <Edit3 className="w-3 h-3" /> Edit
                          </button>
                          <button onClick={() => { setDeleteWs(ws); setForceDelete(false); }}
                            className="btn-ghost text-xs flex items-center gap-1 text-red-400 hover:text-red-300 hover:bg-red-500/10">
                            <Trash2 className="w-3 h-3" /> Hapus
                          </button>
                          <button onClick={() => toggleExpand(ws.id)}
                            className="btn-ghost text-xs flex items-center gap-1">
                            {expandedWs === ws.id
                              ? <><ChevronUp className="w-3 h-3" /> Tutup</>
                              : <><ChevronDown className="w-3 h-3" /> Agents</>}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Agents List */}
                    {expandedWs === ws.id && (
                      <div className="bg-slate-900/50 px-4 pb-4 pt-2 border-t border-slate-800/50">
                        {wsAgentsLoading[ws.id] ? (
                          <div className="text-slate-500 text-xs py-2 flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-slate-600 border-t-vlc-500 rounded-full animate-spin"></div>
                            Memuat agents...
                          </div>
                        ) : wsAgents[ws.id]?.length === 0 ? (
                          <p className="text-slate-500 text-xs py-2">Belum ada agent di brand ini.</p>
                        ) : (
                          <div className="space-y-1 mt-1">
                            {wsAgents[ws.id]?.map(ag => (
                              <div key={ag.id} className="flex items-center gap-3 text-xs py-1.5 px-2 rounded-lg hover:bg-slate-800/60">
                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-[11px] flex-shrink-0"
                                  style={{ background: ag.avatar_bg || "#4F46E5" }}>
                                  {(ag.display_name || ag.name || "A").charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="text-white font-medium">{ag.display_name || ag.name}</span>
                                  <span className="text-slate-500 ml-1.5">{ag.email}</span>
                                </div>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                  ag.role === "admin" ? "bg-yellow-900/40 text-yellow-400" :
                                  ag.role === "supervisor" ? "bg-blue-900/40 text-blue-400" :
                                  "bg-slate-800 text-slate-400"
                                }`}>{ag.role}</span>
                                {ag.is_online
                                  ? <span className="text-emerald-400 text-[10px] flex items-center gap-1">● Online</span>
                                  : <span className="text-slate-500 text-[10px] flex items-center gap-1">● Offline</span>}
                                {!ag.is_active && <span className="text-red-400 text-[10px]">Nonaktif</span>}
                                <button onClick={() => { setResetPwAgent(ag); setNewAgentPw(""); }}
                                  title="Ganti Password Agent"
                                  className="btn-ghost text-[10px] px-2 py-0.5 text-purple-400 hover:text-purple-300 flex items-center gap-1">
                                  <Key className="w-3 h-3" /> Password
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <button
                          onClick={() => {
                            setAgentForm(f => ({ ...f, workspace_id: ws.id }));
                            setShowAgentForm(true);
                            setShowBrandForm(false);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="mt-2 text-xs text-vlc-400 hover:text-vlc-300 flex items-center gap-1 transition-colors">
                          <Plus className="w-3 h-3" /> Tambah agent ke brand ini
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── DELETE BRAND CONFIRMATION MODAL ───────────────────────── */}
        {deleteWs && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
            onClick={e => e.target === e.currentTarget && setDeleteWs(null)}>
            <div className="card p-6 w-full max-w-md animate-bounce-in">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h2 className="font-bold text-white">Hapus Brand Permanen</h2>
                  <p className="text-xs text-slate-400">Tindakan ini tidak dapat dibatalkan</p>
                </div>
              </div>

              <div className="bg-red-900/20 border border-red-700/40 rounded-xl p-4 mb-5 space-y-1.5">
                <div className="text-sm font-bold text-white">{deleteWs.brand_name || deleteWs.name}</div>
                <div className="text-xs text-slate-400 font-mono">code: {deleteWs.code}</div>
                <div className="text-xs text-red-300 mt-2">
                  ⚠️ Semua data akan dihapus permanen: agent, conversation, pesan, canned response, dan konfigurasi brand ini.
                </div>
              </div>

              {forceDelete && (
                <div className="bg-orange-900/20 border border-orange-500/40 rounded-xl p-3 mb-4 text-xs text-orange-300">
                  <strong>Ada percakapan aktif!</strong> Centang di bawah untuk paksa hapus semua data termasuk percakapan yang sedang berjalan.
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input type="checkbox" checked={forceDelete} onChange={() => {}} className="accent-red-500" readOnly />
                    <span>Ya, saya mengerti dan ingin force delete</span>
                  </label>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => { setDeleteWs(null); setForceDelete(false); }} className="btn-secondary flex-1">
                  Batal
                </button>
                <button onClick={handleDeleteBrand} disabled={deleteLoading}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors flex items-center justify-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  {deleteLoading ? "Menghapus..." : forceDelete ? "Force Hapus Permanen" : "Ya, Hapus Permanen"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── EDIT WORKSPACE MODAL ──────────────────────────────── */}
        {editWs && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
            onClick={e => e.target === e.currentTarget && setEditWs(null)}>
            <div className="card p-6 w-full max-w-lg animate-bounce-in max-h-[90vh] overflow-y-auto">
              <h2 className="font-bold text-white text-lg mb-5 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-vlc-400" />
                Edit Brand: {editWs.brand_name || editWs.name}
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Nama Workspace</label>
                  <input className="input" value={editWsForm.name}
                    onChange={e => setEditWsForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Code Unik (embed widget)</label>
                  <input className="input font-mono" value={editWsForm.code}
                    onChange={e => setEditWsForm(f => ({ ...f, code: e.target.value.toLowerCase().replace(/\s+/g, "_") }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Nama Brand (tampil di widget)</label>
                  <input className="input" value={editWsForm.brand_name}
                    onChange={e => setEditWsForm(f => ({ ...f, brand_name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Warna Brand</label>
                  <div className="flex gap-2">
                    <input type="color" value={editWsForm.brand_color}
                      onChange={e => setEditWsForm(f => ({ ...f, brand_color: e.target.value }))}
                      className="w-12 h-10 rounded-lg border border-slate-600 cursor-pointer bg-transparent" />
                    <input className="input flex-1 font-mono" value={editWsForm.brand_color}
                      onChange={e => setEditWsForm(f => ({ ...f, brand_color: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Judul Sambutan</label>
                  <input className="input" value={editWsForm.welcome_title}
                    onChange={e => setEditWsForm(f => ({ ...f, welcome_title: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Subtitle</label>
                  <input className="input" value={editWsForm.welcome_subtitle}
                    onChange={e => setEditWsForm(f => ({ ...f, welcome_subtitle: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Email Owner</label>
                  <input className="input" type="email" value={editWsForm.owner_email}
                    onChange={e => setEditWsForm(f => ({ ...f, owner_email: e.target.value }))} />
                </div>
                <div className="flex items-center gap-3 py-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase">Status Aktif</label>
                  <button onClick={() => setEditWsForm(f => ({ ...f, is_active: !f.is_active }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editWsForm.is_active ? "bg-emerald-600" : "bg-slate-700"}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editWsForm.is_active ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                  <span className={`text-xs font-semibold ${editWsForm.is_active ? "text-emerald-400" : "text-slate-400"}`}>
                    {editWsForm.is_active ? "Aktif" : "Nonaktif"}
                  </span>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setEditWs(null)} className="btn-secondary flex-1">Batal</button>
                <button onClick={handleEditWs} disabled={editWsSaving} className="btn-primary flex-1">
                  {editWsSaving ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── CLEAR DATABASE ───────────────────────────────────── */}
        {activeTab === "clear" && (
          <div className="space-y-4">
            <div className="card p-6 border border-red-900/40 bg-red-950/10">
              <div className="flex items-center gap-2 mb-4">
                <Trash2 className="w-5 h-5 text-red-400" />
                <div>
                  <h2 className="font-bold text-red-400">Hapus Data Chat (Clear Database)</h2>
                  <p className="text-xs text-slate-400">Operasi ini tidak bisa dibatalkan. Gunakan dengan sangat hati-hati.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Workspace (opsional)</label>
                  <select className="input" value={clearForm.workspace_id}
                    onChange={e => setClearForm(f => ({ ...f, workspace_id: e.target.value }))}>
                    <option value="">Semua Workspace</option>
                    {workspaces.map(ws => <option key={ws.id} value={ws.id}>{ws.brand_name || ws.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Status</label>
                  <select className="input" value={clearForm.status}
                    onChange={e => setClearForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="">Semua Status</option>
                    <option value="resolved">Resolved</option>
                    <option value="missed">Missed</option>
                    <option value="open">Open</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Dari Tanggal</label>
                  <input type="date" className="input" value={clearForm.date_from}
                    onChange={e => setClearForm(f => ({ ...f, date_from: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Sampai Tanggal</label>
                  <input type="date" className="input" value={clearForm.date_to}
                    onChange={e => setClearForm(f => ({ ...f, date_to: e.target.value }))} />
                </div>
              </div>

              <button onClick={previewClear} disabled={previewing} className="btn-secondary w-full mb-3 flex items-center justify-center gap-2">
                <Eye className="w-4 h-4" />
                {previewing ? "Menghitung..." : "Preview Sebelum Hapus"}
              </button>

              {preview && (
                <div className="bg-slate-800 rounded-xl p-4 mb-4 border border-slate-700">
                  <h3 className="font-bold text-white text-sm mb-3">Preview Hasil</h3>
                  {preview.preview?.length === 0 ? (
                    <p className="text-slate-400 text-sm">Tidak ada data yang cocok.</p>
                  ) : (
                    <div className="space-y-2">
                      {preview.preview?.map((p, i) => (
                        <div key={i} className="flex justify-between text-sm border-b border-slate-700 pb-2 last:border-0">
                          <span className="text-slate-300">{p.workspace_name || "Semua workspace"}</span>
                          <div className="text-right">
                            <span className="text-red-400 font-bold">{p.conversation_count} chat</span>
                            <span className="text-slate-400 ml-2 text-xs">({p.message_count} pesan)</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {preview.preview?.length > 0 && (
                    <button onClick={executeClear} disabled={clearing} className="btn-danger w-full mt-3">
                      {clearing ? "Menghapus..." : `Hapus Sekarang (${preview.preview?.reduce((a,b) => a + parseInt(b.conversation_count||0), 0)} data)`}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── AUDIT LOG ─────────────────────────────────────────── */}
        {activeTab === "audit" && (
          <div className="card overflow-hidden">
            {/* Header & Filters */}
            <div className="p-4 border-b border-slate-700/80 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/40">
              <div className="font-bold text-white text-sm flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-purple-400" />
                Audit Log Activity ({auditMeta.total})
              </div>

              {/* Filters & Limit */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {/* Brand Filter */}
                <select
                  value={auditWsFilter}
                  onChange={e => { setAuditWsFilter(e.target.value); }}
                  className="input py-1 px-2.5 text-xs border-slate-700 bg-slate-950/80 text-white rounded-lg focus:border-purple-500"
                >
                  <option value="">Semua Brand</option>
                  {workspaces.map(w => (
                    <option key={w.id} value={w.id}>{w.brand_name || w.name}</option>
                  ))}
                </select>

                {/* Action Filter */}
                <select
                  value={auditActionFilter}
                  onChange={e => { setAuditActionFilter(e.target.value); }}
                  className="input py-1 px-2.5 text-xs border-slate-700 bg-slate-950/80 text-white rounded-lg focus:border-purple-500"
                >
                  <option value="">Semua Aksi</option>
                  <optgroup label="── Brand ──">
                    <option value="create_workspace">Buat Brand</option>
                    <option value="update_workspace">Edit Brand</option>
                    <option value="deactivate_workspace">Nonaktifkan Brand</option>
                    <option value="delete_workspace">Hapus Brand</option>
                  </optgroup>
                  <optgroup label="── Agent ──">
                    <option value="create_agent">Tambah Agent</option>
                    <option value="update_agent">Edit Agent</option>
                    <option value="deactivate_agent">Nonaktifkan Agent</option>
                    <option value="delete_agent">Hapus Agent</option>
                    <option value="reset_agent_password">Reset Password</option>
                  </optgroup>
                  <optgroup label="── Data ──">
                    <option value="clear_conversations">Clear Chat</option>
                  </optgroup>
                </select>

                {/* Items Per Page */}
                <select
                  value={auditMeta.limit}
                  onChange={e => {
                    const l = parseInt(e.target.value, 10);
                    fetchAuditLogs(1, l, auditWsFilter, auditActionFilter);
                  }}
                  className="input py-1 px-2 text-xs border-slate-700 bg-slate-950/80 text-white rounded-lg"
                >
                  <option value={15}>15 / hal</option>
                  <option value={30}>30 / hal</option>
                  <option value={50}>50 / hal</option>
                </select>

                <button
                  onClick={() => fetchAuditLogs(auditMeta.page, auditMeta.limit, auditWsFilter, auditActionFilter)}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                  title="Refresh Audit Log"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${auditLoading ? "animate-spin text-purple-400" : ""}`} />
                </button>
              </div>
            </div>

            {/* Log List */}
            <div className="divide-y divide-slate-800/80 min-h-[220px]">
              {auditLoading ? (
                <div className="p-12 text-center text-slate-500 text-sm flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-purple-500/30 border-t-purple-400 rounded-full animate-spin"></span>
                  Memuat log audit...
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-sm">Tidak ada aktivitas audit ditemukan</div>
              ) : (
                auditLogs.map(log => (
                  <div key={log.id} className="p-4 flex items-start gap-3 hover:bg-slate-800/30 transition-colors">
                    <span className="flex-shrink-0 mt-0.5 p-2 bg-slate-800/80 border border-slate-700/60 rounded-xl">
                      {(log.action === "clear_conversations" || log.action === "delete_workspace" || log.action === "delete_agent")
                        ? <Trash2 className="w-4 h-4 text-red-400" />
                        : (log.action === "create_agent" || log.action === "create_workspace")
                          ? <UserPlus className="w-4 h-4 text-emerald-400" />
                          : (log.action === "deactivate_agent" || log.action === "deactivate_workspace")
                            ? <ShieldOff className="w-4 h-4 text-amber-400" />
                            : (log.action === "reset_agent_password")
                              ? <Key className="w-4 h-4 text-sky-400" />
                              : (log.action === "update_agent" || log.action === "update_workspace")
                                ? <Edit3 className="w-4 h-4 text-blue-400" />
                                : <ClipboardList className="w-4 h-4 text-purple-400" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`font-semibold text-sm ${
                          (log.action?.startsWith("delete_") || log.action === "clear_conversations") ? "text-red-400" :
                          (log.action?.startsWith("create_")) ? "text-emerald-400" :
                          (log.action?.startsWith("deactivate_")) ? "text-amber-400" :
                          log.action === "reset_agent_password" ? "text-sky-300" :
                          "text-blue-300"
                        }`}>{ {
                          clear_conversations: "Clear Chat / Percakapan",
                          create_workspace:    "Buat Brand Baru",
                          update_workspace:    "Edit Brand",
                          deactivate_workspace:"Nonaktifkan Brand",
                          delete_workspace:    "Hapus Brand (Permanen)",
                          create_agent:        "Tambah Agent",
                          update_agent:        "Edit Data Agent",
                          deactivate_agent:    "Nonaktifkan Agent",
                          delete_agent:        "Hapus Agent (Permanen)",
                          reset_agent_password:"Reset Password Agent",
                        }[log.action] || log.action}</span>
                        {(log.brand_name || log.workspace_name) && (
                          <span className="badge-blue text-[11px] px-2 py-0.5">{log.brand_name || log.workspace_name}</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">{log.actor_email}</div>
                      {log.note && <div className="text-xs text-slate-400 mt-1 bg-slate-900/60 p-2 rounded-lg border border-slate-800/60 break-all">{log.note}</div>}
                    </div>
                    <div className="text-xs text-slate-500 flex-shrink-0 font-medium">
                      {log.created_at ? format(new Date(log.created_at), "dd MMM yyyy · HH:mm") : ""}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Pagination Controls Footer */}
            {auditMeta.totalPages > 1 && (
              <div className="p-3 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between gap-2 flex-wrap text-xs text-slate-400">
                <div>
                  Menampilkan Halaman <strong className="text-white">{auditMeta.page}</strong> dari <strong className="text-white">{auditMeta.totalPages}</strong> ({auditMeta.total} total)
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={auditMeta.page <= 1 || auditLoading}
                    onClick={() => fetchAuditLogs(auditMeta.page - 1, auditMeta.limit, auditWsFilter, auditActionFilter)}
                    className="btn-ghost py-1 px-3 text-xs disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700/80 rounded-lg hover:bg-slate-800"
                  >
                    ◄ Sebelumnya
                  </button>
                  <button
                    disabled={auditMeta.page >= auditMeta.totalPages || auditLoading}
                    onClick={() => fetchAuditLogs(auditMeta.page + 1, auditMeta.limit, auditWsFilter, auditActionFilter)}
                    className="btn-ghost py-1 px-3 text-xs disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700/80 rounded-lg hover:bg-slate-800"
                  >
                    Selanjutnya ►
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── RESET AGENT PASSWORD MODAL (SUPERADMIN) ─────────────── */}
        {resetPwAgent && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
            onClick={e => e.target === e.currentTarget && setResetPwAgent(null)}>
            <div className="card p-6 w-full max-w-md animate-bounce-in">
              <h2 className="font-bold text-white text-lg mb-2 flex items-center gap-2">
                <Key className="w-5 h-5 text-purple-400" />
                Ganti Password Agent
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                Mengubah password untuk <strong className="text-white">{resetPwAgent.display_name || resetPwAgent.name}</strong> ({resetPwAgent.email}).
              </p>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Password Baru *</label>
                  <input className="input" type="password" value={newAgentPw}
                    placeholder="Min. 8 karakter"
                    onChange={e => setNewAgentPw(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setResetPwAgent(null)} className="btn-secondary flex-1">Batal</button>
                <button onClick={handleResetAgentPassword} disabled={resetPwSaving} className="btn-primary flex-1">
                  {resetPwSaving ? "Menyimpan..." : "Simpan Password Baru"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SuperStat({ icon, label, value, color = "default" }) {
  const colorMap = {
    default: "from-slate-800 to-slate-800/50 border-slate-700",
    green:   "from-emerald-900/30 to-emerald-900/10 border-emerald-700/30",
    blue:    "from-blue-900/30 to-blue-900/10 border-blue-700/30",
    purple:  "from-purple-900/30 to-purple-900/10 border-purple-700/30",
  };
  const textMap = {
    default: "text-white",
    green:   "text-emerald-400",
    blue:    "text-blue-400",
    purple:  "text-purple-400",
  };
  const iconMap = {
    default: "text-slate-400",
    green:   "text-emerald-400",
    blue:    "text-blue-400",
    purple:  "text-purple-400",
  };
  return (
    <div className={`bg-gradient-to-br ${colorMap[color]} border rounded-xl p-5`}>
      <div className={`mb-2 ${iconMap[color]}`}>{icon}</div>
      <div className={`text-3xl font-black mb-1 ${textMap[color]}`}>{value?.toLocaleString()}</div>
      <div className="text-xs text-slate-400 font-medium">{label}</div>
    </div>
  );
}

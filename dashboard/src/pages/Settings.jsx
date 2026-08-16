import { useEffect, useState } from "react";
import {
  Palette,
  Bot,
  Zap,
  UserX,
  Link2,
  User,
  Code2,
  Megaphone,
  Sparkles,
  Moon,
  RefreshCw,
  Edit3,
  Trash2,
  LockOpen,
  Copy,
  Shield,
  Key,
  Clock,
  Camera,
  ExternalLink,
} from "lucide-react";
import api, { getFileUrl } from "../api";
import useChatStore from "../store/chatStore";
import toast from "react-hot-toast";
import Avatar from "../components/Avatar";

const API_BASE = import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";

export default function Settings() {
  const agent = useChatStore(s => s.agent);
  const updateAgentProfile = useChatStore(s => s.updateAgentProfile);
  const [ws, setWs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("branding");
  const [cannedList, setCannedList] = useState([]);
  const [cannedForm, setCannedForm] = useState({ shortcut:"", title:"", content:"", category:"" });
  const [editCanned, setEditCanned] = useState(null);
  const [flowJson, setFlowJson] = useState("");
  const [flowError, setFlowError] = useState("");
  const [blockedList, setBlockedList] = useState([]);
  const [blockedLoading, setBlockedLoading] = useState(false);

  // Facebook integration state
  const [fbIntegration, setFbIntegration] = useState(null);
  const [fbForm, setFbForm] = useState({ page_id:"", verify_token:"", app_secret:"", page_access_token:"", is_active:false });
  const [fbSaving, setFbSaving] = useState(false);
  const [fbLoading, setFbLoading] = useState(false);

  // Profile state
  const [profile, setProfile] = useState({ name:"", display_name:"", title:"" });
  const [pwForm, setPwForm] = useState({ currentPassword:"", newPassword:"", confirmPassword:"" });

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/workspaces/mine");
        setWs(data);
        setFlowJson(JSON.stringify(data.flow_config || {}, null, 2));
      } catch {}
      setProfile({ name: agent?.name||"", display_name: agent?.display_name||"", title: agent?.title||"" });
      loadCanned();
      setLoading(false);
    })();
  }, [agent]);

  useEffect(() => {
    if (activeTab === "canned") loadCanned();
    if (activeTab === "blocked") loadBlocked();
    if (activeTab === "integrations") loadFbIntegration();
  }, [activeTab]);

  async function loadBlocked() {
    setBlockedLoading(true);
    try {
      const { data } = await api.get("/conversations/blocked");
      setBlockedList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load blocked visitors:", err);
    }
    setBlockedLoading(false);
  }

  async function handleUnblock(convId, visitorName) {
    try {
      await api.patch(`/conversations/${convId}/block`, { isBlocked: false });
      toast.success(`Akses visitor (${visitorName || "Visitor"}) telah dibuka kembali!`);
      loadBlocked();
    } catch {
      toast.error("Gagal membuka blokir visitor");
    }
  }

  async function loadCanned() {
    try {
      const { data } = await api.get("/canned");
      setCannedList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load canned responses:", err);
    }
  }

  async function loadFbIntegration() {
    setFbLoading(true);
    try {
      const { data } = await api.get("/integrations/facebook");
      if (data.integration) {
        setFbIntegration(data.integration);
        setFbForm(prev => ({ ...prev, ...data.integration.config, is_active: data.integration.is_active }));
      }
    } catch {}
    setFbLoading(false);
  }

  async function saveFbIntegration() {
    setFbSaving(true);
    try {
      const { data } = await api.put("/integrations/facebook", fbForm);
      toast.success("Konfigurasi Facebook berhasil disimpan!");
      setFbIntegration(data.integration);
    } catch (err) {
      toast.error(err.response?.data?.error || "Gagal menyimpan konfigurasi Facebook");
    }
    setFbSaving(false);
  }

  async function saveBranding() {
    if (!ws || !ws.id) return;
    setSaving(true);
    try {
      const payload = { ...ws };
      if (!payload.vps_expires_at) payload.vps_expires_at = null;
      if (!payload.domain_expires_at) payload.domain_expires_at = null;
      const { data } = await api.patch(`/workspaces/${ws.id}`, payload);
      setWs(data);
      toast.success("Pengaturan Branding & Widget berhasil disimpan!");
    } catch (err) {
      console.error("saveBranding error:", err);
      toast.error(err.response?.data?.error || "Gagal menyimpan pengaturan branding");
    }
    setSaving(false);
  }

  async function saveProfile() {
    try {
      const { data } = await api.patch(`/agents/${agent.id}`, profile);
      updateAgentProfile(data);
      toast.success("Profil diperbarui");
    } catch { toast.error("Gagal memperbarui profil"); }
  }

  async function handleAvatarUpload(file) {
    if (!file || !agent?.id) return;
    const fd = new FormData();
    fd.append("avatar", file);
    try {
      const { data } = await api.post(`/agents/${agent.id}/avatar`, fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      updateAgentProfile({ avatar_url: data.avatar_url });
      toast.success("Foto profil diperbarui!");
    } catch (err) {
      toast.error(err.response?.data?.error || "Gagal mengunggah foto profil");
    }
  }

  async function changePassword() {
    if (pwForm.newPassword !== pwForm.confirmPassword) { toast.error("Password baru tidak cocok"); return; }
    try {
      await api.post("/auth/change-password", pwForm);
      toast.success("Password berhasil diubah");
      setPwForm({ currentPassword:"", newPassword:"", confirmPassword:"" });
    } catch (err) { toast.error(err.response?.data?.error || "Gagal mengubah password"); }
  }

  async function saveCanned() {
    try {
      if (editCanned) {
        await api.patch(`/canned/${editCanned.id}`, cannedForm);
        toast.success("Canned response diperbarui");
      } else {
        await api.post("/canned", cannedForm);
        toast.success("Canned response ditambahkan");
      }
      setCannedForm({ shortcut:"", title:"", content:"", category:"" });
      setEditCanned(null);
      loadCanned();
    } catch (err) { toast.error(err.response?.data?.error || "Gagal menyimpan"); }
  }

  async function deleteCanned(id) {
    if (!confirm("Hapus canned response ini?")) return;
    await api.delete(`/canned/${id}`);
    toast.success("Dihapus");
    loadCanned();
  }

  const apiBaseUrl = import.meta.env.VITE_SOCKET_URL || (typeof window !== "undefined" ? `${window.location.protocol}//${window.location.hostname}:3001` : "http://localhost:3001");

  const widgetEmbedCode = ws ? `<script>
  window.VLiveChat = {
    workspace: '${ws.code}',
    apiBase: '${apiBaseUrl}',
  };
</script>
<script src="${apiBaseUrl}/widget/widget.js" async></script>` : "";

  const directWidgetUrl = ws ? `${apiBaseUrl}/widget/livechat-widget.html?w=${ws.code}&apiBase=${apiBaseUrl}` : "";

  const isSuperAdmin = agent?.role === "superadmin";

  const allTabs = [
    { key: "branding",     label: "Branding & Widget",  icon: Palette },
    { key: "chatbot",      label: "Chatbot & Template", icon: Bot },
    { key: "canned",       label: "Canned Responses",   icon: Zap },
    { key: "blocked",      label: "Visitor Diblokir",   icon: UserX },
    { key: "integrations", label: "Integrasi",          icon: Link2 },
    { key: "profile",      label: "Profil Saya",        icon: User },
    { key: "embed",        label: "Kode Embed",         icon: Code2 },
  ];

  const tabs = isSuperAdmin ? allTabs.filter(t => t.key === "profile") : allTabs;

  useEffect(() => {
    if (isSuperAdmin && activeTab !== "profile") {
      setActiveTab("profile");
    }
  }, [isSuperAdmin]);

  async function saveFlowConfig() {
    setFlowError("");
    let parsed;
    try {
      parsed = JSON.parse(flowJson);
    } catch (e) {
      setFlowError("JSON tidak valid: " + e.message);
      return;
    }
    try {
      await api.patch(`/workspaces/${ws.id}`, { flow_config: parsed });
      toast.success("Flow config disimpan!");
    } catch (err) {
      toast.error(err.response?.data?.error || "Gagal menyimpan flow config");
    }
  }

  if (loading) return <div className="flex-1 flex items-center justify-center text-slate-500">Memuat...</div>;

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-950">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Pengaturan</h1>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl mb-6 flex-wrap">
          {tabs.map(t => {
            const IconComponent = t.icon;
            return (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`flex-1 min-w-[120px] py-2.5 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                  activeTab === t.key ? "bg-vlc-600 text-white shadow-md" : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                }`}>
                <IconComponent className="w-4 h-4 flex-shrink-0" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── BRANDING ─────────────────────────────────────────── */}
        {activeTab === "branding" && ws && (
          <div className="card p-6 space-y-6">
            <h2 className="font-bold text-white text-lg border-b border-slate-800 pb-3 flex items-center gap-2">
              <Palette className="w-5 h-5 text-vlc-400" />
              <span>Branding & Tampilan Widget</span>
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Nama Brand">
                <input className="input" value={ws.brand_name||""} onChange={e => setWs({...ws,brand_name:e.target.value})} />
              </Field>
              <Field label="Warna Utama (HEX)">
                <div className="flex gap-2">
                  <input type="color" value={ws.brand_color||"#1e3a5f"} onChange={e => setWs({...ws,brand_color:e.target.value})}
                    className="w-12 h-10 rounded-lg border border-slate-600 cursor-pointer bg-transparent" />
                  <input className="input flex-1" value={ws.brand_color||""} onChange={e => setWs({...ws,brand_color:e.target.value})} />
                </div>
              </Field>
            </div>

            <Field label="Logo URL">
              <input className="input" value={ws.brand_logo_url||""} onChange={e => setWs({...ws,brand_logo_url:e.target.value})} placeholder="https://..." />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Judul Sambutan">
                <input className="input" value={ws.welcome_title||""} onChange={e => setWs({...ws,welcome_title:e.target.value})} />
              </Field>
              <Field label="Subtitle">
                <input className="input" value={ws.welcome_subtitle||""} onChange={e => setWs({...ws,welcome_subtitle:e.target.value})} />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Nama CS (tampil di widget)">
                <input className="input" value={ws.agent_display_name||""} onChange={e => setWs({...ws,agent_display_name:e.target.value})} />
              </Field>
              <Field label="Posisi Widget">
                <select className="input" value={ws.widget_position||"right"} onChange={e => setWs({...ws,widget_position:e.target.value})}>
                  <option value="right">Kanan</option>
                  <option value="left">Kiri</option>
                </select>
              </Field>
            </div>

            {/* Announcement Card Section */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-vlc-400" />
                    <span>Kartu Pengumuman (Widget Announcement)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">Tampilkan kartu pengumuman atau link penting khusus untuk visitor di bagian atas widget.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const ann = ws.announcement_config || {};
                    setWs({ ...ws, announcement_config: { ...ann, enabled: !ann.enabled } });
                  }}
                  className={`w-12 h-6 rounded-full transition-colors relative ${ws.announcement_config?.enabled ? 'bg-vlc-600' : 'bg-slate-700'}`}
                >
                  <span className={`w-5 h-5 bg-white rounded-full absolute top-0.5 left-0.5 transition-transform ${ws.announcement_config?.enabled ? 'translate-x-6' : ''}`} />
                </button>
              </div>

              {ws.announcement_config?.enabled && (
                <div className="space-y-3 pt-2">
                  <Field label="Judul Pengumuman">
                    <input className="input" value={ws.announcement_config?.title||""} onChange={e => setWs({
                      ...ws, announcement_config: { ...(ws.announcement_config||{}), title: e.target.value }
                    })} placeholder="contoh: Link Alternatif Resmi" />
                  </Field>
                  <Field label="Isi Pesan / Link URL">
                    <input className="input" value={ws.announcement_config?.text||""} onChange={e => setWs({
                      ...ws, announcement_config: { ...(ws.announcement_config||{}), text: e.target.value }
                    })} placeholder="contoh: https://domain-anda.com/link-resmi" />
                  </Field>
                  <Field label="Teks Tombol Aksi (Opsional)">
                    <input className="input" value={ws.announcement_config?.button_text||""} onChange={e => setWs({
                      ...ws, announcement_config: { ...(ws.announcement_config||{}), button_text: e.target.value }
                    })} placeholder="contoh: Buka Link Sekarang" />
                  </Field>
                </div>
              )}
            </div>

            {/* Auto-Greeting Section */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>Auto-Greeting (Pesan Menyapa Otomatis)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">Pesan otomatis dari brand yang dikirimkan 1x di awal saat visitor memulai percakapan baru.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setWs({ ...ws, auto_greeting_enabled: !ws.auto_greeting_enabled })}
                  className={`w-12 h-6 rounded-full transition-colors relative ${ws.auto_greeting_enabled ? 'bg-vlc-600' : 'bg-slate-700'}`}
                >
                  <span className={`w-5 h-5 bg-white rounded-full absolute top-0.5 left-0.5 transition-transform ${ws.auto_greeting_enabled ? 'translate-x-6' : ''}`} />
                </button>
              </div>

              {ws.auto_greeting_enabled && (
                <Field label="Teks Pesan Menyapa">
                  <textarea className="input h-20 resize-none" value={ws.auto_greeting_text||""} onChange={e => setWs({...ws, auto_greeting_text: e.target.value})} placeholder="Tuliskan ucapan salam otomatis untuk visitor baru..." />
                </Field>
              )}
            </div>

            {/* Offline CS Reply Section */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <Moon className="w-4 h-4 text-indigo-400" />
                    <span>Pesan Otomatis CS Offline</span>
                  </h3>
                  <p className="text-xs text-slate-400">Kirim balasan otomatis saat seluruh agen CS sedang offline/luar jam kerja (default: Nonaktif).</p>
                </div>
                <button
                  type="button"
                  onClick={() => setWs({ ...ws, offline_reply_enabled: !ws.offline_reply_enabled })}
                  className={`w-12 h-6 rounded-full transition-colors relative ${ws.offline_reply_enabled ? 'bg-vlc-600' : 'bg-slate-700'}`}
                >
                  <span className={`w-5 h-5 bg-white rounded-full absolute top-0.5 left-0.5 transition-transform ${ws.offline_reply_enabled ? 'translate-x-6' : ''}`} />
                </button>
              </div>

              {ws.offline_reply_enabled && (
                <Field label="Pesan Balasan CS Offline">
                  <textarea className="input h-20 resize-none" value={ws.offline_reply_text||""} onChange={e => setWs({...ws, offline_reply_text: e.target.value})} placeholder="Tulis pesan saat CS offline..." />
                </Field>
              )}
            </div>

            {/* Target SLA & Waktu Respon */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <Clock className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-bold text-white text-sm">Target SLA & Waktu Respon</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Tentukan batas standar waktu pelayanan CS untuk first response dan resolusi pesan.</p>
                </div>
              </div>

              {/* First Response SLA */}
              <Field label="⏱️ Target Respon Pertama (First Response SLA - Menit)">
                <input
                  type="number"
                  min="1"
                  max="120"
                  className="input"
                  value={ws.sla_first_response ?? 5}
                  onChange={e => setWs({ ...ws, sla_first_response: parseInt(e.target.value) || 5 })}
                  placeholder="5"
                />
                <p className="text-[11px] text-slate-500 mt-1">Batas waktu CS merespons pesan pertama visitor sebelum ditandai <em>Terlewat (Missed SLA)</em>.</p>
              </Field>

              {/* Resolution SLA Toggle */}
              <div className="border border-slate-700 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">⌛ Target Resolusi Chat (Resolution SLA)</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Jika diaktifkan, percakapan yang melebihi batas waktu akan ditandai sebagai <em>SLA Terlewati</em>.
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      const newVal = !(ws.sla_resolution_enabled ?? false);
                      setWs({ ...ws, sla_resolution_enabled: newVal });
                      try {
                        await api.patch(`/workspaces/${ws.id}`, { sla_resolution_enabled: newVal });
                        toast.success(newVal ? "Target Resolusi Chat diaktifkan" : "Target Resolusi Chat dinonaktifkan");
                      } catch { toast.error("Gagal mengubah pengaturan"); }
                    }}
                    className={`relative flex-shrink-0 w-14 h-7 rounded-full transition-all duration-200 focus:outline-none ${
                      (ws.sla_resolution_enabled ?? false) ? "bg-emerald-500" : "bg-slate-600"
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform duration-200 ${
                      (ws.sla_resolution_enabled ?? false) ? "translate-x-7" : "translate-x-0"
                    }`} />
                  </button>
                </div>

                {(ws.sla_resolution_enabled ?? false) ? (
                  <div>
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      className="input"
                      value={ws.sla_resolution ?? 60}
                      onChange={e => setWs({ ...ws, sla_resolution: parseInt(e.target.value) || 60 })}
                      placeholder="60"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">Target durasi total (menit) untuk menyelesaikan percakapan dari awal hingga selesai.</p>
                  </div>
                ) : (
                  <div className="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-400">
                    ⏸️ Nonaktif — durasi chat panjang <strong className="text-slate-300">tidak</strong> akan dihitung sebagai pelanggaran SLA. CS bebas melayani member selama dibutuhkan.
                  </div>
                )}
              </div>
            </div>

            {/* ⚠️ Server & Domain Expiration Settings (VPS & Domain Countdown Alerts) */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-4">
              <h3 className="font-bold text-white text-sm">⚠️ Tanggal Jatuh Tempo Server & Domain (Peringatan Expired)</h3>
              <p className="text-xs text-slate-400">Atur tanggal masa aktif VPS dan Domain. Jika sisa masa aktif <strong>&lt; 30 hari</strong>, notifikasi peringatan akan otomatis muncul di bagian atas dashboard.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="📅 Tanggal Expired VPS / Server">
                  <input type="date" className="input" value={ws.vps_expires_at ? ws.vps_expires_at.split('T')[0] : ""} onChange={e => setWs({...ws, vps_expires_at: e.target.value ? new Date(e.target.value).toISOString() : null})} />
                </Field>
                <Field label="📅 Tanggal Expired Domain">
                  <input type="date" className="input" value={ws.domain_expires_at ? ws.domain_expires_at.split('T')[0] : ""} onChange={e => setWs({...ws, domain_expires_at: e.target.value ? new Date(e.target.value).toISOString() : null})} />
                </Field>
              </div>
            </div>

            <button onClick={saveBranding} disabled={saving} className="btn-primary w-full py-3 font-bold text-sm">
              {saving ? "Menyimpan..." : "💾 Simpan Pengaturan"}
            </button>
          </div>
        )}

        {/* ── CHATBOT & FLOW TEMPLATE ─────────────────────────── */}
        {activeTab === "chatbot" && ws && (
          <div className="space-y-5">
            {/* Chatbot Toggle Card */}
            <div className="card p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h2 className="font-bold text-white text-lg">🤖 Chatbot</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Aktifkan atau nonaktifkan chatbot otomatis. Jika dinonaktifkan, semua percakapan langsung diteruskan ke Customer Service tanpa melewati bot.
                  </p>
                </div>
                <button
                  onClick={async () => {
                    const newVal = !ws.chatbot_enabled;
                    setWs({ ...ws, chatbot_enabled: newVal });
                    try {
                      await api.patch(`/workspaces/${ws.id}`, { chatbot_enabled: newVal });
                      toast.success(newVal ? "Chatbot diaktifkan!" : "Chatbot dinonaktifkan — mode CS penuh");
                    } catch { toast.error("Gagal mengubah status chatbot"); }
                  }}
                  className={`relative flex-shrink-0 w-14 h-7 rounded-full transition-all duration-200 focus:outline-none ${
                    ws.chatbot_enabled !== false ? "bg-emerald-500" : "bg-slate-600"
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform duration-200 ${
                    ws.chatbot_enabled !== false ? "translate-x-7" : "translate-x-0"
                  }`} />
                </button>
              </div>
              <div className={`mt-4 p-3 rounded-lg text-xs font-medium ${
                ws.chatbot_enabled !== false
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-slate-800 text-slate-400 border border-slate-700"
              }`}>
                {ws.chatbot_enabled !== false
                  ? "✅ Chatbot AKTIF — Visitor akan melewati flow bot sebelum terhubung ke CS"
                  : "⏸️ Chatbot NONAKTIF — Semua chat langsung masuk ke CS (Full Manual Mode)"}
              </div>
            </div>

            {/* Flow Template Visual Editor — ALWAYS VISIBLE regardless of chatbot ON/OFF */}
            <div className="card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-white">🌳 Template & Tombol Chatbot</h2>
                  <p className="text-xs text-slate-400 mt-1">Edit pesan dan tombol decision tree chatbot Anda.</p>
                </div>
              </div>

              {/* Info banner when chatbot is disabled */}
              {ws.chatbot_enabled === false && (
                <div className="flex items-start gap-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-3">
                  <span className="text-blue-400 text-lg flex-shrink-0 mt-0.5">💡</span>
                  <p className="text-xs text-blue-300 leading-relaxed">
                    <strong className="text-blue-200">Mode Draft</strong> — Chatbot sedang <strong>NONAKTIF</strong>. Anda bisa menyiapkan & mengedit template tombol dengan tenang. Aktifkan chatbot di atas jika sudah siap.
                  </p>
                </div>
              )}

              {/* Visual Node Editor */}
              <FlowNodeEditor
                flowConfig={ws.flow_config || { nodes: [] }}
                onChange={async (newConfig) => {
                  setWs({ ...ws, flow_config: newConfig });
                  try {
                    await api.patch(`/workspaces/${ws.id}`, { flow_config: newConfig });
                    toast.success("Template disimpan!");
                  } catch { toast.error("Gagal menyimpan template"); }
                }}
              />

              {/* JSON editor fallback */}
              <details className="group">
                <summary className="text-xs text-slate-400 cursor-pointer hover:text-white flex items-center gap-1">⚙️ Editor JSON Lanjutan</summary>
                <div className="mt-3 space-y-3">
                  {flowError && (
                    <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-3 text-xs text-red-400">{flowError}</div>
                  )}
                  <textarea
                    className="w-full h-64 bg-slate-950 border border-slate-700 rounded-xl p-4 font-mono text-xs text-green-400 resize-none outline-none focus:border-vlc-500 leading-relaxed"
                    value={flowJson}
                    onChange={e => { setFlowJson(e.target.value); setFlowError(""); }}
                    spellCheck={false}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => {
                      try { const p = JSON.parse(flowJson); setFlowJson(JSON.stringify(p,null,2)); setFlowError(""); }
                      catch(e) { setFlowError("JSON tidak valid: " + e.message); }
                    }} className="btn-secondary flex-1 text-xs">✨ Format</button>
                    <button onClick={saveFlowConfig} className="btn-primary flex-1 text-xs">💾 Simpan JSON</button>
                  </div>
                </div>
              </details>
            </div>
          </div>
        )}

        {/* ── CANNED RESPONSES ─────────────────────────────────── */}
        {activeTab === "canned" && (
          <div className="space-y-4">
            <div className="card p-5 space-y-4">
              <h2 className="font-bold text-white">{editCanned ? "Edit Canned Response" : "Tambah Canned Response"}</h2>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Shortcut (ketik /)">
                  <input className="input font-mono" value={cannedForm.shortcut} onChange={e => setCannedForm(f=>({...f,shortcut:e.target.value}))} placeholder="/halo" />
                </Field>
                <Field label="Kategori">
                  <input className="input" value={cannedForm.category} onChange={e => setCannedForm(f=>({...f,category:e.target.value}))} placeholder="Greeting" />
                </Field>
              </div>
              <Field label="Judul">
                <input className="input" value={cannedForm.title} onChange={e => setCannedForm(f=>({...f,title:e.target.value}))} placeholder="Salam Pembuka" />
              </Field>
              <Field label="Isi Pesan">
                <textarea className="input h-24 resize-none" value={cannedForm.content} onChange={e => setCannedForm(f=>({...f,content:e.target.value}))} placeholder="Halo! Ada yang bisa kami bantu?" />
              </Field>
              <div className="flex gap-2">
                {editCanned && <button onClick={() => { setEditCanned(null); setCannedForm({ shortcut:"",title:"",content:"",category:"" }); }} className="btn-secondary flex-1">Batal</button>}
                <button onClick={saveCanned} className="btn-primary flex-1">
                  {editCanned ? "Perbarui" : "Tambah"}
                </button>
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="p-4 border-b border-slate-700 font-bold text-white text-sm">Daftar Canned Responses ({cannedList.length})</div>
              {cannedList.length === 0
                ? <div className="p-8 text-center text-slate-500 text-sm">Belum ada canned response</div>
                : cannedList.map(c => (
                  <div key={c.id} className="flex items-start gap-3 p-4 border-b border-slate-800 hover:bg-slate-800/40 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-vlc-400 font-mono text-xs">{c.shortcut}</span>
                        <span className="font-semibold text-white text-sm">{c.title}</span>
                        {c.category && <span className="badge-gray">{c.category}</span>}
                      </div>
                      <p className="text-xs text-slate-400 truncate">{c.content}</p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => {
                        setEditCanned(c);
                        setCannedForm({shortcut:c.shortcut,title:c.title,content:c.content,category:c.category||""});
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }} className="btn-ghost text-xs hover:bg-slate-700 p-1.5 rounded" title="Edit Canned Response">✏️</button>
                      <button onClick={() => deleteCanned(c.id)} className="btn-ghost text-xs text-red-400 hover:bg-red-500/20 p-1.5 rounded" title="Hapus Canned Response">🗑️</button>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* ── VISITOR DIBLOKIR ─────────────────────────────────── */}
        {activeTab === "blocked" && (
          <div className="card p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">🚫</span>
                  <h2 className="font-bold text-white text-xl">Daftar Visitor Diblokir</h2>
                  <span className="bg-red-500/20 text-red-400 border border-red-500/30 text-xs px-2.5 py-0.5 rounded-full font-bold">
                    {blockedList.length} diblokir
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Daftar visitor yang akses percakapannya sedang diblokir oleh CS / Admin.</p>
              </div>
              <button onClick={loadBlocked} className="btn-secondary text-xs px-3.5 py-2 flex items-center gap-2 self-start sm:self-auto">
                <span>🔄</span> Refresh Data
              </button>
            </div>

            {blockedLoading ? (
              <div className="text-center py-12 text-slate-500 text-sm">Memuat daftar terblokir...</div>
            ) : blockedList.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-sm space-y-3">
                <span className="text-5xl block">🛡️</span>
                <span className="font-bold text-slate-300 text-base block">Tidak Ada Visitor yang Diblokir</span>
                <p className="text-xs text-slate-500 max-w-md mx-auto">Semua visitor saat ini dapat mengakses widget livechat secara normal tanpa pembatasan.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {blockedList.map(item => {
                  const name = item.visitor_name || item.prechat_data?.username || item.prechat_data?.name || item.visitor_id;
                  const initial = name.charAt(0).toUpperCase();
                  return (
                    <div key={item.id} className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start gap-3.5 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-red-950/80 border border-red-800 text-red-400 flex items-center justify-center font-bold text-base flex-shrink-0 shadow-inner">
                          {initial}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white text-sm">{name}</span>
                            <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded font-mono">
                              ID: {item.visitor_id}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-slate-400 mt-1 flex-wrap">
                            <span>🌐 IP: <code className="text-slate-300 font-mono">{item.ip_address || "::1"}</code></span>
                            <span>📍 Lokasi: <span className="text-slate-300">{item.location || "Localhost"}</span></span>
                            <span>📅 Waktu: <span className="text-slate-300">{new Date(item.updated_at || item.created_at).toLocaleString("id-ID")}</span></span>
                          </div>
                          {item.last_message && (
                            <div className="text-xs text-slate-500 mt-2 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 truncate">
                              💬 Pesan Terakhir: <span className="text-slate-400 italic">"{item.last_message}"</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-end flex-shrink-0 border-t md:border-t-0 border-slate-800 pt-3 md:pt-0">
                        <button onClick={() => handleUnblock(item.id, name)}
                          className="px-4 py-2 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-600 hover:text-white transition-all font-bold text-xs flex items-center gap-1.5 shadow-sm">
                          <span>🔓</span> Buka Blokir
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── PROFILE ──────────────────────────────────────────── */}
        {activeTab === "profile" && (
          <div className="space-y-4">
            <div className="card p-6 space-y-5">
              <h2 className="font-bold text-white text-lg">Profil Saya</h2>

              {/* Avatar upload section */}
              <div className="flex items-center gap-4 bg-slate-900/80 p-4 rounded-xl border border-slate-800">
                <div className="relative group flex-shrink-0">
                  <Avatar src={agent?.avatar_url} name={agent?.display_name || agent?.name} bg={agent?.avatar_bg} size="w-16 h-16" textClass="text-2xl" />
                  <label className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <Camera className="w-5 h-5 text-white" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files[0];
                        if (file) handleAvatarUpload(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-white text-base truncate">{agent?.display_name || agent?.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{agent?.email} • <span className="capitalize text-indigo-400 font-semibold">{agent?.role}</span></p>
                  <label className="inline-flex items-center gap-1.5 mt-2.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium cursor-pointer transition-all shadow-sm">
                    <Camera className="w-3.5 h-3.5" />
                    <span>Upload Foto Profil</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files[0];
                        if (file) handleAvatarUpload(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>

              <Field label="Nama Lengkap">
                <input className="input" value={profile.name} onChange={e => setProfile(p=>({...p,name:e.target.value}))} />
              </Field>
              <Field label="Nama Tampil (ke Visitor)">
                <input className="input" value={profile.display_name} onChange={e => setProfile(p=>({...p,display_name:e.target.value}))} />
              </Field>
              <Field label="Jabatan">
                <input className="input" value={profile.title} onChange={e => setProfile(p=>({...p,title:e.target.value}))} placeholder="Senior CS" />
              </Field>
              <button onClick={saveProfile} className="btn-primary w-full">Simpan Profil</button>
            </div>

            <div className="card p-6 space-y-4">
              <h2 className="font-bold text-white">Ganti Password</h2>
              <Field label="Password Lama">
                <input className="input" type="password" value={pwForm.currentPassword} onChange={e => setPwForm(p=>({...p,currentPassword:e.target.value}))} />
              </Field>
              <Field label="Password Baru">
                <input className="input" type="password" value={pwForm.newPassword} onChange={e => setPwForm(p=>({...p,newPassword:e.target.value}))} />
              </Field>
              <Field label="Konfirmasi Password Baru">
                <input className="input" type="password" value={pwForm.confirmPassword} onChange={e => setPwForm(p=>({...p,confirmPassword:e.target.value}))} />
              </Field>
              <button onClick={changePassword} className="btn-primary w-full">Ganti Password</button>
            </div>
          </div>
        )}

        {/* ── FACEBOOK INTEGRATION ─────────────────────────────── */}
        {activeTab === "integrations" && (
          <div className="space-y-5">
            <div className="card p-6">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#1877F2" }}>
                  <span className="text-2xl">📘</span>
                </div>
                <div className="flex-1">
                  <h2 className="font-bold text-white text-lg">Integrasi Facebook Fanpage</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Terima pesan dari Facebook Messenger langsung di dashboard vlivechat dan balas langsung ke pengunjung Facebook.
                  </p>
                </div>
                <div className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                  fbIntegration?.is_active ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-slate-700 text-slate-400"
                }`}>
                  {fbIntegration?.is_active ? "✅ Aktif" : "⚫ Nonaktif"}
                </div>
              </div>

              {fbLoading ? (
                <div className="text-center py-8 text-slate-500 text-sm">Memuat konfigurasi...</div>
              ) : (
                <div className="space-y-4">
                  <Field label="Page ID Facebook">
                    <input className="input" value={fbForm.page_id} onChange={e => setFbForm(f => ({...f, page_id: e.target.value}))}
                      placeholder="Contoh: 123456789012345" />
                    <p className="text-xs text-slate-500 mt-1">ID halaman Facebook Anda. Dapat ditemukan di Info Halaman Facebook.</p>
                  </Field>

                  <Field label="Verify Token">
                    <input className="input" value={fbForm.verify_token} onChange={e => setFbForm(f => ({...f, verify_token: e.target.value}))}
                      placeholder="Buat token unik yang mudah diingat, contoh: vlc_fb_verify_2024" />
                    <p className="text-xs text-slate-500 mt-1">Token ini digunakan saat mendaftarkan Webhook di Facebook Developer Console.</p>
                  </Field>

                  <Field label="Page Access Token">
                    <input className="input" type="password" value={fbForm.page_access_token} onChange={e => setFbForm(f => ({...f, page_access_token: e.target.value}))}
                      placeholder={fbIntegration?.config?.page_access_token_masked || "Masukkan Page Access Token"} />
                    <p className="text-xs text-slate-500 mt-1">Dapatkan dari Facebook Developer Console → Your App → Messenger → Generate Token.</p>
                  </Field>

                  <Field label="App Secret (Opsional, untuk keamanan tambahan)">
                    <input className="input" type="password" value={fbForm.app_secret} onChange={e => setFbForm(f => ({...f, app_secret: e.target.value}))}
                      placeholder="App Secret Facebook App Anda" />
                    <p className="text-xs text-slate-500 mt-1">Digunakan untuk memverifikasi request webhook dari Facebook menggunakan X-Hub-Signature-256.</p>
                  </Field>

                  <div className="flex items-center gap-3 py-2">
                    <button
                      onClick={() => setFbForm(f => ({...f, is_active: !f.is_active}))}
                      className={`relative inline-flex w-12 h-6 items-center rounded-full transition-colors duration-200 flex-shrink-0 ${
                        fbForm.is_active ? "bg-emerald-500" : "bg-slate-600"
                      }`}
                    >
                      <span className={`inline-block w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
                        fbForm.is_active ? "translate-x-6" : "translate-x-1"
                      }`} />
                    </button>
                    <span className="text-sm text-slate-300">Aktifkan integrasi Facebook</span>
                  </div>

                  <button onClick={saveFbIntegration} disabled={fbSaving} className="btn-primary w-full">
                    {fbSaving ? "Menyimpan..." : "💾 Simpan Konfigurasi Facebook"}
                  </button>
                </div>
              )}
            </div>

            {/* Setup Guide */}
            <div className="card p-6">
              <h3 className="font-bold text-white mb-4">📖 Panduan Setup (Setelah Deploy ke vlivechat.com)</h3>
              <ol className="space-y-3 text-sm text-slate-400">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-vlc-700 flex items-center justify-center text-white text-xs font-bold">1</span>
                  <div>Buka <a href="https://developers.facebook.com" target="_blank" rel="noopener" className="text-vlc-400 hover:underline">developers.facebook.com</a> → Buat App baru → Pilih tipe <strong>Business</strong></div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-vlc-700 flex items-center justify-center text-white text-xs font-bold">2</span>
                  <div>Tambahkan produk <strong>Messenger</strong> ke App → Generate Page Access Token untuk Fanpage Anda</div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-vlc-700 flex items-center justify-center text-white text-xs font-bold">3</span>
                  <div>Isi form di atas lalu klik Simpan, kemudian daftarkan Webhook URL ini di Facebook Messenger Settings:</div>
                </li>
                <li className="ml-9">
                  <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 font-mono text-xs text-green-400">
                    https://vlivechat.com/api/v1/integrations/facebook/webhook
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-vlc-700 flex items-center justify-center text-white text-xs font-bold">4</span>
                  <div>Masukkan Verify Token yang sama seperti yang kamu isi di form atas, centang <strong>messages</strong> & <strong>messaging_postbacks</strong></div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-vlc-700 flex items-center justify-center text-white text-xs font-bold">5</span>
                  <div>✅ Selesai! Pesan dari Fanpage Facebook akan muncul di dashboard vlivechat secara real-time</div>
                </li>
              </ol>
            </div>
          </div>
        )}

        {/* ── EMBED CODE ───────────────────────────────────────── */}
        {activeTab === "embed" && (
          <div className="space-y-4">
            <div className="card p-6">
              <h2 className="font-bold text-white mb-2">Script Embed Widget</h2>
              <p className="text-slate-400 text-sm mb-4">Paste kode ini sebelum <code className="text-vlc-400">&lt;/body&gt;</code> di website Anda.</p>
              <div className="bg-slate-950 rounded-xl p-4 font-mono text-sm text-green-400 overflow-x-auto border border-slate-700 relative">
                <pre>{widgetEmbedCode}</pre>
                <button onClick={() => { navigator.clipboard.writeText(widgetEmbedCode); toast.success("Kode disalin!"); }}
                  className="absolute top-3 right-3 bg-slate-700 hover:bg-slate-600 text-white text-xs px-3 py-1.5 rounded-lg transition-all">
                  Copy
                </button>
              </div>
            </div>

            <div className="card p-6">
              <h2 className="font-bold text-white mb-2">Direct URL</h2>
              <p className="text-slate-400 text-sm mb-4">Link langsung untuk dibagikan ke visitor.</p>
              {ws && (
                <div className="flex items-center gap-2">
                  <input className="input text-xs flex-1 font-mono" readOnly
                    value={directWidgetUrl} />
                  <button onClick={() => { navigator.clipboard.writeText(directWidgetUrl); toast.success("URL disalin!"); }}
                    className="btn-secondary text-xs">Copy</button>
                  <a href={directWidgetUrl} target="_blank" rel="noreferrer" className="btn-primary text-xs flex items-center gap-1">
                    <ExternalLink className="w-3.5 h-3.5" /> Buka Widget
                  </a>
                </div>
              )}
            </div>

            {ws && (
              <div className="card p-4 flex items-center gap-3">
                <span className="text-2xl">🔑</span>
                <div>
                  <div className="font-semibold text-white text-sm">Workspace Code</div>
                  <div className="text-vlc-400 font-mono text-sm">{ws.code}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

// ── Visual Flow Node Editor ───────────────────────────────────────
function FlowNodeEditor({ flowConfig, onChange }) {
  const nodes = flowConfig?.nodes || [];
  const [editingNodeIdx, setEditingNodeIdx] = useState(null);

  function updateNode(idx, updated) {
    const newNodes = nodes.map((n, i) => i === idx ? updated : n);
    onChange({ ...flowConfig, nodes: newNodes });
  }

  function addNode() {
    const newNode = {
      id: "node_" + Date.now(),
      type: "menu",
      message: "Pesan baru",
      options: [],
    };
    onChange({ ...flowConfig, nodes: [...nodes, newNode] });
    setEditingNodeIdx(nodes.length);
  }

  function deleteNode(idx) {
    if (!confirm("Hapus node ini?")) return;
    const newNodes = nodes.filter((_, i) => i !== idx);
    onChange({ ...flowConfig, nodes: newNodes });
    setEditingNodeIdx(null);
  }

  function addOption(nodeIdx) {
    const node = nodes[nodeIdx];
    const newOpt = { id: "opt_" + Date.now(), label: "Pilihan Baru", next: "" };
    updateNode(nodeIdx, { ...node, options: [...(node.options || []), newOpt] });
  }

  function updateOption(nodeIdx, optIdx, updated) {
    const node = nodes[nodeIdx];
    const newOpts = (node.options || []).map((o, i) => i === optIdx ? updated : o);
    updateNode(nodeIdx, { ...node, options: newOpts });
  }

  function deleteOption(nodeIdx, optIdx) {
    const node = nodes[nodeIdx];
    const newOpts = (node.options || []).filter((_, i) => i !== optIdx);
    updateNode(nodeIdx, { ...node, options: newOpts });
  }

  return (
    <div className="space-y-3">
      {nodes.length === 0 && (
        <div className="text-center py-8 text-slate-500 text-sm border border-dashed border-slate-700 rounded-xl">
          <div className="text-3xl mb-2">🌳</div>
          Belum ada node. Klik "+ Tambah Node" untuk memulai.
        </div>
      )}

      {nodes.map((node, idx) => (
        <div key={node.id || idx} className="border border-slate-700 rounded-xl overflow-hidden">
          {/* Node header */}
          <button
            onClick={() => setEditingNodeIdx(editingNodeIdx === idx ? null : idx)}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-800 hover:bg-slate-700 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <span className="text-base">{node.type === "menu" ? "📋" : node.type === "connect" ? "🔗" : node.type === "input" ? "📝" : "📌"}</span>
              <div>
                <div className="text-sm font-semibold text-white">{node.id}</div>
                <div className="text-xs text-slate-400 truncate max-w-xs">{node.message?.slice(0, 60)}{node.message?.length > 60 ? "…" : ""}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${{
                menu: "bg-blue-500/20 text-blue-400",
                connect: "bg-emerald-500/20 text-emerald-400",
                input: "bg-amber-500/20 text-amber-400",
                summary: "bg-purple-500/20 text-purple-400",
              }[node.type] || "bg-slate-700 text-slate-400"}`}>{node.type}</span>
              <span className="text-slate-400 text-xs">{editingNodeIdx === idx ? "▲" : "▼"}</span>
            </div>
          </button>

          {/* Node editor */}
          {editingNodeIdx === idx && (
            <div className="p-4 bg-slate-900 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">ID Node</label>
                  <input className="input text-xs" value={node.id} onChange={e => updateNode(idx, { ...node, id: e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Tipe</label>
                  <select className="input text-xs" value={node.type} onChange={e => updateNode(idx, { ...node, type: e.target.value })}>
                    <option value="menu">📋 Menu (dengan pilihan)</option>
                    <option value="input">📝 Input (visitor ketik)</option>
                    <option value="connect">🔗 Hubungkan ke CS</option>
                    <option value="summary">📌 Ringkasan</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Pesan Bot (Mendukung Markdown)</label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const current = node.message || "";
                        const snippet = "[Teks Link](https://domain-anda.com)";
                        updateNode(idx, { ...node, message: current ? `${current}\n${snippet}` : snippet });
                      }}
                      className="text-[10px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded transition-all font-medium flex items-center gap-1"
                    >
                      🔗 + Sisipkan Link Clickable
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const current = node.message || "";
                        const snippet = "**Teks Tebal**";
                        updateNode(idx, { ...node, message: current ? `${current} ${snippet}` : snippet });
                      }}
                      className="text-[10px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white px-2 py-0.5 rounded transition-all font-medium"
                    >
                      <b>B</b> Tebal
                    </button>
                  </div>
                </div>
                <textarea
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white leading-relaxed font-sans focus:border-vlc-500 outline-none transition-all"
                  rows={8}
                  style={{ resize: "vertical", minHeight: "160px" }}
                  value={node.message || ""}
                  onChange={e => updateNode(idx, { ...node, message: e.target.value })}
                  placeholder="Ketik pesan bot di sini... Gunakan [Teks Link](https://url-tujuan.com) untuk membuat link clickable."
                />
                <div className="text-[10px] text-slate-500 mt-1 flex items-center justify-between">
                  <span>💡 Tip Link: <code className="text-slate-400 bg-slate-950 px-1 py-0.5 rounded font-mono">[Teks Klik](https://domain.com)</code></span>
                  <span className="text-slate-600">↕️ Tarik sudut kanan bawah untuk memperpanjang kolom</span>
                </div>
              </div>

              {(node.type === "menu") && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Tombol Pilihan</label>
                    <button onClick={() => addOption(idx)} className="text-[10px] bg-vlc-600 hover:bg-vlc-500 text-white px-2 py-1 rounded transition-colors">+ Tambah Tombol</button>
                  </div>
                  <div className="space-y-2">
                    {(node.options || []).map((opt, optIdx) => (
                      <div key={opt.id || optIdx} className="flex gap-2 items-center">
                        <input className="input text-xs flex-1" placeholder="Label tombol"
                          value={opt.label} onChange={e => updateOption(idx, optIdx, { ...opt, label: e.target.value })} />
                        <select className="input text-xs w-40" value={opt.next || ""}
                          onChange={e => updateOption(idx, optIdx, { ...opt, next: e.target.value })}>
                          <option value="">— Next node —</option>
                          {nodes.map(n => <option key={n.id} value={n.id}>{n.id}</option>)}
                        </select>
                        <button onClick={() => deleteOption(idx, optIdx)}
                          className="text-red-400 hover:text-red-300 text-xs px-2 py-1.5 rounded hover:bg-red-900/20 transition-colors">✕</button>
                      </div>
                    ))}
                    {(!node.options || node.options.length === 0) && (
                      <div className="text-xs text-slate-600 italic">Belum ada tombol</div>
                    )}
                  </div>
                </div>
              )}

              {(node.type === "input") && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Simpan ke field</label>
                    <input className="input text-xs" value={node.field || ""} onChange={e => updateNode(idx, { ...node, field: e.target.value })} placeholder="misal: nama, no_hp" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Next node</label>
                    <select className="input text-xs" value={node.next || ""} onChange={e => updateNode(idx, { ...node, next: e.target.value })}>
                      <option value="">— Pilih node —</option>
                      {nodes.map(n => <option key={n.id} value={n.id}>{n.id}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button onClick={() => deleteNode(idx)}
                  className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1.5 hover:bg-red-900/20 px-3 py-1.5 rounded transition-colors">
                  🗑️ Hapus Node
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      <button onClick={addNode}
        className="w-full py-3 border border-dashed border-slate-600 hover:border-vlc-500 text-slate-400 hover:text-vlc-400 rounded-xl text-sm font-medium transition-all hover:bg-vlc-600/5">
        + Tambah Node
      </button>
    </div>
  );
}

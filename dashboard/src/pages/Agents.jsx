import { useEffect, useState, useRef } from "react";
import { MessageSquare, Archive, BarChart2, Users, Settings2, Camera, Pencil, Ban, Circle, Trash2 } from "lucide-react";
import api, { getFileUrl } from "../api";
import useChatStore from "../store/chatStore";
import toast from "react-hot-toast";
import ConfirmModal from "../components/ConfirmModal";
import Avatar from "../components/Avatar";

const API_BASE = import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";

function parsePermissions(perms) {
  let arr = [];
  if (Array.isArray(perms)) arr = perms;
  else if (typeof perms === "string") {
    arr = perms.replace(/[{}]/g, "").split(",").map(s => s.trim()).filter(Boolean);
  }
  return [...new Set(["livechat", "archives", ...arr])];
}

const DEFAULT_PERMS_BY_ROLE = {
  agent: ["livechat", "archives"],
  supervisor: ["livechat", "archives", "reports"],
  admin: ["livechat", "archives", "reports", "agents", "settings"],
  superadmin: ["livechat", "archives", "reports", "agents", "settings"]
};

export default function Agents() {
  const agent           = useChatStore(s => s.agent);
  const socket          = useChatStore(s => s.socket);
  const socketConnected = useChatStore(s => s.socketConnected);
  const [agents, setAgents] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editAgent, setEditAgent] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [form, setForm] = useState({ name:"", email:"", password:"", role:"agent", display_name:"", title:"", max_conversations:5, permissions: ["livechat", "archives"] });

  async function loadAgents() {
    try {
      const { data } = await api.get("/agents");
      setAgents(data);
    } catch { toast.error("Gagal memuat daftar agent"); }
    setLoading(false);
  }
  // Initial load
  useEffect(() => { loadAgents(); }, []);

  // Reload agents whenever socket connects/reconnects (fixes stale is_online after page refresh)
  const prevConnected = useRef(false);
  useEffect(() => {
    if (socketConnected && !prevConnected.current) {
      // Socket just connected — DB is_online already updated by socket handler, reload fresh
      loadAgents();
    }
    prevConnected.current = socketConnected;
  }, [socketConnected]);

  // Attach realtime socket listeners — runs whenever socket instance changes
  useEffect(() => {
    if (!socket) return;

    const handleAgentOnline = ({ agentId }) => {
      setAgents(prev => prev.map(a => a.id === agentId ? { ...a, is_online: true, status: "online" } : a));
    };
    const handleAgentOffline = ({ agentId }) => {
      setAgents(prev => prev.map(a => a.id === agentId ? { ...a, is_online: false, status: "offline" } : a));
    };
    const handleAgentStatusChanged = ({ agentId, status }) => {
      setAgents(prev => prev.map(a => a.id === agentId ? { ...a, status, is_online: status !== "offline" } : a));
    };

    socket.on("agent:online",         handleAgentOnline);
    socket.on("agent:offline",        handleAgentOffline);
    socket.on("agent:status_changed", handleAgentStatusChanged);

    return () => {
      socket.off("agent:online",         handleAgentOnline);
      socket.off("agent:offline",        handleAgentOffline);
      socket.off("agent:status_changed", handleAgentStatusChanged);
    };
  }, [socket]);


  async function handleSave() {
    try {
      let savedAgent;
      if (editAgent) {
        const { data } = await api.patch(`/agents/${editAgent.id}`, form);
        savedAgent = data;
        toast.success("Agent diperbarui");
      } else {
        const { data } = await api.post("/agents", form);
        savedAgent = data;
        toast.success("Agent ditambahkan");
      }

      // If self edit, update chatStore and localStorage
      if (editAgent && editAgent.id === agent?.id) {
        const updatedSelf = { ...agent, ...savedAgent, permissions: parsePermissions(savedAgent.permissions || form.permissions) };
        useChatStore.setState({ agent: updatedSelf });
        localStorage.setItem("vlc_agent", JSON.stringify(updatedSelf));
      }

      setShowModal(false); setEditAgent(null);
      setForm({ name:"", email:"", password:"", role:"agent", display_name:"", title:"", max_conversations:5, permissions: ["livechat"] });
      loadAgents();
    } catch (err) {
      toast.error(err.response?.data?.error || "Gagal menyimpan");
    }
  }

  const [deactivateAgentId, setDeactivateAgentId] = useState(null);
  const [deleteAgentId,     setDeleteAgentId]     = useState(null);
  const [deleteAgentName,   setDeleteAgentName]   = useState("");

  function handleDeactivateClick(id) { setDeactivateAgentId(id); }

  async function handleConfirmDeactivate() {
    if (!deactivateAgentId) return;
    const targetId = deactivateAgentId;
    setDeactivateAgentId(null);
    try {
      await api.delete(`/agents/${targetId}`);
      toast.success("Agent dinonaktifkan");
      loadAgents();
    } catch { toast.error("Gagal menonaktifkan"); }
  }

  function handleDeleteClick(ag) {
    setDeleteAgentId(ag.id);
    setDeleteAgentName(ag.display_name || ag.name);
  }

  async function handleConfirmDelete() {
    if (!deleteAgentId) return;
    const targetId = deleteAgentId;
    setDeleteAgentId(null);
    setDeleteAgentName("");
    try {
      await api.delete(`/agents/${targetId}/permanent`);
      toast.success("Agent berhasil dihapus permanen");
      loadAgents();
    } catch (err) {
      toast.error(err.response?.data?.error || "Gagal menghapus agent");
    }
  }

  async function handleAvatarUpload(agentId, file) {
    const fd = new FormData();
    fd.append("avatar", file);
    try {
      await api.post(`/agents/${agentId}/avatar`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Foto profil diperbarui");
      loadAgents();
    } catch { toast.error("Gagal mengunggah foto"); }
  }

  const roleBadge = { superadmin:"badge-red", admin:"badge-yellow", supervisor:"badge-blue", agent:"badge-gray" };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-950">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Manajemen Agent</h1>
            <p className="text-slate-400 text-sm mt-1">Kelola tim Customer Service & Hak Akses (Permissions)</p>
          </div>
          <button onClick={() => { setEditAgent(null); setForm({ name:"", email:"", password:"", role:"agent", display_name:"", title:"", max_conversations:5, permissions: ["livechat"] }); setShowModal(true); }} className="btn-primary">
            ＋ Tambah Agent
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12 text-slate-500">Memuat...</div>
        ) : (
          <div className="grid gap-3">
            {agents.map(a => (
              <div key={a.id} className="card p-4 flex items-center gap-4 hover:border-slate-600 transition-all">
                {/* Avatar with upload */}
                <div className="relative group flex-shrink-0">
                  <Avatar src={a.avatar_url} name={a.display_name || a.name} bg={a.avatar_bg} size="w-12 h-12" textClass="text-lg" />
                  {/* Upload overlay */}
                  {(a.id === agent?.id || ["admin","superadmin"].includes(agent?.role)) && (
                    <label className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                      <Camera className="w-4 h-4 text-white" />
                      <input type="file" accept="image/*" className="hidden" onChange={e => {
                        const file = e.target.files[0];
                        if (file) handleAvatarUpload(a.id, file);
                        e.target.value = "";
                      }} />
                    </label>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-white">{a.display_name || a.name}</span>
                    <span className={roleBadge[a.role] || "badge-gray"}>{a.role}</span>
                    {a.is_online
                      ? <span className="badge-green flex items-center gap-1"><Circle className="w-2 h-2 fill-emerald-400 text-emerald-400" /> Online</span>
                      : <span className="badge-gray flex items-center gap-1"><Circle className="w-2 h-2 fill-slate-400 text-slate-400" /> Offline</span>
                    }
                    {!a.is_active && <span className="badge-red">Nonaktif</span>}
                  </div>
                  <div className="text-xs text-slate-400">{a.email} {a.title ? `• ${a.title}` : ""}</div>

                  {/* Permission badges */}
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {parsePermissions(a.permissions).map(p => {
                      const permMeta = {
                        livechat: { icon: MessageSquare, label: "Live Chat" },
                        archives: { icon: Archive,        label: "archives" },
                        reports:  { icon: BarChart2,      label: "Laporan" },
                        agents:   { icon: Users,          label: "Agent" },
                        settings: { icon: Settings2,      label: "Pengaturan" },
                      }[p];
                      const IconP = permMeta?.icon;
                      return (
                        <span key={p} className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded font-mono flex items-center gap-1">
                          {IconP && <IconP className="w-3 h-3" />}
                          {permMeta?.label || p}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 items-center">
                  <button onClick={() => {
                    setEditAgent(a);
                    setForm({ name:a.name, email:a.email, password:"", role:a.role, display_name:a.display_name||"", title:a.title||"", max_conversations:a.max_conversations||5, permissions: parsePermissions(a.permissions) });
                    setShowModal(true);
                  }} className="btn-ghost text-xs flex items-center gap-1">
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                  {a.id !== agent?.id && a.is_active && (
                    <button onClick={() => handleDeactivateClick(a.id)}
                      title="Nonaktifkan agent"
                      className="btn-ghost text-xs text-amber-400 hover:text-amber-300">
                      <Ban className="w-4 h-4" />
                    </button>
                  )}
                  {a.id !== agent?.id && (
                    <button onClick={() => handleDeleteClick(a)}
                      title="Hapus permanen"
                      className="btn-ghost text-xs text-red-500 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="card p-6 w-full max-w-md animate-bounce-in max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-white mb-5">{editAgent ? "Edit Agent" : "Tambah Agent Baru"}</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Nama Lengkap *</label>
                <input className="input" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} placeholder="Ahmad Fauzi" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Nama Tampil (ke Visitor)</label>
                <input className="input" value={form.display_name} onChange={e => setForm(f=>({...f,display_name:e.target.value}))} placeholder="CS Ahmad" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Jabatan/Posisi</label>
                <input className="input" value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))} placeholder="Senior CS" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Email *</label>
                <input className="input" type="email" value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))} disabled={!!editAgent} placeholder="email@domain.com" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">
                  {editAgent ? "Password Baru (opsional)" : "Password *"}
                </label>
                <input className="input" type="password" value={form.password} onChange={e => setForm(f=>({...f,password:e.target.value}))} placeholder={editAgent ? "Kosongkan jika tidak ingin diubah" : "Min. 8 karakter"} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Role</label>
                <select
                  className="input"
                  value={form.role}
                  onChange={e => {
                    const r = e.target.value;
                    setForm(f => ({ ...f, role: r, permissions: DEFAULT_PERMS_BY_ROLE[r] || ["livechat"] }));
                  }}
                >
                  <option value="agent">Agent</option>
                  <option value="supervisor">Supervisor</option>
                  {agent?.role === "superadmin" && <option value="admin">Admin</option>}
                </select>
              </div>

              {/* Permissions checkboxes */}
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase mb-2 block">Hak Akses Menu (Permissions)</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                  {[
                    { id: "livechat", icon: MessageSquare, label: "Live Chat",    disabled: true },
                    { id: "archives", icon: Archive,        label: "Arsip Chat",  disabled: true },
                    { id: "reports",  icon: BarChart2,      label: "Laporan" },
                    { id: "agents",   icon: Users,          label: "Kelola Agent" },
                    { id: "settings", icon: Settings2,      label: "Pengaturan" },
                  ].map(p => {
                    const PIcon = p.icon;
                    const userPerms = parsePermissions(form.permissions);
                    const checked = p.disabled || userPerms.includes(p.id);
                    return (
                      <label key={p.id} className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer select-none p-1 rounded hover:bg-slate-800">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={p.disabled}
                          onChange={e => {
                            const current = parsePermissions(form.permissions);
                            if (e.target.checked) {
                              setForm(f => ({ ...f, permissions: [...new Set([...current, p.id])] }));
                            } else {
                              setForm(f => ({ ...f, permissions: current.filter(x => x !== p.id) }));
                            }
                          }}
                          className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-vlc-500 focus:ring-vlc-500"
                        />
                        <span className="flex items-center gap-1.5">
                          <PIcon className="w-3.5 h-3.5 text-slate-400" />
                          {p.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">Max Chat Bersamaan</label>
                <input className="input" type="number" min={1} max={20} value={form.max_conversations} onChange={e => setForm(f=>({...f,max_conversations:parseInt(e.target.value)}))} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowModal(false); setEditAgent(null); }} className="btn-secondary flex-1">Batal</button>
              <button onClick={handleSave} className="btn-primary flex-1">Simpan</button>
            </div>
          </div>
        </div>
      )}
      {/* Deactivate Confirm */}
      <ConfirmModal
        isOpen={!!deactivateAgentId}
        onClose={() => setDeactivateAgentId(null)}
        onConfirm={handleConfirmDeactivate}
        title="Nonaktifkan Agent"
        message="Agent ini tidak akan dapat login sampai diaktifkan kembali. Anda bisa mengaktifkan kembali kapan saja lewat menu Edit."
        confirmText="Ya, Nonaktifkan"
        cancelText="Batal"
        confirmVariant="danger"
        icon={<Ban className="w-5 h-5 text-amber-400" />}
      />

      {/* Permanent Delete Confirm */}
      <ConfirmModal
        isOpen={!!deleteAgentId}
        onClose={() => { setDeleteAgentId(null); setDeleteAgentName(""); }}
        onConfirm={handleConfirmDelete}
        title="Hapus Agent Permanen"
        message={`Anda akan menghapus "${deleteAgentName}" secara PERMANEN dari sistem. Semua percakapan aktif yang sedang ditangani agent ini akan di-unassign. Tindakan ini tidak bisa dibatalkan.`}
        confirmText="Ya, Hapus Permanen"
        cancelText="Batal"
        confirmVariant="danger"
        icon={<Trash2 className="w-5 h-5 text-red-500" />}
      />
    </div>
  );
}

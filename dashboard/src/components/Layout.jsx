import { useEffect, useState, useRef, useCallback } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  MessageSquare,
  Archive,
  BarChart2,
  Users,
  Settings as SettingsIcon,
  ShieldCheck,
  Bell,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User,
  Volume2,
  VolumeX,
} from "lucide-react";
import useChatStore from "../store/chatStore";
import api, { getFileUrl } from "../api";
import toast from "react-hot-toast";
import ConfirmModal from "./ConfirmModal";
import Avatar from "./Avatar";

const navItems = [
  { to: "/home",       icon: LayoutDashboard, label: "Home",       perm: "livechat" },
  { to: "/chats",      icon: MessageSquare,   label: "Live Chat",  perm: "livechat" },
  { to: "/archives",   icon: Archive,         label: "Arsip Chat", perm: "archives" },
  { to: "/reports",    icon: BarChart2,       label: "Laporan",    perm: "reports" },
  { to: "/agents",     icon: Users,           label: "Agent",      perm: "agents" },
  { to: "/settings",   icon: SettingsIcon,    label: "Pengaturan", perm: "settings" },
  { to: "/superadmin", icon: ShieldCheck,     label: "Superadmin", superadminOnly: true },
];

// ── Default notification preferences ────────────────────────────
const DEFAULT_PREFS = {
  sound_enabled:     true,
  repeat_sound:      false,
  new_messages:      true,
  incoming_chats:    true,
  queue_visitors:    true,
  new_visitors:      true,
  returning_visitors:true,
};

function loadPrefs() {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem("vlc_notif_prefs") || "{}") }; }
  catch { return { ...DEFAULT_PREFS }; }
}

// ── Web Audio API: generate notification sounds ──────────────────
function playNotifSound(type = "ding") {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (type === "ding") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
    } else if (type === "pop") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2);
    } else if (type === "chime") {
      const osc1 = ctx.createOscillator(); const gain1 = ctx.createGain();
      const osc2 = ctx.createOscillator(); const gain2 = ctx.createGain();
      osc1.connect(gain1); gain1.connect(ctx.destination);
      osc2.connect(gain2); gain2.connect(ctx.destination);
      osc1.frequency.value = 523;
      gain1.gain.setValueAtTime(0.25, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc1.start(ctx.currentTime); osc1.stop(ctx.currentTime + 0.3);
      osc2.frequency.value = 659;
      gain2.gain.setValueAtTime(0.0, ctx.currentTime);
      gain2.gain.setValueAtTime(0.2, ctx.currentTime + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc2.start(ctx.currentTime + 0.15); osc2.stop(ctx.currentTime + 0.45);
    }
  } catch {}
}

function sendBrowserNotif(title, body) {
  if (Notification.permission !== "granted") return;
  try { new Notification(title, { body, icon: "/vlivechat-favicon-512x512.png" }); } catch {}
}

// ── Notification Preferences Modal ──────────────────────────────
function NotificationPrefsModal({ open, onClose }) {
  const [prefs, setPrefs]   = useState(loadPrefs);
  const [perm, setPerm]     = useState(Notification.permission);
  const [testId, setTestId] = useState(null);

  useEffect(() => { if (open) { setPrefs(loadPrefs()); setPerm(Notification.permission); } }, [open]);

  function setPref(key, val) { setPrefs(p => ({ ...p, [key]: val })); }

  async function enableBrowserNotifs() {
    if (Notification.permission === "denied") {
      toast.error("Izin notifikasi diblokir browser. Klik ikon 🔒 di sebelah URL address bar untuk mengaktifkannya.", { id: "notif-denied", duration: 5000 });
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setPerm(result);
      if (result === "granted") {
        toast.success("Notifikasi desktop berhasil diaktifkan!");
      } else if (result === "denied") {
        toast.error("Izin notifikasi diblokir. Aktifkan via ikon 🔒 di address bar.");
      }
    } catch (e) {
      console.error(e);
    }
  }

  function handleSave()   { localStorage.setItem("vlc_notif_prefs", JSON.stringify(prefs)); onClose(); }
  function handleCancel() { setPrefs(loadPrefs()); onClose(); }

  function runTest(key) {
    setTestId(key);
    setTimeout(() => setTestId(null), 900);
    const p = loadPrefs();
    if (p.sound_enabled) {
      if (key === "new_messages") playNotifSound("ding");
      else if (["incoming_chats","queue_visitors"].includes(key)) playNotifSound("chime");
      else playNotifSound("pop");
    }
    sendBrowserNotif("vlivechat — Test", {
      new_messages:      "Pesan baru masuk dari visitor",
      incoming_chats:    "Ada percakapan baru masuk",
      queue_visitors:    "Visitor menunggu di antrean",
      new_visitors:      "Visitor baru terhubung",
      returning_visitors:"Visitor lama kembali",
    }[key] || "Test notifikasi");
  }

  const items = [
    { key: "new_messages",      label: "New messages" },
    { key: "incoming_chats",    label: "Incoming chats" },
    { key: "queue_visitors",    label: "Visitors in the queue" },
    { key: "new_visitors",      label: "New visitors" },
    { key: "returning_visitors",label: "Returning visitors" },
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={e => e.target === e.currentTarget && handleCancel()}>
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-md animate-fade-in">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-800">
          <h2 className="font-bold text-white text-base">Notification preferences</h2>
          <button onClick={handleCancel}
            className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm transition-colors">
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Browser Desktop Push Notification Row */}
          <div className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
            <div className="flex items-center gap-2 text-slate-200 text-sm font-medium">
              <span className="text-base">🔔</span>
              <span>Desktop notifications</span>
            </div>
            {perm === "granted" ? (
              <span className="text-emerald-400 text-xs font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                ✅ Enabled
              </span>
            ) : (
              <button
                onClick={enableBrowserNotifs}
                className="px-3 py-1 bg-vlc-600 hover:bg-vlc-500 text-white text-xs font-semibold rounded-lg transition-all shadow-sm active:scale-95"
              >
                Enable
              </button>
            )}
          </div>
          {perm === "denied" && (
            <p className="text-[11px] text-slate-400 px-1 -mt-2">
              💡 Turn on browser notifications via site settings (lock icon 🔒 near URL).
            </p>
          )}

          {/* Sound toggle */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-200 text-sm font-medium">
                <span className="text-base">🔊</span>
                <span>Notification sound</span>
              </div>
              <button
                onClick={() => { const nv = !prefs.sound_enabled; setPref("sound_enabled", nv); if (nv) playNotifSound("ding"); }}
                className={`relative inline-flex w-12 h-6 items-center rounded-full transition-colors duration-200 flex-shrink-0 ${
                  prefs.sound_enabled ? "bg-emerald-500" : "bg-slate-600"
                }`}
              >
                <span className={`inline-block w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
                  prefs.sound_enabled ? "translate-x-6" : "translate-x-1"
                }`} />
              </button>
            </div>

            <div className="flex items-start gap-2.5 ml-7">
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer transition-all flex-shrink-0 mt-0.5 ${prefs.repeat_sound ? "bg-vlc-600 border-vlc-500" : "border-slate-600 bg-slate-800 hover:border-slate-500"}`}
                onClick={() => setPref("repeat_sound", !prefs.repeat_sound)}>
                {prefs.repeat_sound && <span className="text-white text-[10px] leading-none">✓</span>}
              </div>
              <label className="text-sm text-slate-400 cursor-pointer select-none leading-relaxed"
                onClick={() => setPref("repeat_sound", !prefs.repeat_sound)}>
                Repeat <strong className="text-slate-300">New message</strong> sound until message is read
              </label>
            </div>
          </div>

          {/* Notify me about */}
          <div>
            <p className="font-bold text-white text-sm mb-3">Notify me about...</p>
            <div className="divide-y divide-slate-800/50">
              {items.map(item => (
                <div key={item.key} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer transition-all flex-shrink-0 ${prefs[item.key] ? "bg-vlc-600 border-vlc-500" : "border-slate-600 bg-slate-800 hover:border-slate-500"}`}
                      onClick={() => setPref(item.key, !prefs[item.key])}>
                      {prefs[item.key] && <span className="text-white text-[10px] leading-none">✓</span>}
                    </div>
                    <label className="text-sm text-slate-200 cursor-pointer select-none"
                      onClick={() => setPref(item.key, !prefs[item.key])}>
                      {item.label}
                    </label>
                    <button onClick={() => runTest(item.key)}
                      className={`text-xs font-semibold transition-all ${testId === item.key ? "text-emerald-400" : "text-vlc-400 hover:text-vlc-300"}`}>
                      ({testId === item.key ? "✓ ok" : "test"})
                    </button>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">Default sound</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-slate-800">
          <button onClick={handleCancel}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors border border-slate-700">
            Cancel
          </button>
          <button onClick={handleSave}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-vlc-600 hover:bg-vlc-500 transition-colors shadow-md">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Notification trigger hook ────────────────────────────────────
function useNotifications() {
  const socket = useChatStore(s => s.socket);
  const repeatRef = useRef(null);
  const getPrefs = useCallback(loadPrefs, []);

  useEffect(() => {
    if (!socket) return;

    function onNewMessage(msg) {
      const p = getPrefs();
      if (!p.new_messages) return;
      if (p.sound_enabled) playNotifSound("ding");
      sendBrowserNotif("Pesan baru masuk", msg.text || "Ada pesan baru");
      if (p.repeat_sound && p.sound_enabled) {
        if (repeatRef.current) clearInterval(repeatRef.current);
        repeatRef.current = setInterval(() => {
          const pp = getPrefs();
          if (!pp.repeat_sound || !pp.sound_enabled) { clearInterval(repeatRef.current); return; }
          playNotifSound("ding");
        }, 30000);
      }
    }

    function onConvNew(data) {
      const p = getPrefs();
      if (!p.incoming_chats) return;
      const conv = data?.conversation || data;
      if (p.sound_enabled) playNotifSound("chime");
      sendBrowserNotif("Chat baru", `${conv?.visitor_name || "Visitor"} memulai percakapan`);
    }

    function onQueue() {
      const p = getPrefs();
      if (!p.queue_visitors) return;
      if (p.sound_enabled) playNotifSound("chime");
      sendBrowserNotif("Visitor menunggu", "Ada visitor menunggu respon CS");
    }

    socket.on("message:new", onNewMessage);
    socket.on("conversation:new", onConvNew);
    socket.on("conversation:queue", onQueue);

    return () => {
      socket.off("message:new", onNewMessage);
      socket.off("conversation:new", onConvNew);
      socket.off("conversation:queue", onQueue);
      if (repeatRef.current) clearInterval(repeatRef.current);
    };
  }, [socket, getPrefs]);
}

// ── Main Layout ──────────────────────────────────────────────────
export default function Layout() {
  const agent           = useChatStore(s => s.agent);
  const connectSocket   = useChatStore(s => s.connectSocket);
  const socketConnected = useChatStore(s => s.socketConnected);
  const logout          = useChatStore(s => s.logout);
  const unreadCounts    = useChatStore(s => s.unreadCounts);
  const navigate        = useNavigate();

  const [userMenuOpen,  setUserMenuOpen]  = useState(false);
  const [collapsed,     setCollapsed]     = useState(false);
  const [notifOpen,     setNotifOpen]     = useState(false);

  const profileRef = useRef(null);
  const API_BASE = import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";

  useNotifications();

  useEffect(() => {
    connectSocket();
    if (agent?.id) {
      api.get(`/agents/${agent.id}`).then(({ data }) => {
        if (data?.permissions) {
          let p = data.permissions;
          if (typeof p === "string") p = p.replace(/[{}]/g, "").split(",").map(s => s.trim()).filter(Boolean);
          const ua = { ...agent, permissions: p };
          localStorage.setItem("vlc_agent", JSON.stringify(ua));
          useChatStore.setState({ agent: ua });
        }
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    function outside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) setUserMenuOpen(false);
    }
    if (userMenuOpen) document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [userMenuOpen]);

  const conversations   = useChatStore(s => s.conversations);
  const activeConvs     = conversations.filter(c => c.status !== "resolved");
  const totalUnread     = activeConvs.reduce((sum, c) => sum + (unreadCounts[c.id] || 0), 0);

  function parsePerms(perms) {
    let arr = [];
    if (Array.isArray(perms)) arr = perms;
    else if (typeof perms === "string") arr = perms.replace(/[{}]/g, "").split(",").map(s => s.trim()).filter(Boolean);
    return [...new Set(arr)];
  }

  const agentPerms = parsePerms(agent?.permissions);
  const visibleNav = navItems.filter(item => {
    // superadmin sees everything
    if (agent?.role === "superadmin") return true;
    // superadmin-only items hidden for all others
    if (item.superadminOnly) return false;
    // for admin/supervisor/agent: rely strictly on permissions array from DB
    return agentPerms.includes(item.perm);
  });

  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  function handleLogoutClick() {
    setUserMenuOpen(false);
    setLogoutConfirmOpen(true);
  }

  function handleConfirmLogout() {
    setLogoutConfirmOpen(false);
    logout();
    navigate("/login");
  }

  const notifPrefs = loadPrefs();
  const notifActive = Notification.permission === "granted" && notifPrefs.sound_enabled;

  return (
    <div className="flex h-full relative overflow-hidden bg-slate-950">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className={`relative ${collapsed ? "w-16" : "w-16 lg:w-56"} flex flex-col bg-slate-900 border-r border-slate-800 flex-shrink-0 transition-all duration-200 z-30 select-none`}>

        {/* Collapse handle */}
        <div onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-1/2 -translate-y-1/2 z-40 hidden lg:flex items-center justify-center w-6 h-12 cursor-pointer group"
          title={collapsed ? "Buka Sidebar" : "Kecilkan Sidebar"}>
          <div className="w-5 h-8 bg-slate-800 hover:bg-vlc-600 border border-slate-700 hover:border-vlc-500 rounded-full flex items-center justify-center text-slate-400 hover:text-white shadow-lg transition-all duration-200 group-hover:scale-110">
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </div>
        </div>

        {/* Logo */}
        <div className="h-16 flex items-center px-3 border-b border-slate-800 flex-shrink-0">
          {collapsed ? (
            <img src="/vlivechat-favicon-512x512.png" alt="vlivechat" className="w-9 h-9 object-contain rounded-lg shadow-md" />
          ) : (
            <div className="flex items-center gap-2">
              <img src="/vlivechat-logo-400x100.png" alt="vlivechat" className="hidden lg:block h-8 object-contain" />
              <img src="/vlivechat-favicon-512x512.png" alt="vlivechat" className="block lg:hidden w-8 h-8 object-contain rounded-lg shadow-md" />
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 flex flex-col gap-1 px-2">
          {visibleNav.map(item => {
            const IconComp = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end={item.to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 text-sm font-medium
                   ${isActive ? "bg-vlc-600 text-white shadow-md font-semibold" : "text-slate-400 hover:text-white hover:bg-slate-800/80"}`
                }>
                <IconComp className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="hidden lg:block truncate">{item.label}</span>}
                {!collapsed && item.to === "/chats" && totalUnread > 0 && (
                  <span className="hidden lg:flex ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 items-center justify-center font-bold shadow">
                    {totalUnread > 9 ? "9+" : totalUnread}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* 🔔 Notification Bell */}
        <div className="px-2 pb-1">
          <button onClick={() => setNotifOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-all relative"
            title="Notification Preferences">
            <span className="flex-shrink-0 relative">
              <Bell className="w-5 h-5" />
              <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-900 ${notifActive ? "bg-emerald-400" : "bg-slate-600"}`} />
            </span>
            {!collapsed && <span className="hidden lg:block text-sm font-medium">Notifikasi</span>}
          </button>
        </div>

        {/* Agent Profile */}
        <div ref={profileRef} className="p-2 border-t border-slate-800 flex-shrink-0 relative">
          {userMenuOpen && (
            <div className="absolute bottom-14 left-2 lg:left-3 bg-slate-900 border border-slate-700/80 rounded-2xl p-3 shadow-2xl z-50 w-56 text-xs animate-fade-in">
              <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-800 mb-2">
                <Avatar src={agent?.avatar_url} name={agent?.display_name || agent?.name} bg={agent?.avatar_bg} size="w-9 h-9" />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-white truncate text-sm">{agent?.display_name || agent?.name}</div>
                  <div className="text-indigo-400 text-[11px] font-semibold capitalize">{agent?.role}</div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-emerald-400 font-semibold mb-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>{socketConnected ? "Online & Terhubung" : "Offline"}</span>
              </div>

              <button onClick={() => { setUserMenuOpen(false); navigate("/settings"); }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-slate-300 hover:bg-slate-800 text-left transition-colors mb-1 font-medium">
                <SettingsIcon className="w-4 h-4 text-slate-400" /> Pengaturan Profil
              </button>

              <button onClick={handleLogoutClick}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-red-400 hover:bg-red-500/10 text-left transition-colors font-bold">
                <LogOut className="w-4 h-4" /> Keluar / Logout
              </button>
            </div>
          )}

          <button onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-slate-800/80 transition-colors text-left group">
            <div className="relative flex-shrink-0">
              <Avatar src={agent?.avatar_url} name={agent?.display_name || agent?.name} bg={agent?.avatar_bg} size="w-8 h-8" />
              <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${socketConnected ? "bg-emerald-400" : "bg-slate-500"}`} />
            </div>
            {!collapsed && (
              <div className="hidden lg:block min-w-0 flex-1">
                <div className="text-xs font-semibold text-white truncate group-hover:text-vlc-400 transition-colors">
                  {agent?.display_name || agent?.name}
                </div>
                <div className="text-[11px] text-slate-400 capitalize">{agent?.role}</div>
              </div>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 relative overflow-hidden bg-slate-950">
        <Outlet />
      </main>

      {/* Notification Preferences Modal */}
      <NotificationPrefsModal open={notifOpen} onClose={() => setNotifOpen(false)} />

      {/* Sleek Logout Confirmation Modal */}
      <ConfirmModal
        isOpen={logoutConfirmOpen}
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={handleConfirmLogout}
        title="Konfirmasi Keluar"
        message="Apakah Anda yakin ingin keluar dari dashboard vLiveChat?"
        confirmText="Ya, Keluar"
        cancelText="Batal"
        confirmVariant="danger"
        icon="🚪"
      />
    </div>
  );
}


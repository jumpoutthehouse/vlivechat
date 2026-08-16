import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import useChatStore from "../store/chatStore";
import api from "../api";
import toast from "react-hot-toast";

export default function Login() {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [showPass, setShowPass] = useState(false);
  const setAuth   = useChatStore(s => s.setAuth);
  const navigate  = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    if (!email || !password) { toast.error("Email dan password wajib diisi"); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setAuth(data.agent, data.token);
      toast.success(`Selamat datang, ${data.agent.name}! 👋`);
      navigate("/");
    } catch (err) {
      toast.error(err.response?.data?.error || "Login gagal");
    } finally {
      setLoading(false);
    }
  }

  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [devResetLink, setDevResetLink] = useState("");

  async function handleForgot(e) {
    e.preventDefault();
    if (!forgotEmail) { toast.error("Masukkan email Anda"); return; }
    setForgotLoading(true);
    setDevResetLink("");
    try {
      const { data } = await api.post("/auth/forgot-password", { email: forgotEmail });
      toast.success(data.message);
      if (data.resetLink) setDevResetLink(data.resetLink);
    } catch (err) {
      toast.error(err.response?.data?.error || "Gagal mengirimkan instruksi reset");
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      {/* Background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-vlc-900 via-slate-950 to-slate-950 pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(30,58,95,0.3),transparent_60%)] pointer-events-none" />

      <div className="relative w-full max-w-md animate-bounce-in">
        {/* Card */}
        <div className="card p-8">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <img
              src="/vlivechat-favicon-512x512.png"
              alt="vlivechat logo"
              className="w-12 h-12 rounded-xl object-contain shadow-lg shadow-vlc-500/20 border border-slate-700/60 p-1 bg-slate-900/60"
            />
            <div>
              <div className="text-xl font-black text-white tracking-wide">vlivechat</div>
              <div className="text-xs text-slate-400">Admin Dashboard</div>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">Selamat Datang 👋</h1>
          <p className="text-slate-400 text-sm mb-8">Masuk untuk mengelola percakapan pelanggan Anda.</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="input" placeholder="email@domain.com"
                autoFocus required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Password</label>
                <button type="button" onClick={() => { setForgotEmail(email); setShowForgotModal(true); }}
                  className="text-xs text-vlc-400 hover:text-vlc-300 font-semibold transition-colors">
                  Lupa Password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                  className="input pr-10" placeholder="••••••••"
                  required
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-2 text-sm">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block"></span>
                  Masuk...
                </span>
              ) : "Masuk ke Dashboard"}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-800/80 text-center">
            <p className="text-xs text-slate-500 font-medium tracking-wide">
              © 2026 LiveChat Management Console · Secure &amp; Protected
            </p>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-fade-in relative">
            <button onClick={() => setShowForgotModal(false)} className="absolute right-4 top-4 text-slate-400 hover:text-white text-lg">✕</button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-vlc-600/20 border border-vlc-500/30 flex items-center justify-center text-xl">🔑</div>
              <div>
                <h3 className="text-lg font-bold text-white">Reset Password</h3>
                <p className="text-xs text-slate-400">Instruksi akan dikirimkan ke email terdaftar Anda</p>
              </div>
            </div>

            <form onSubmit={handleForgot} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Email Terdaftar</label>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  className="input"
                  placeholder="admin@domain.com"
                  required
                />
              </div>

              {devResetLink && (
                <div className="bg-vlc-900/40 border border-vlc-500/40 rounded-xl p-3 text-xs text-vlc-200 break-all">
                  <div className="font-bold text-white mb-1">🔗 Dev Quick Reset Link:</div>
                  <a href={devResetLink} target="_blank" rel="noopener noreferrer" className="underline text-vlc-400 hover:text-vlc-300">
                    {devResetLink}
                  </a>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForgotModal(false)} className="btn-secondary text-xs py-2 px-4">Batal</button>
                <button type="submit" disabled={forgotLoading} className="btn-primary text-xs py-2 px-4 font-bold">
                  {forgotLoading ? "Kirim..." : "Kirim Link Reset"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

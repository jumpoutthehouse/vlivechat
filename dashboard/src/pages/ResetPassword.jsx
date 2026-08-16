import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import api from "../api";
import toast from "react-hot-toast";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleReset(e) {
    e.preventDefault();
    if (!token) {
      toast.error("Token reset password tidak ditemukan.");
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      toast.error("Password minimal 8 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Konfirmasi password tidak cocok.");
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post("/auth/reset-password", { token, newPassword });
      toast.success(data.message || "Password berhasil diubah! Silakan login.");
      setSuccess(true);
      setTimeout(() => navigate("/login"), 3000);
    } catch (err) {
      toast.error(err.response?.data?.error || "Gagal mereset password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-gradient-to-br from-vlc-900 via-slate-950 to-slate-950 pointer-events-none" />

      <div className="relative w-full max-w-md">
        <div className="card p-8">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-12 h-12 bg-vlc-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg">V</div>
            <div>
              <div className="text-xl font-black text-white">vlivechat</div>
              <div className="text-xs text-slate-400">Reset Password</div>
            </div>
          </div>

          {success ? (
            <div className="text-center py-6">
              <div className="text-5xl mb-4">✅</div>
              <h2 className="text-xl font-bold text-white mb-2">Password Berhasil Diperbarui!</h2>
              <p className="text-slate-400 text-sm mb-6">Anda akan dialihkan ke halaman login dalam 3 detik...</p>
              <Link to="/login" className="btn-primary inline-block py-2 px-6 text-sm">
                Ke Halaman Login Sekarang
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-white mb-2">Atur Password Baru 🔑</h1>
              <p className="text-slate-400 text-sm mb-6">Masukkan kata sandi baru untuk akun Anda.</p>

              {!token ? (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm text-center">
                  ⚠️ Link reset password tidak valid atau tidak memiliki token. Silakan minta tautan baru.
                  <div className="mt-4">
                    <Link to="/login" className="btn-secondary text-xs inline-block">Kembali ke Login</Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleReset} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Password Baru</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="input"
                      placeholder="Minimal 8 karakter..."
                      required
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Konfirmasi Password Baru</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="input"
                      placeholder="Ulangi password baru..."
                      required
                    />
                  </div>

                  <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 text-sm mt-2">
                    {loading ? "Memproses..." : "Simpan Password Baru"}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

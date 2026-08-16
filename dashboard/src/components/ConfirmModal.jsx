export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Konfirmasi Tindakan",
  message = "Apakah Anda yakin ingin melanjutkan?",
  confirmText = "Ya, Lanjutkan",
  cancelText = "Batal",
  confirmVariant = "danger", // "danger" | "primary"
  icon = "⚠️",
  loading = false,
}) {
  if (!isOpen) return null;

  const btnBg = confirmVariant === "danger"
    ? "bg-red-600 hover:bg-red-500 border-red-500/40 text-white shadow-red-900/30"
    : "bg-vlc-600 hover:bg-vlc-500 border-vlc-500/40 text-white shadow-vlc-900/30";

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && !loading && onClose()}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl w-full max-w-sm text-center space-y-4 animate-bounce-in">
        <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-2xl mx-auto shadow-inner">
          {icon}
        </div>

        <div className="space-y-1.5">
          <h3 className="font-bold text-lg text-white tracking-tight">{title}</h3>
          <p className="text-xs text-slate-400 leading-relaxed px-2">{message}</p>
        </div>

        <div className="flex gap-2.5 pt-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 ${btnBg}`}
          >
            {loading ? "Memproses..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

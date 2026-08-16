import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-950 text-slate-300 min-h-[400px]">
          <div className="w-16 h-16 rounded-full bg-red-950/60 border border-red-500/30 flex items-center justify-center text-3xl mb-4 shadow-lg text-red-400">
            ⚠️
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Terjadi Kesalahan Tampilan</h2>
          <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
            Terjadi kendala saat memuat komponen ini ({this.state.error?.message || "Render error"}).
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="px-5 py-2.5 bg-vlc-600 hover:bg-vlc-500 text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-2"
          >
            <span>🔄</span> Muat Ulang Halaman
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

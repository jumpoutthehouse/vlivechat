import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

export default function BrandSwitcherDropdown({ workspaces = [], selectedId, onSelect, label = "Lihat Brand" }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  const selected = workspaces.find(w => w.id === selectedId);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!workspaces || workspaces.length === 0) return null;

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/80 rounded-xl text-xs font-semibold text-white transition-all group shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
      >
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-2 ring-slate-900 shadow-sm"
          style={{ backgroundColor: selected?.brand_color || "#a855f7" }}
        />
        <span className="max-w-[150px] truncate">{selected ? (selected.brand_name || selected.name) : "🌐 Semua Brand"}</span>
        
        {selected && parseInt(selected.active_conversations, 10) > 0 && (
          <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            {selected.active_conversations}
          </span>
        )}

        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-transform duration-200 ${open ? "rotate-180 text-purple-400" : ""}`} />
      </button>

      {/* Popover Dropdown Menu */}
      {open && (
        <div className="absolute left-0 mt-1.5 w-64 bg-slate-900/95 border border-slate-700/90 rounded-2xl shadow-2xl shadow-black/80 z-50 overflow-hidden backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3 py-2 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Daftar Brand ({workspaces.length})</span>
            <span className="text-[10px] text-slate-500 font-normal">Pilih untuk beralih</span>
          </div>

          <div className="p-1.5 max-h-72 overflow-y-auto space-y-0.5 custom-scrollbar">
            {/* Option: Semua Brand (Choose Brand) */}
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all text-left group ${
                !selectedId
                  ? "bg-purple-600/20 text-white font-semibold border border-purple-500/40 shadow-sm"
                  : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-purple-500 ring-1 ring-white/20" />
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">🌐 Semua Brand</div>
                <div className="text-[10px] text-slate-500 font-mono truncate">Tampilkan seluruh brand</div>
              </div>
              {!selectedId && <Check className="w-4 h-4 text-purple-400 flex-shrink-0 ml-1" />}
            </button>

            <div className="my-1 border-t border-slate-800/80" />

            {workspaces.map(ws => {
              const isSelected = selectedId === ws.id;
              const activeCount = parseInt(ws.active_conversations, 10) || 0;

              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => {
                    onSelect(ws.id);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all text-left group ${
                    isSelected
                      ? "bg-purple-600/20 text-white font-semibold border border-purple-500/40 shadow-sm"
                      : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-white/20"
                    style={{ backgroundColor: ws.brand_color || "#6366f1" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{ws.brand_name || ws.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono truncate">{ws.code}</div>
                  </div>

                  {activeCount > 0 && (
                    <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">
                      {activeCount} aktif
                    </span>
                  )}

                  {isSelected && (
                    <Check className="w-4 h-4 text-purple-400 flex-shrink-0 ml-1" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import {
  Globe,
  Laptop,
  MapPin,
  Tag,
  FileText,
  Clock,
  MessageSquare,
  UserX,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";
import api from "../api";
import toast from "react-hot-toast";

function safeFormat(dateVal, fmtStr, fallback = "—") {
  if (!dateVal) return fallback;
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return fallback;
    return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return fallback;
  }
}

function parseUA(uaStr) {
  if (!uaStr) return { os: "Windows 10/11", browser: "Chrome (120.0.0)", ua: "" };
  
  let os = "Windows / PC";
  if (/android/i.test(uaStr)) {
    const match = uaStr.match(/android\s+([\d.]+)/i);
    os = `Android${match ? ` (${match[1]})` : ""}`;
  } else if (/iphone|ipad|ipod/i.test(uaStr)) {
    const match = uaStr.match(/os\s+([\d_]+)/i);
    os = `iOS${match ? ` (${match[1].replace(/_/g, ".")})` : ""}`;
  } else if (/mac os x/i.test(uaStr)) {
    os = "macOS";
  } else if (/windows/i.test(uaStr)) {
    if (/nt 10.0/i.test(uaStr)) os = "Windows 10/11";
    else os = "Windows";
  } else if (/linux/i.test(uaStr)) {
    os = "Linux";
  }

  let browser = "Chrome";
  if (/edg\/([\d.]+)/i.test(uaStr)) {
    const match = uaStr.match(/edg\/([\d.]+)/i);
    browser = `Edge (${match[1]})`;
  } else if (/chrome\/([\d.]+)/i.test(uaStr)) {
    const match = uaStr.match(/chrome\/([\d.]+)/i);
    browser = `Chrome (${match[1]})`;
  } else if (/firefox\/([\d.]+)/i.test(uaStr)) {
    const match = uaStr.match(/firefox\/([\d.]+)/i);
    browser = `Firefox (${match[1]})`;
  } else if (/safari\/([\d.]+)/i.test(uaStr) && !/chrome/i.test(uaStr)) {
    const match = uaStr.match(/version\/([\d.]+)/i);
    browser = `Safari${match ? ` (${match[1]})` : ""}`;
  }

  return { os, browser, ua: uaStr };
}

function InfoRow({ label, value, isUrl }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-2 py-1 border-b border-slate-800/40 last:border-0">
      <span className="text-slate-400 font-medium text-xs flex-shrink-0 w-24">{label}</span>
      {isUrl ? (
        <a href={value} target="_blank" rel="noopener" className="text-blue-400 text-xs truncate hover:underline font-mono">
          {value}
        </a>
      ) : (
        <span className="text-slate-200 text-xs font-medium text-right truncate">{value}</span>
      )}
    </div>
  );
}

export default function VisitorInfoPanel({ convDetail, tags = [], setTags, onBlockVisitor, onUnblockVisitor, isBlocked, onViewAllChats }) {
  const [tagInput, setTagInput] = useState("");

  if (!convDetail) return null;

  const visitorName = convDetail.visitor_name || convDetail.visitor_id || "Pengunjung";
  const visitorId   = convDetail.visitor_id || "—";
  const vCity       = convDetail.visitor_city || "Jakarta";
  const vCountry    = convDetail.visitor_country || "ID";
  const vIsp        = convDetail.visitor_isp || "Localhost Network";
  const vLat        = parseFloat(convDetail.visitor_lat || -6.2088);
  const vLon        = parseFloat(convDetail.visitor_lon || 106.8456);
  const vUa         = convDetail.visitor_ua || "";
  const vTech       = parseUA(vUa);

  let preData = convDetail.prechat_data;
  if (typeof preData === "string") {
    try { preData = JSON.parse(preData); } catch {}
  }

  async function handleAddTag() {
    if (!tagInput.trim() || !convDetail.id) return;
    const newTags = [...new Set([...tags, tagInput.trim()])];
    if (setTags) setTags(newTags);
    setTagInput("");
    try {
      await api.patch(`/conversations/${convDetail.id}/tags`, { tags: newTags });
    } catch {}
  }

  async function handleRemoveTag(tagToRemove) {
    if (!convDetail.id) return;
    const newTags = tags.filter(t => t !== tagToRemove);
    if (setTags) setTags(newTags);
    try {
      await api.patch(`/conversations/${convDetail.id}/tags`, { tags: newTags });
    } catch {}
  }

  return (
    <div className="w-80 border-l border-slate-800 p-4 flex flex-col gap-5 overflow-y-auto bg-slate-900 flex-shrink-0 animate-fade-in text-xs">
      {/* ── Visitor Avatar Header ────────────────────────────────── */}
      <div className="flex flex-col items-center text-center pb-4 border-b border-slate-800">
        <div className="w-16 h-16 rounded-full bg-vlc-800 border-2 border-vlc-500/40 flex items-center justify-center text-white text-2xl font-bold mb-2 shadow-lg">
          {visitorName.charAt(0).toUpperCase()}
        </div>
        <h2 className="font-bold text-white text-base truncate w-full px-2">
          {visitorName}
        </h2>
        {(() => {
          if (!Array.isArray(convDetail?.previous_names) || convDetail.previous_names.length === 0) return null;
          const uniqueNames = [...new Set(convDetail.previous_names.map(n => (n || "").trim()))]
            .filter(n => n && n !== visitorName);
          if (uniqueNames.length === 0) return null;

          const displayNames = uniqueNames.slice(0, 2);
          const extraCount = uniqueNames.length - displayNames.length;
          const fullListStr = uniqueNames.join(", ");

          return (
            <span
              title={`Semua Alias: ${fullListStr}`}
              className="text-[11px] text-amber-300 font-semibold mt-1 bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 rounded-xl shadow-sm flex items-center gap-1 max-w-full flex-wrap justify-center text-center cursor-help"
            >
              <Tag className="w-3 h-3 text-amber-400 flex-shrink-0" />
              <span>Alias: {displayNames.join(", ")}{extraCount > 0 ? ` (+${extraCount} lainnya)` : ""}</span>
            </span>
          );
        })()}
        <span className="text-[11px] font-mono text-slate-400 mt-1 bg-slate-950 px-2.5 py-0.5 rounded-full border border-slate-800">
          ID: {visitorId}
        </span>

        {/* View All Chats Button */}
        {onViewAllChats && (
          <button
            onClick={() => onViewAllChats(visitorId, visitorName)}
            className="w-full mt-2.5 py-2 px-3 rounded-xl bg-vlc-600/20 hover:bg-vlc-600/30 border border-vlc-500/40 text-vlc-300 font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-1.5"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>View All Chats</span>
          </button>
        )}

        {/* Block / Unblock Visitor Button */}
        {(onBlockVisitor || onUnblockVisitor) && (
          <div className="mt-2 w-full">
            {isBlocked ? (
              <button
                onClick={onUnblockVisitor}
                className="w-full py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Buka Blokir Visitor</span>
              </button>
            ) : (
              <button
                onClick={onBlockVisitor}
                className="w-full py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-1.5"
              >
                <UserX className="w-3.5 h-3.5 text-red-400" />
                <span>Blokir Visitor (Spammer)</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── INFO VISITOR & IP ─────────────────────────────────────── */}
      <div>
        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5 text-vlc-400" />
          <span>INFO VISITOR & IP</span>
        </h3>
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1.5">
          <InfoRow label="ID Visitor" value={visitorId} />
          <InfoRow label="Nama Utama" value={visitorName} />
          <InfoRow label="IP Address" value={convDetail.visitor_ip || "Localhost"} />
          <InfoRow label="Lokasi" value={`${vCity}, ${vCountry}`} />
          <InfoRow label="ISP" value={vIsp} />
          <InfoRow label="Halaman Asal" value={convDetail.page_url} isUrl />
          <InfoRow label="Dibuat" value={safeFormat(convDetail.created_at, "dd MMM HH:mm")} />
        </div>
      </div>

      {/* ── INFORMASI TEKNOLOGI ───────────────────────────────────── */}
      <div>
        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Laptop className="w-3.5 h-3.5 text-vlc-400" />
          <span>INFORMASI TEKNOLOGI</span>
        </h3>
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1.5">
          <InfoRow label="Sistem OS" value={vTech.os} />
          <InfoRow label="Browser" value={vTech.browser} />
          <InfoRow label="Resolusi" value={convDetail.screen_res || "1920×1080"} />
          <InfoRow label="Bahasa" value={convDetail.language || "id-ID"} />
          
          {vUa && (
            <div className="mt-2 pt-2 border-t border-slate-800/80">
              <span className="text-slate-500 block mb-1 text-[10px] font-medium">User-Agent String:</span>
              <div className="bg-slate-900 border border-slate-800/80 rounded-lg p-2 text-[10px] text-slate-400 font-mono break-all leading-tight max-h-20 overflow-y-auto">
                {vUa}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── PETA LOKASI VISITOR ───────────────────────────────────── */}
      <div>
        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-vlc-400" />
          <span>PETA LOKASI VISITOR</span>
        </h3>
        <div className="rounded-xl overflow-hidden border border-slate-800 h-36 bg-slate-950 shadow-inner relative">
          <iframe
            title="visitor-location-map"
            width="100%"
            height="100%"
            frameBorder="0"
            scrolling="no"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${vLon - 0.04}%2C${vLat - 0.04}%2C${vLon + 0.04}%2C${vLat + 0.04}&layer=mapnik&marker=${vLat}%2C${vLon}`}
          />
        </div>
        <div className="text-[10px] text-slate-500 text-center mt-1 font-mono">
          Lat: {vLat.toFixed(4)}, Lon: {vLon.toFixed(4)}
        </div>
      </div>

      {/* ── TAG ───────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Tag className="w-3.5 h-3.5 text-vlc-400" />
          <span>TAG</span>
        </h3>
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
          <div className="flex flex-wrap gap-1.5 min-h-[24px]">
            {tags.length === 0 ? (
              <span className="text-slate-600 text-xs italic">Belum ada tag</span>
            ) : (
              tags.map(t => (
                <span key={t} className="bg-vlc-600/30 border border-vlc-500/40 text-vlc-200 text-xs px-2.5 py-0.5 rounded-full flex items-center gap-1 font-medium">
                  {t}
                  <button onClick={() => handleRemoveTag(t)} className="text-vlc-400 hover:text-red-400 font-bold ml-1">✕</button>
                </span>
              ))
            )}
          </div>
          <div className="flex gap-1.5 pt-1">
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAddTag()}
              placeholder="Tambah tag..."
              className="flex-1 bg-slate-900 border border-slate-800 text-xs text-white rounded-lg px-2.5 py-1 outline-none focus:border-vlc-500"
            />
            <button
              onClick={handleAddTag}
              className="bg-vlc-600 hover:bg-vlc-500 text-white font-bold text-xs px-3 py-1 rounded-lg transition-all"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* ── DATA PRE-CHAT ─────────────────────────────────────────── */}
      {preData && Object.keys(preData).length > 0 && (
        <div>
          <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-vlc-400" />
            <span>DATA PRE-CHAT</span>
          </h3>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1.5">
            {Object.entries(preData).map(([k, v]) => (
              <InfoRow key={k} label={k} value={String(v)} />
            ))}
          </div>
        </div>
      )}

      {/* ── INFORMASI SLA ─────────────────────────────────────────── */}
      <div>
        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-vlc-400" />
          <span>INFORMASI SLA</span>
        </h3>
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1.5">
          <InfoRow label="First Msg" value={safeFormat(convDetail.first_message_at, "HH:mm")} />
          <InfoRow label="First Reply" value={safeFormat(convDetail.first_response_at, "HH:mm", "Belum")} />
          {convDetail.first_message_at && convDetail.first_response_at && (
            <InfoRow
              label="Durasi FRT"
              value={`${Math.max(1, Math.round((new Date(convDetail.first_response_at) - new Date(convDetail.first_message_at)) / 60000))} menit`}
            />
          )}
        </div>
      </div>
    </div>
  );
}

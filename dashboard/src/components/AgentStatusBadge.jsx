export default function AgentStatusBadge({ status }) {
  const map = {
    online:  { dot: "bg-emerald-400", label: "Online" },
    away:    { dot: "bg-yellow-400",  label: "Away" },
    busy:    { dot: "bg-red-400",     label: "Busy" },
    offline: { dot: "bg-slate-500",   label: "Offline" },
  };
  const s = map[status] || map.offline;
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${s.dot}`} />
      <span className="text-xs text-slate-400">{s.label}</span>
    </div>
  );
}

import React, { useState } from "react";
import { getFileUrl } from "../api";

export default function Avatar({ src, name, bg, size = "w-9 h-9", textClass = "text-xs", className = "" }) {
  const [imgError, setImgError] = useState(false);
  const initial = (name || "A").charAt(0).toUpperCase();

  if (src && !imgError) {
    return (
      <img
        src={getFileUrl(src)}
        alt={name || "avatar"}
        className={`${size} rounded-full object-cover ${className}`}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className={`${size} rounded-full flex items-center justify-center text-white font-bold ${textClass} flex-shrink-0 shadow-sm border border-slate-700 ${className}`}
      style={{ background: bg || "#4F46E5" }}
    >
      {initial}
    </div>
  );
}

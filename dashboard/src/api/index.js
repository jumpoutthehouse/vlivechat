import axios from "axios";

const defaultBackend = window.location.hostname === "localhost" ? "http://localhost:3001" : "https://vlivechat-backend.onrender.com";
const socketBaseUrl = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL?.replace(/\/api\/v1\/?$/, "") || defaultBackend;
const apiBaseUrl = import.meta.env.VITE_API_URL || `${socketBaseUrl}/api/v1`;

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("vlc_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes("/auth/login")) {
      localStorage.removeItem("vlc_token");
      localStorage.removeItem("vlc_agent");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export function getFileUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url;
  return `${socketBaseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
}

export default api;

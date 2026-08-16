import { Routes, Route, Navigate } from "react-router-dom";
import useChatStore from "./store/chatStore";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import ArchivesDashboard from "./pages/ArchivesDashboard";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Agents from "./pages/Agents";
import Superadmin from "./pages/Superadmin";
import ResetPassword from "./pages/ResetPassword";
import Layout from "./components/Layout";
import ErrorBoundary from "./components/ErrorBoundary";

function PrivateRoute({ children, roles, perm }) {
  const agent = useChatStore(s => s.agent);
  const token = useChatStore(s => s.token);
  if (!token || !agent) return <Navigate to="/login" replace />;

  if (roles && !roles.includes(agent.role)) {
    const perms = Array.isArray(agent.permissions) ? agent.permissions : ["livechat"];
    if (!perm || !perms.includes(perm)) {
      return <Navigate to="/home" replace />;
    }
  }
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route path="/" element={
        <PrivateRoute>
          <Layout />
        </PrivateRoute>
      }>
        <Route index element={<Home />} />
        <Route path="home" element={<Home />} />
        <Route path="chats" element={<Dashboard />} />
        <Route path="chats/:conversationId" element={<Dashboard />} />
        <Route path="archives" element={<ArchivesDashboard />} />
        <Route path="archives/:conversationId" element={<ArchivesDashboard />} />
        <Route path="reports" element={
          <PrivateRoute roles={["superadmin","admin","supervisor"]} perm="reports">
            <Reports />
          </PrivateRoute>
        } />
        <Route path="agents" element={
          <PrivateRoute roles={["superadmin","admin"]} perm="agents">
            <Agents />
          </PrivateRoute>
        } />
        <Route path="settings" element={
          <PrivateRoute roles={["superadmin","admin"]} perm="settings">
            <Settings />
          </PrivateRoute>
        } />
        <Route path="superadmin" element={
          <PrivateRoute roles={["superadmin"]}>
            <Superadmin />
          </PrivateRoute>
        } />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

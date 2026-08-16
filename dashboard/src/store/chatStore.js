import { create } from "zustand";
import { io } from "socket.io-client";
import api from "../api";

const defaultBackend = typeof window !== "undefined" && window.location.hostname === "localhost" ? "http://localhost:3001" : "https://vlivechat-backend.onrender.com";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL?.replace(/\/api\/v1\/?$/, "") || defaultBackend;

const useChatStore = create((set, get) => ({
  // ── Auth ─────────────────────────────────────────────────────
  agent: JSON.parse(localStorage.getItem("vlc_agent") || "null"),
  token: localStorage.getItem("vlc_token") || null,

  setAuth: (agent, token) => {
    localStorage.setItem("vlc_token", token);
    localStorage.setItem("vlc_agent", JSON.stringify(agent));
    set({ agent, token });
  },
  updateAgentProfile: (data) => {
    set(s => {
      const newAgent = { ...s.agent, ...data };
      localStorage.setItem("vlc_agent", JSON.stringify(newAgent));
      return { agent: newAgent };
    });
  },
  logout: () => {
    api.post("/auth/logout").catch(() => {});
    localStorage.removeItem("vlc_token");
    localStorage.removeItem("vlc_agent");
    get().socket?.disconnect();
    set({ agent: null, token: null, socket: null, conversations: [], activeConvId: null });
  },

  // ── Socket ────────────────────────────────────────────────────
  socket: null,
  connectSocket: () => {
    const { token, socket: existing } = get();
    if (existing?.connected) return;
    if (!token) return;

    const socket = io(SOCKET_URL + "/dashboard", {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 2000,
    });

    socket.on("connect", () => {
      console.log("[vlc-dashboard] Socket connected:", socket.id);
      set({ socketConnected: true });
    });

    socket.on("disconnect", () => {
      set({ socketConnected: false });
    });

    // ── Incoming events ─────────────────────────────────────────
    socket.on("conversation:new", ({ conversation }) => {
      get().addConversation(conversation);
      get().playNotification();
    });

    socket.on("conversation:activity", ({ conversationId, preview, visitorName }) => {
      get().updateConversationPreview(conversationId, preview, visitorName);
    });

    socket.on("conversation:update", (data) => {
      if (!data) return;
      const targetId = data.id || data.conversationId;
      set(s => {
        const updateObj = (c) => ({
          ...c,
          visitor_name: data.visitorName || data.visitor_name || c.visitor_name,
          prechat_data: data.prechatData || data.prechat_data || c.prechat_data,
          status: data.status !== undefined ? data.status : c.status,
          is_blocked: data.is_blocked !== undefined ? data.is_blocked : c.is_blocked,
          flow_mode: data.flow_mode !== undefined ? data.flow_mode : (data.mode !== undefined ? data.mode : c.flow_mode),
          assigned_agent_id: data.assigned_agent_id !== undefined ? data.assigned_agent_id : c.assigned_agent_id,
        });

        const isMatch = (c) => c && (c.id === targetId || (data.visitor_id && c.visitor_id === data.visitor_id));

        return {
          activeConversation: isMatch(s.activeConversation) ? updateObj(s.activeConversation) : s.activeConversation,
          conversations: s.conversations.map(c => isMatch(c) ? updateObj(c) : c),
        };
      });
    });

    socket.on("conversation:flow_update", (data) => {
      if (!data) return;
      const targetId = data.conversationId || data.id;
      const newMode = data.mode || data.flow_mode;
      const newStatus = data.status;

      set(s => {
        const updateObj = (c) => ({
          ...c,
          flow_mode: newMode || c.flow_mode,
          status: newStatus !== undefined ? newStatus : (newMode === "agent" && c.status === "open" ? "open" : c.status),
        });

        const isMatch = (c) => c && (c.id === targetId || (data.visitor_id && c.visitor_id === data.visitor_id));

        return {
          activeConversation: isMatch(s.activeConversation) ? updateObj(s.activeConversation) : s.activeConversation,
          conversations: s.conversations.map(c => isMatch(c) ? updateObj(c) : c),
        };
      });
    });

    socket.on("conversation:resolved", ({ conversationId }) => {
      get().updateConversationStatus(conversationId, "resolved");
      get().clearUnread(conversationId);
    });

    socket.on("conversation:assigned", ({ conversationId, agentId }) => {
      get().updateConversationAgent(conversationId, agentId);
    });

    socket.on("conversation:transferred", ({ conversationId, toAgentId, message }) => {
      get().updateConversationAgent(conversationId, toAgentId);
      if (conversationId === get().activeConvId) {
        if (message) get().addMessage(message);
      }
    });

    socket.on("visitor:message", ({ conversationId, message }) => {
      const activeConvId = get().activeConvId;
      const conversations = get().conversations;
      const activeObj = conversations.find(c => c.id === activeConvId || c.visitor_id === activeConvId);

      const isCurrentActive = activeConvId && (
        conversationId === activeConvId ||
        (activeObj && (activeObj.id === conversationId || activeObj.visitor_id === conversationId))
      );

      if (isCurrentActive) {
        get().addMessage(message);
        get().clearUnread(conversationId);
        if (activeObj) {
          get().clearUnread(activeObj.id);
          get().clearUnread(activeObj.visitor_id);
        }
      } else {
        get().incrementUnread(conversationId);
      }
    });

    socket.on("visitor:typing", ({ conversationId, typing }) => {
      if (conversationId === get().activeConvId) {
        set({ visitorTyping: typing });
      }
    });

    // Read receipts from visitor
    socket.on("visitor:read_receipt", ({ conversationId, upToMessageId }) => {
      if (conversationId === get().activeConvId) {
        get().markMessagesReadByVisitor(upToMessageId);
      }
    });

    socket.on("agent:message", ({ conversationId, message }) => {
      if (conversationId === get().activeConvId) {
        get().addMessage(message);
      }
    });

    socket.on("message:sent", ({ messageId, clientId }) => {
      get().confirmMessage(clientId, messageId);
    });

    socket.on("agent:online",  ({ agentId, agentName }) => get().setAgentOnline(agentId, true));
    socket.on("agent:offline", ({ agentId }) => get().setAgentOnline(agentId, false));
    socket.on("agent:status_changed", ({ agentId, status }) => get().setAgentStatus(agentId, status));

    socket.on("sla:missed", ({ conversations }) => {
      conversations.forEach(c => get().updateConversationStatus(c.id, "missed"));
    });

    // ── Real-time permissions update ─────────────────────────────
    socket.on("agent:permissions_updated", ({ agentId, permissions, role, is_active }) => {
      const currentAgent = get().agent;
      if (currentAgent && currentAgent.id === agentId) {
        // Parse permissions array from PostgreSQL format if needed
        let parsedPerms = permissions;
        if (typeof permissions === "string") {
          parsedPerms = permissions.replace(/[{}]/g, "").split(",").map(s => s.trim()).filter(Boolean);
        }
        const updatedAgent = {
          ...currentAgent,
          permissions: Array.isArray(parsedPerms) ? parsedPerms : currentAgent.permissions,
          role: role || currentAgent.role,
          is_active: is_active !== undefined ? is_active : currentAgent.is_active,
        };
        localStorage.setItem("vlc_agent", JSON.stringify(updatedAgent));
        set({ agent: updatedAgent });
      }
    });

    socket.on("canned:results", ({ results }) => {
      set({ cannedResults: results });
    });

    socket.on("db:cleared", ({ workspaceId, affectedConversations, clearedBy }) => {
      // Remove cleared conversations from list
      const { agent } = get();
      if (!workspaceId || workspaceId === agent?.workspace_id) {
        set(s => ({
          conversations: s.conversations.filter(c => c.workspace_id !== workspaceId),
          messages: workspaceId === s.agent?.workspace_id ? [] : s.messages,
          activeConvId: null,
        }));
      }
    });

    set({ socket });
  },

  socketConnected: false,

  // ── Conversations ─────────────────────────────────────────────
  conversations: [],
  activeConvId: null,
  messages: [],
  visitorTyping: false,
  unreadCounts: {},
  cannedResults: [],

  // Selected workspace for superadmin brand switcher (persisted in localStorage)
  selectedWorkspaceId: localStorage.getItem("vlc_selected_ws") || null,
  setSelectedWorkspace: (wsId) => {
    if (wsId) localStorage.setItem("vlc_selected_ws", wsId);
    else localStorage.removeItem("vlc_selected_ws");
    set({ selectedWorkspaceId: wsId, conversations: [], activeConvId: null, messages: [], unreadCounts: {} });
  },

  loadConversations: async (params = {}) => {
    try {
      const { agent, selectedWorkspaceId } = get();
      // For superadmin: always inject selectedWorkspaceId into query
      const finalParams = { ...params };
      if (agent?.role === "superadmin" && selectedWorkspaceId) {
        finalParams.workspace_id = selectedWorkspaceId;
      }
      const { data } = await api.get("/conversations", { params: finalParams });
      const fetchedConvs = data.conversations || [];
      const currentActiveId = get().activeConvId;

      set(s => {
        const activeObj = s.conversations.find(c => c.id === currentActiveId);
        let merged = [...fetchedConvs];
        if (activeObj && !merged.some(c => c.id === currentActiveId)) {
          if (!selectedWorkspaceId || activeObj.workspace_id === selectedWorkspaceId) {
            merged.push(activeObj);
          }
        }
        return { conversations: merged };
      });
      return data;
    } catch (err) {
      console.error("loadConversations:", err);
    }
  },

  setActiveConvId: (convId) => set({ activeConvId: convId, convSelectionToken: Date.now() }),
  setActiveConv: (convId) => set({ activeConvId: convId, convSelectionToken: Date.now() }),

  selectConversation: async (convId) => {
    const { socket, conversations } = get();
    set({ activeConvId: convId, messages: [], visitorTyping: false, convSelectionToken: Date.now() });

    // Join room
    socket?.emit("agent:join_conversation", { conversationId: convId });

    // Clear unread
    set(s => ({ unreadCounts: { ...s.unreadCounts, [convId]: 0 } }));

    // Ensure conversation exists in store list
    let targetConv = conversations.find(c => c.id === convId);
    if (!targetConv) {
      try {
        const { data: singleConv } = await api.get(`/conversations/${convId}`);
        if (singleConv && singleConv.id) {
          get().addConversation(singleConv);
          targetConv = singleConv;
        }
      } catch (e) {
        console.error("fetchSingleConvDetails:", e);
      }
    }

    // Load messages
    try {
      const { data } = await api.get(`/conversations/${convId}/messages`);
      const msgList = Array.isArray(data) ? data : [];
      
      let finalMsgs = msgList;
      if (targetConv?.created_at) {
        const hasStarted = msgList.some(m => m.sender_type === "system" && m.text?.startsWith("Started -"));
        if (!hasStarted) {
          const d = new Date(targetConv.created_at);
          const now = new Date();
          const isToday = d.toDateString() === now.toDateString();
          const timeStr = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
          const headerText = isToday
            ? `Started - Today ${timeStr}`
            : `Started - ${d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })} ${timeStr}`;
          
          finalMsgs = [{ is_internal: false, sender_type: "system", text: headerText }, ...msgList];
        }
      }
      
      set({ messages: finalMsgs });

      // Mark last message as read
      const lastMsg = msgList.filter(m => m.sender_type === "visitor").at(-1);
      if (lastMsg) {
        socket?.emit("agent:read", { conversationId: convId, upToMessageId: lastMsg.id });
        api.post(`/conversations/${convId}/read`, { lastMessageId: lastMsg.id }).catch(() => {});
      }
    } catch (err) {
      console.error("loadMessages:", err);
    }

    return targetConv;
  },

  addConversation: (conv) => {
    const { agent, selectedWorkspaceId } = get();
    if (agent?.role === "superadmin" && selectedWorkspaceId && conv?.workspace_id && conv.workspace_id !== selectedWorkspaceId) {
      return; // Do not push incoming conversation from another brand when superadmin is filtering a specific brand
    }
    set(s => {
      const exists = s.conversations.find(c => c.id === conv.id);
      if (exists) return s;
      return { conversations: [conv, ...s.conversations] };
    });
  },

  clearUnread: (convId) => {
    set(s => {
      const newUnreads = { ...s.unreadCounts };
      delete newUnreads[convId];
      return { unreadCounts: newUnreads };
    });
  },

  updateConversationStatus: (convId, status) => {
    set(s => {
      const newUnreads = { ...s.unreadCounts };
      if (status === "resolved") {
        delete newUnreads[convId];
      }
      return {
        conversations: s.conversations.map(c =>
          c.id === convId ? { ...c, status } : c
        ),
        unreadCounts: newUnreads,
      };
    });
  },

  updateConversationAgent: (convId, agentId) => {
    set(s => ({
      conversations: s.conversations.map(c =>
        c.id === convId ? { ...c, assigned_agent_id: agentId } : c
      ),
    }));
  },

  updateConversationPreview: (convId, preview, visitorName) => {
    set(s => ({
      conversations: s.conversations.map(c =>
        c.id === convId
          ? { ...c, last_message: preview, last_message_at: new Date().toISOString(), visitor_name: visitorName || c.visitor_name }
          : c
      ),
    }));
  },

  incrementUnread: (convId) => {
    const { activeConvId, conversations } = get();
    const activeObj = conversations.find(c => c.id === activeConvId || c.visitor_id === activeConvId);
    const isCurrentActive = activeConvId && (
      convId === activeConvId ||
      (activeObj && (activeObj.id === convId || activeObj.visitor_id === convId))
    );

    if (isCurrentActive) return;

    set(s => ({
      unreadCounts: { ...s.unreadCounts, [convId]: (s.unreadCounts[convId] || 0) + 1 },
    }));
  },

  // ── Messages ──────────────────────────────────────────────────
  addMessage: (msg) => {
    set(s => {
      // 1. Check if message with same ID already exists
      if (msg.id && s.messages.some(m => m.id === msg.id)) {
        return s;
      }

      // 2. Check if message with same client_id exists (optimistic update replacement)
      if (msg.client_id && s.messages.some(m => m.client_id === msg.client_id)) {
        return {
          messages: s.messages.map(m =>
            m.client_id === msg.client_id
              ? { ...msg, id: msg.id || m.id, _sending: false, _confirmed: true }
              : m
          ),
        };
      }

      // 3. Otherwise append new message
      return { messages: [...s.messages, msg] };
    });
  },

  confirmMessage: (clientId, messageId) => {
    set(s => ({
      messages: s.messages.map(m =>
        m.client_id === clientId ? { ...m, id: messageId, _sending: false, _confirmed: true } : m
      ),
    }));
  },

  markMessagesReadByVisitor: (upToMessageId) => {
    set(s => {
      // Find index of the target message
      const targetIdx = upToMessageId
        ? s.messages.findIndex(m => m.id === upToMessageId)
        : s.messages.length - 1;

      return {
        messages: s.messages.map((m, i) => {
          if (m.sender_type !== "agent" || m.is_internal) return m;
          if (!upToMessageId || i <= targetIdx) {
            return { ...m, read_at: m.read_at || new Date().toISOString() };
          }
          return m;
        }),
      };
    });
  },

  sendMessage: (conversationId, text, isInternal = false) => {
    const { socket, agent } = get();
    if (!socket || !text?.trim()) return;
    const clientId = "cli_" + Date.now();
    const tempMsg = {
      id: null,
      client_id: clientId,
      conversation_id: conversationId,
      sender_type: "agent",
      sender_id: agent?.id,
      sender_name: agent?.name,
      sender_display_name: agent?.display_name || agent?.name,
      sender_avatar: agent?.avatar_url,
      text: text.trim(),
      is_internal: isInternal,
      created_at: new Date().toISOString(),
      _sending: true,
    };
    get().addMessage(tempMsg);
    socket.emit("agent:message", { conversationId, text, isInternal, clientId });
  },

  // ── Agents ────────────────────────────────────────────────────
  onlineAgents: {},
  setAgentOnline: (agentId, isOnline) => {
    set(s => ({ onlineAgents: { ...s.onlineAgents, [agentId]: isOnline } }));
  },
  setAgentStatus: (agentId, status) => {
    set(s => ({ onlineAgents: { ...s.onlineAgents, [agentId + "_status"]: status } }));
  },

  // ── Notifications ─────────────────────────────────────────────
  notifSound: null,
  playNotification: () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.5, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      o.start(ctx.currentTime);
      o.stop(ctx.currentTime + 0.4);
    } catch {}
    // Desktop notification
    if (Notification.permission === "granted") {
      new Notification("vlivechat — Chat Baru", {
        body: "Ada percakapan baru masuk",
        icon: "/vite.svg",
      });
    }
  },
}));

export default useChatStore;

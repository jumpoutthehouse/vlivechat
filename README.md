# vlivechat — Platform LiveChat Custom (SaaS Multi-Tenant)

> Platform LiveChat profesional berbasis Node.js + React, mirip Chatuvi/LiveChat Official.
> Mendukung multi-workspace, flow template, read receipts dua arah, avatar agent, dan superadmin panel.

---

## 🏗️ Arsitektur

```
Livechat-New/
├── backend/          # Node.js + Express + Socket.io + PostgreSQL + Redis
├── dashboard/        # React + Vite + TailwindCSS (admin panel)
├── widget/           # Vanilla JS widget (embed + direct URL)
├── start-all.bat     # Script untuk jalankan semua sekaligus
└── README.md
```

---

## 🚀 Cara Setup (Windows)

### Langkah 1 — Install PostgreSQL & Redis

PostgreSQL 17 dan Memurai (Redis) sudah diinstall via winget.

Jika belum, jalankan:
```cmd
winget install --id PostgreSQL.PostgreSQL.17 --accept-package-agreements
winget install --id Memurai.MemuraiDeveloper --accept-package-agreements
```

### Langkah 2 — Setup Database

Jalankan script ini **sekali saja** untuk membuat database dan user:
```cmd
cd backend
setup-db.bat
```

Atau manual via psql:
```sql
CREATE USER vlcuser WITH PASSWORD 'vlcpassword123';
CREATE DATABASE vlivechat OWNER vlcuser;
GRANT ALL PRIVILEGES ON DATABASE vlivechat TO vlcuser;
```

Lalu jalankan migrasi:
```cmd
cd backend
node src/db/migrate.js
```

### Langkah 3 — Jalankan Semua Service

```cmd
start-all.bat
```

Atau manual di terminal terpisah:
```cmd
# Terminal 1 — Backend
cd backend
node src/app.js

# Terminal 2 — Dashboard
cd dashboard
npx vite --port 5173

# Terminal 3 — Widget (static server)
cd widget
npx serve . -p 3000
```

---

## 🌐 URL Akses

| Service   | URL |
|-----------|-----|
| Backend API | http://localhost:3001/api/v1 |
| Admin Dashboard | http://localhost:5173 |
| Widget (embed demo) | http://localhost:3000/demo.html |
| Widget (direct URL) | http://localhost:3000/livechat-widget.html?w=demo_workspace&apiBase=http://localhost:3001 |

---

## 🔐 Default Login

| Role | Email | Password |
|------|-------|----------|
| **Superadmin** | superadmin@vlivechat.com | SuperAdmin@2024! |
| **Admin Demo** | admin@demo.com | Admin@2024! |

---

## 📋 Cara Embed Widget di Website

Tambahkan kode ini sebelum `</body>`:

```html
<!-- vlivechat Widget -->
<script>
  window.VLiveChat = {
    workspace: 'demo_workspace',      // Workspace code dari Settings
    apiBase:   'http://localhost:3001', // URL backend Anda
  };
</script>
<script src="http://localhost:3000/widget/widget.js" async></script>
```

---

## ✨ Fitur Utama

### Widget (Visitor Side)
- 🎨 Branding custom per workspace (warna, logo, nama)
- 📋 Pre-chat form (username, email, dll)
- 🌳 Flow template dengan button options (Chatuvi-style)
- 💬 Mode agen (chat langsung dengan CS)
- ✓✓ Read receipts dua arah (biru = sudah dibaca)
- 📎 Upload file & gambar
- ⌨️ Typing indicator agent
- ⭐ Post-chat survey (rating, satisfied, resolved)
- 📱 Responsive + embed mode
- 🔔 Unread badge di toggle button

### Dashboard (Admin Side)
- 💬 Live chat panel dengan real-time messages
- ✓✓ Read receipts (visitor sudah baca pesan agent)
- 👤 Avatar agent (upload foto profil)
- 🔄 Transfer chat antar agent
- 📝 Internal notes (tidak terlihat visitor)
- 💡 Canned responses (ketik `/` untuk shortcut)
- 🏷️ Tag conversation
- 📋 Info visitor + halaman asal
- 📊 SLA tracking (First Response Time)
- 🔔 Desktop notification + sound
- 🟢 Status agent (online/away/busy/offline)

### Laporan
- 📈 Volume chat per hari (bar chart)
- ⚡ SLA compliance pie chart
- 👥 Performa per agent (avg FRT, rating)
- ⭐ Rating breakdown
- 📅 Filter periode (hari/minggu/bulan/tahun)

### Superadmin
- 🏢 Kelola semua workspace
- 🗑️ **Clear database** dengan filter:
  - Per workspace
  - Per tanggal (from/to)
  - Per status (resolved/missed/open)
  - Preview sebelum hapus
  - Double confirmation
- 📋 Audit log semua aksi
- 📊 Platform-wide statistics

---

## 🔌 Socket.io Events

### Namespace `/livechat` (Widget → Backend)
| Event | Payload | Keterangan |
|-------|---------|------------|
| `visitor:prechat` | `{name, data}` | Submit form pre-chat |
| `visitor:message` | `{text, clientId}` | Kirim pesan |
| `visitor:typing` | `{typing}` | Indikator mengetik |
| `visitor:read` | `{lastMessageId}` | Tandai pesan agent sudah dibaca |
| `visitor:rating` | `{satisfaction, resolved, rating, comment}` | Submit rating |
| `visitor:end` | — | Akhiri chat |
| `flow:progress` | `{data, log, mode}` | Update flow state |

### Namespace `/dashboard` (Agent → Backend)
| Event | Payload | Keterangan |
|-------|---------|------------|
| `agent:join_conversation` | `{conversationId}` | Join room conversation |
| `agent:message` | `{conversationId, text, isInternal}` | Kirim pesan |
| `agent:typing` | `{conversationId, typing}` | Indikator mengetik |
| `agent:read` | `{conversationId, upToMessageId}` | Tandai sudah baca (→ visitor ✓✓ biru) |
| `agent:resolve` | `{conversationId}` | Selesaikan chat |
| `agent:transfer` | `{conversationId, toAgentId, note}` | Transfer ke agent lain |
| `agent:status` | `{status}` | Ganti status (online/away/busy/offline) |
| `agent:canned_search` | `{query}` | Cari canned response |

---

## 🗄️ Database Schema (ringkas)

```
workspaces        — Tenant/brand (code, brand_color, flow_config, sla_*)
agents            — CS agents (avatar_url, display_name, role, is_online)  
conversations     — Percakapan (visitor_id, status, sla tracking, rating)
messages          — Pesan (sender_type, is_internal, file_url, read_at)
agent_read_cursors — Agent sudah baca sampai pesan mana
visitor_read_cursors — Visitor sudah baca sampai pesan mana
canned_responses  — Template jawaban cepat
audit_logs        — Log aksi superadmin (clear DB dll)
```

---

## ⚙️ Konfigurasi Flow Template

Flow template dikonfigurasi sebagai JSON di kolom `workspaces.flow_config`.

Contoh struktur node:
```json
{
  "nodes": [
    {
      "id": "main",
      "type": "menu",
      "message": "Halo! Ada yang bisa kami bantu?",
      "options": [
        { "id": "info", "label": "ℹ️ Informasi Produk", "next": "node_info" },
        { "id": "cs",   "label": "👤 Hubungi CS",       "next": "node_connect" }
      ]
    },
    {
      "id": "node_connect",
      "type": "connect",
      "message": "Menghubungkan Anda dengan CS..."
    }
  ]
}
```

**Tipe node:**
- `menu` — Tampilkan pilihan button
- `input` — Input teks bebas dari visitor
- `summary` — Tampilkan ringkasan data terkumpul
- `connect` — Switch ke mode agent (chat langsung)

---

## 📁 Struktur File Backend

```
backend/src/
├── app.js              # Entry point + Socket.io setup
├── redis.js            # Redis client + helper functions
├── db/
│   ├── index.js        # PostgreSQL connection pool
│   └── migrate.js      # Schema migration + seeding
├── middleware/
│   └── auth.js         # JWT auth + role middleware
├── routes/
│   ├── auth.js         # Login, logout, change-password
│   ├── agents.js       # CRUD agent + avatar upload
│   ├── workspaces.js   # CRUD workspace (superadmin)
│   ├── conversations.js# CRUD chat + read, resolve, tags
│   ├── messages.js     # Send + file upload messages
│   ├── canned.js       # Canned responses CRUD
│   ├── reports.js      # SLA analytics + laporan
│   ├── superadmin.js   # Platform stats + clear DB
│   └── public.js       # Widget settings (no auth)
├── socket/
│   ├── visitor.js      # Socket namespace /livechat
│   └── dashboard.js    # Socket namespace /dashboard
├── services/
│   └── sla.service.js  # Cron job miss detection
└── utils/
    └── logger.js       # Winston logger
```

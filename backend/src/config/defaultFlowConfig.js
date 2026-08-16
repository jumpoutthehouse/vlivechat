/**
 * defaultFlowConfig — Template chatbot generik untuk semua brand.
 * Tidak ada nama brand spesifik. Bisa langsung dipakai atau diedit per workspace.
 */
function defaultFlowConfig() {
  return {
    greeting: "Halo! Ada yang bisa kami bantu? Silakan pilih menu berikut:",
    nodes: [
      {
        id: "main",
        type: "menu",
        message: "Halo! Ada yang bisa kami bantu? Silakan pilih menu berikut:",
        options: [
          { id: "account",  label: "🎰 Kendala Akun",        next: "account_menu" },
          { id: "payment",  label: "💸 Kendala Pembayaran",   next: "payment_menu" },
          { id: "bonus",    label: "🎁 Claim Bonus",          next: "bonus_menu"   },
          { id: "app",      label: "📱 Aplikasi",             next: "app_menu"     },
          { id: "link",     label: "🚀 Link Alternatif",      next: "link_info"    },
          { id: "cs",       label: "📞 Hubungi CS",           next: "connect_agent"},
        ],
      },
      {
        id: "account_menu",
        type: "menu",
        message: "Silakan pilih kendala akun Anda:",
        options: [
          { id: "forgot_id",   label: "Lupa ID / Username", next: "collect_name"   },
          { id: "forgot_pass", label: "Lupa Password",       next: "collect_name"   },
          { id: "other_acc",   label: "Kendala Lainnya",     next: "connect_agent"  },
          { id: "back_main",   label: "↩ Kembali",           next: "main"           },
        ],
      },
      {
        id: "collect_name",
        type: "input",
        message: "Baik! Silakan masukkan **Nama Rekening** Anda:",
        field: "nama_rekening",
        next: "collect_account",
      },
      {
        id: "collect_account",
        type: "input",
        message: "Selanjutnya, masukkan **Nomor Rekening** Anda:",
        field: "nomor_rekening",
        next: "collect_bank",
      },
      {
        id: "collect_bank",
        type: "input",
        message: "Ketik **Jenis Rekening** Anda. Contoh : BCA, BRI, Dana, dll 👇",
        field: "jenis_rekening",
        next: "summary",
      },
      {
        id: "summary",
        type: "summary",
        message: "Terima kasih! Berikut ringkasan data Anda:",
        next: "connect_agent",
      },
      {
        id: "payment_menu",
        type: "menu",
        message: "Pilih jenis kendala pembayaran:",
        options: [
          { id: "deposit",   label: "Deposit",             next: "connect_agent" },
          { id: "withdraw",  label: "Withdraw / WD",       next: "connect_agent" },
          { id: "reject",    label: "Request Ditolak",     next: "connect_agent" },
          { id: "back_main", label: "↩ Kembali",           next: "main"          },
        ],
      },
      {
        id: "bonus_menu",
        type: "menu",
        message: "Pilih jenis bonus yang ingin di-claim:",
        options: [
          { id: "rebate",     label: "Rebate",              next: "connect_agent" },
          { id: "new_member", label: "Bonus New Member",    next: "connect_agent" },
          { id: "daily",      label: "Everyday Deposit",    next: "connect_agent" },
          { id: "share_wd",   label: "Share WD",            next: "connect_agent" },
          { id: "back_main",  label: "↩ Kembali",           next: "main"          },
        ],
      },
      {
        id: "app_menu",
        type: "info",
        message: "📱 **Download Aplikasi**\n\nUnduh aplikasi terbaru kami di:\n👉 [Klik di sini untuk download APK](#)\n\nSetelah download, claim bonus download Anda!",
        options: [
          { id: "claim_dl",  label: "Claim Bonus Download", next: "connect_agent" },
          { id: "back_main", label: "↩ Kembali",            next: "main"          },
        ],
      },
      {
        id: "link_info",
        type: "info",
        message: "🚀 **Link Alternatif Anti-Blokir**\n\nGunakan link alternatif berikut jika website utama tidak bisa diakses:\n• [Link 1](#)\n• [Link 2](#)\n• [Link 3](#)",
        options: [
          { id: "back_main", label: "↩ Kembali", next: "main" },
        ],
      },
      {
        id: "connect_agent",
        type: "connect",
        message: "Baik! Menghubungkan Anda dengan tim Customer Service kami…\n\nSilakan ketik pesan Anda.",
      },
    ],
  };
}

module.exports = defaultFlowConfig;

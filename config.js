// ═══════════════════════════════════════════════════
//              CRAZY VOL1  —  CONFIG
// ═══════════════════════════════════════════════════

require("dotenv").config()

module.exports = {
  // ── Identité du bot ──────────────────────────────
  BOT_NAME:    "𝐂𝐑𝐀𝐙𝐘 𝐕𝐎𝐋𝟏",
  BOT_VERSION: "1.0.0",
  BOT_TAG:     "𝖢𝖱𝖤𝖠𝖳𝖤𝖣 𝖡𝖸 𝖢𝖱𝖠𝖹𝖸 🎶",

  // ── Owner (numéro complet sans + ni espace) ──────
  OWNER_NUMBER: (process.env.OWNER_NUMBER || "242000000000").split(","),
  OWNER_NAME:   process.env.OWNER_NAME || "Crazy",

  // ── Préfixe des commandes ─────────────────────────
  PREFIX: process.env.PREFIX || ".",

  // ── Mode du bot : public | private ────────────────
  MODE: process.env.MODE || "public",

  // ── Méthode de connexion : qr | code ───────────────
  // qr   → scanner un QR code au lancement
  // code → recevoir un code à 8 caractères (PairCode)
  CONNECTION_METHOD: (process.env.CONNECTION_METHOD || "qr").toLowerCase(),

  
  AUTO_READ:        true,
  AUTO_TYPING:       true,
  AUTO_REACT:        true,
  AUTO_STATUS_READ:  false,
 
  ANTI_SPAM:  true,
  SPAM_DELAY: 3000,

  LOGO_URL:    process.env.LOGO_URL    || "https://files.catbox.moe/btqmt0.jpg",
  CHANNEL_URL: process.env.CHANNEL_URL || "",

  DB_PATH:      "./database/crazy.json",
  SESSION_PATH: "./session",
  TEMP_DIR:     "./temp",
}

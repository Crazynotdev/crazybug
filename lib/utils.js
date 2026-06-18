// ═══════════════════════════════════════════════════
//              CRAZY VOL1  —  UTILS
// ═══════════════════════════════════════════════════
// Toutes les fonctions utilitaires du bot regroupées
// dans un seul fichier (auth, médias, formatage...).
// ═══════════════════════════════════════════════════

const NodeCache = require("node-cache")
const config    = require("../config")

const groupCache = new NodeCache({ stdTTL: 600, checkperiod: 180, useClones: false })

// ── JID ───────────────────────────────────────────
function normalizeJid(jid) {
  if (!jid) return ""
  return jid.split(":")[0].split("@")[0]
}

// ── Métadonnées de groupe (avec cache) ────────────
async function getGroupMetadataSafe(sock, chatId) {
  const cached = groupCache.get(chatId)
  if (cached) return cached
  try {
    const meta = await sock.groupMetadata(chatId)
    if (meta) groupCache.set(chatId, meta)
    return meta
  } catch {
    return null
  }
}

// ── Admin check ───────────────────────────────────
async function isAdmin(sock, chatId, userJid) {
  if (!chatId.endsWith("@g.us")) return false
  try {
    const meta = await getGroupMetadataSafe(sock, chatId)
    if (!meta?.participants) return false
    const p = meta.participants.find(p => normalizeJid(p.id) === normalizeJid(userJid))
    return !!(p && (p.admin === "admin" || p.admin === "superadmin"))
  } catch {
    return false
  }
}

// ── Owner check ───────────────────────────────────
function isOwnerNumber(senderNum) {
  return config.OWNER_NUMBER.some(o => normalizeJid(o) === senderNum)
}

// ── Type de média d'un message ────────────────────
function getMediaType(m) {
  if (!m) return "unknown"
  if (m.conversation || m.extendedTextMessage) return "text"
  if (m.imageMessage)        return "image"
  if (m.videoMessage)        return "video"
  if (m.audioMessage)        return "audio"
  if (m.stickerMessage)      return "sticker"
  if (m.documentMessage)     return "document"
  if (m.contactMessage)      return "contact"
  if (m.locationMessage)     return "location"
  if (m.pollCreationMessage) return "poll"
  return "unknown"
}

// ── Uptime lisible ────────────────────────────────
function formatUptime(ms) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  return `${d}j ${h % 24}h ${m % 60}m ${s % 60}s`
}

// ── Résoudre la cible d'une commande (mention / reply / soi-même) ──
function resolveTarget(msg, sender) {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid
  const quoted    = msg.message?.extendedTextMessage?.contextInfo?.participant
  if (mentioned?.length) return mentioned[0]
  if (quoted)            return quoted
  return sender
}

// ── Récupérer les JID mentionnés dans un message ──
function getMentioned(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
}

module.exports = {
  normalizeJid,
  getGroupMetadataSafe,
  isAdmin,
  isOwnerNumber,
  getMediaType,
  formatUptime,
  resolveTarget,
  getMentioned,
}

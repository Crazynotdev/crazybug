const moment = require("moment")
const config = require("./config")
const logger = require("./lib/logger")
const { getUser, updateUser, banUser, unbanUser, getGroup, updateGroup, getStats, incrementCmds } = require("./database/db")
const {
  normalizeJid, isAdmin, isOwnerNumber,
  getMediaType, formatUptime, resolveTarget, getMentioned
} = require("./lib/utils")

// ─────────────────────────────────────────────────
// Liste des commandes affichée dans le menu.
// Ajoutée manuellement — chaque entrée correspond à
// un (ou plusieurs) "case" du switch plus bas.
// ─────────────────────────────────────────────────
const MENU = {
  "🌍 Général": [
    ["menu", "help", "aide"],
    ["ping", "speed"],
    ["uptime", "runtime"],
    ["script", "repo"],
  ],
  "🎮 Fun": [
    ["8ball", "boule"],
    ["dice", "de"],
    ["flip", "pile"],
    ["quote", "citation"],
    ["calc", "calcul"],
    ["choisir", "choose"],
    ["verite", "truth"],
    ["defi", "dare"],
  ],
  "👤 Profil": [
    ["pp", "avatar"],
    ["info", "userinfo"],
    ["bio", "status"],
  ],
  "👥 Groupe": [
    ["kick"], ["promote"], ["demote"],
    ["mute"], ["unmute"],
    ["antilink"], ["welcome"], ["goodbye"],
    ["ginfo"], ["tagall"], ["hidetag"],
    ["setname"], ["setdesc"],
    ["getlink"], ["revoke"],
    ["admins"], ["poll"],
  ],
  "👑 Owner": [
    ["ban"], ["unban"], ["bc"],
    ["stats"], ["mode"], ["setprefix"],
  ],
}

// ─────────────────────────────────────────────────
//                MESSAGE HANDLER
// ─────────────────────────────────────────────────
async function handleMessage(sock, m) {
  try {
    const message = m.messages[0]
    if (!message || !message.message) return

    const chatId  = message.key.remoteJid
    const fromMe  = message.key.fromMe
    const isGroup = chatId.endsWith("@g.us")

    let sender
    if (fromMe) {
      sender = sock.user.id.split(":")[0] + "@s.whatsapp.net"
    } else {
      sender = isGroup ? (message.key.participant || message.participant) : chatId
    }

    const pushName  = message.pushName || ""
    const senderNum = normalizeJid(sender)

    const body =
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text ||
      message.message?.imageMessage?.caption ||
      message.message?.videoMessage?.caption || ""

    if (fromMe && !message.message?.conversation && !message.message?.extendedTextMessage) return

    if (config.AUTO_READ) {
      await sock.readMessages([message.key]).catch(() => {})
    }

    const mediaType = getMediaType(message.message)
    if (mediaType !== "text" && mediaType !== "unknown") {
      logger.media(sender, mediaType, chatId, pushName)
    } else if (body && !body.startsWith(config.PREFIX)) {
      logger.msg(sender, chatId, body, "text", pushName)
    }

    if (!body.startsWith(config.PREFIX)) return

    const args = body.slice(config.PREFIX.length).trim().split(/ +/)
    const cmd  = args.shift()?.toLowerCase()
    if (!cmd) return

    logger.cmd(sender, cmd, args, chatId, pushName)

    const isOwner = fromMe || isOwnerNumber(senderNum)

    // ── Ban check ──────────────────────────────────
    const user = await getUser(senderNum)
    if (user?.banned) {
      logger.ban(sender, "tentative (banni)")
      return sock.sendMessage(chatId, { text: "🚫 Tu es banni d'utiliser *CRAZY VOL1*." }, { quoted: message })
    }

    // ── Mode privé ─────────────────────────────────
    if (config.MODE === "private" && !isOwner) return

    // ── Admin check (groupes) ─────────────────────
    let isUserAdmin = false
    let isBotAdmin  = false
    if (isGroup) {
      isUserAdmin = await isAdmin(sock, chatId, sender)
      isBotAdmin  = await isAdmin(sock, chatId, sock.user.id)
    }

    // ── Contexte transmis à chaque case ───────────
    const ctx = {
      sock, msg: message, jid: chatId, sender, senderNum, pushName,
      args, body, isOwner, isUserAdmin, isBotAdmin, isGroup,
      prefix: config.PREFIX,
      reply: (text) => sock.sendMessage(chatId, { text }, { quoted: message }),
      react: (emoji) => sock.sendMessage(chatId, { react: { text: emoji, key: message.key } }).catch(() => {}),
    }

    if (config.AUTO_REACT) await ctx.react("⏳")

    // ─────────────────────────────────────────────
    //          🔀 LE SWITCH / CASE PRINCIPAL
    // ─────────────────────────────────────────────
    switch (cmd) {

      // ═══════════════ GÉNÉRAL ═══════════════════
      case "menu":
      case "help":
      case "aide": {
        const now    = moment().format("DD/MM/YYYY • HH:mm")
        const uptime = formatUptime(process.uptime() * 1000)
        let text = `『 🌍 *${config.BOT_NAME}* 』\n\n`
        text += `*╭───〔 👤 USER INFO 〕───┈⊷*\n`
        text += `│ 🌿 Nom : ${pushName || "Utilisateur"}\n`
        text += `│ 🌀 Préfixe : ${config.PREFIX}\n`
        text += `│ ⏳ Uptime : ${uptime}\n`
        text += `│ 📅 Date : ${now}\n`
        text += `╰────────────────┈⊷\n\n`
        for (const [cat, cmds] of Object.entries(MENU)) {
          if (cat === "👑 Owner" && !isOwner) continue
          text += `*┏━━〔 ${cat} 〕*\n`
          for (const names of cmds) {
            text += `┃ ❍ ${config.PREFIX}${names[0]}\n`
          }
          text += `┗━━━━━━━━━━━━┛\n\n`
        }
        text += `> *${config.BOT_NAME}* ✨\n> _${config.BOT_TAG}_`
        await sock.sendMessage(chatId, {
          image: { url: config.LOGO_URL },
          caption: text
        }, { quoted: message })
        break
      }

      case "ping":
      case "speed": {
        const start = Date.now()
        const ms = Date.now() - start
        await ctx.reply(
          `*╭───〔 ⚡ PING 〕───┈⊷*\n` +
          `│ 🏓 Latence : ${ms}ms\n` +
          `╰────────────────┈⊷\n` +
          `> _${config.BOT_TAG}_`
        )
        break
      }

      case "uptime":
      case "runtime": {
        const uptime = formatUptime(process.uptime() * 1000)
        const ram = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)
        await ctx.reply(
          `*╭───〔 ⏱️ UPTIME 〕───┈⊷*\n` +
          `│ 🕐 Online : ${uptime}\n` +
          `│ 🧠 RAM : ${ram} MB\n` +
          `│ ⚙️ Node : ${process.version}\n` +
          `╰────────────────┈⊷\n` +
          `> _${config.BOT_TAG}_`
        )
        break
      }

      case "script":
      case "repo": {
        await sock.sendMessage(chatId, {
          image: { url: config.LOGO_URL },
          caption:
            `『 🌍 *${config.BOT_NAME}* 』\n\n` +
            `*╭───〔 📜 SCRIPT 〕───┈⊷*\n` +
            `│ 🤖 Nom : ${config.BOT_NAME}\n` +
            `│ 👨‍💻 Dev : Crazy\n` +
            `│ 🌿 Version : ${config.BOT_VERSION}\n` +
            `│ ⚙️ Lang : Node.js\n` +
            `╰────────────────┈⊷\n\n` +
            `> _${config.BOT_TAG}_`
        }, { quoted: message })
        break
      }

      // ═══════════════ FUN ════════════════════════
      case "8ball":
      case "boule": {
        const responses = [
          "🟢 Oui, absolument !", "🟢 C'est certain.", "🟢 Sans aucun doute.",
          "🟡 Peut-être...", "🟡 Repose la question plus tard.",
          "🔴 Non, définitivement.", "🔴 Ne compte pas là-dessus."
        ]
        if (!args.length) { await ctx.reply("❓ Pose une question ! Ex: `.8ball Suis-je beau ?`"); break }
        const answer = responses[Math.floor(Math.random() * responses.length)]
        await ctx.reply(`🎱 *8Ball*\n\n❓ *${args.join(" ")}*\n\n${answer}`)
        break
      }

      case "dice":
      case "de": {
        const faces = parseInt(args[0]) || 6
        if (faces < 2 || faces > 100) { await ctx.reply("❌ Entre un nombre de faces entre 2 et 100."); break }
        const result = Math.floor(Math.random() * faces) + 1
        await ctx.reply(`🎲 Tu as lancé un *d${faces}* → *${result}*`)
        break
      }

      case "flip":
      case "pile": {
        const result = Math.random() < 0.5 ? "🪙 *PILE*" : "🪙 *FACE*"
        await ctx.reply(result)
        break
      }

      case "quote":
      case "citation": {
        const quotes = [
          ["La vie c'est comme une bicyclette, il faut avancer pour ne pas perdre l'équilibre.", "Albert Einstein"],
          ["Le succès c'est tomber sept fois et se relever huit.", "Proverbe japonais"],
          ["Sois le changement que tu veux voir dans le monde.", "Gandhi"],
          ["N'attends pas. Le moment ne sera jamais parfait.", "Napoléon Hill"],
          ["Chaque expert a d'abord été un débutant.", "Proverbe"],
        ]
        const [text, author] = quotes[Math.floor(Math.random() * quotes.length)]
        await ctx.reply(`💬 _"${text}"_\n\n— *${author}*`)
        break
      }

      case "calc":
      case "calcul": {
        const expr = args.join(" ").replace(/[^0-9+\-*/.() ]/g, "")
        if (!expr) { await ctx.reply("❌ Donne une expression. Ex: `.calc 5 * 8 + 2`"); break }
        try {
          const result = Function(`"use strict"; return (${expr})`)()
          await ctx.reply(`🧮 *${expr}* = *${result}*`)
        } catch {
          await ctx.reply("❌ Expression invalide.")
        }
        break
      }

      case "choisir":
      case "choose": {
        const options = args.join(" ").split("|").map(o => o.trim()).filter(Boolean)
        if (options.length < 2) { await ctx.reply("❌ Donne au moins 2 options séparées par `|`\nEx: `.choisir Pizza | Burger | Tacos`"); break }
        const chosen = options[Math.floor(Math.random() * options.length)]
        await ctx.reply(`🎯 J'ai choisi : *${chosen}*`)
        break
      }

      case "verite":
      case "truth": {
        const questions = [
          "Quelle est ta plus grande peur ?", "Quel est ton plus grand regret ?",
          "As-tu déjà menti à ton meilleur ami ?", "Quelle est la chose la plus folle que tu aies jamais faite ?",
          "Quel est ton rêve secret ?"
        ]
        await ctx.reply(`💭 *Vérité :*\n\n_${questions[Math.floor(Math.random() * questions.length)]}_`)
        break
      }

      case "defi":
      case "dare": {
        const dares = [
          "Envoie un selfie ridicule dans le groupe !", "Imite quelqu'un du groupe pendant 1 minute.",
          "Chante 10 secondes de ta chanson préférée en vocal !", "Raconte une blague (bonne ou mauvaise) !",
          "Fais 10 pompes et poste une photo comme preuve."
        ]
        await ctx.reply(`🔥 *Défi :*\n\n_${dares[Math.floor(Math.random() * dares.length)]}_`)
        break
      }

      // ═══════════════ PROFIL ═════════════════════
      case "pp":
      case "avatar": {
        const target = resolveTarget(message, sender)
        try {
          const ppUrl = await sock.profilePictureUrl(target, "image")
          await sock.sendMessage(chatId, {
            image: { url: ppUrl },
            caption: `🖼️ *Photo de profil*\n👤 +${normalizeJid(target)}`
          }, { quoted: message })
        } catch {
          await ctx.reply("🚫 Aucune photo de profil visible.")
        }
        break
      }

      case "info":
      case "userinfo": {
        const target = resolveTarget(message, sender)
        const num = normalizeJid(target)
        let ppUrl = null
        try { ppUrl = await sock.profilePictureUrl(target, "image") } catch {}
        const dbUser = await getUser(num)
        const text =
          `👤 *Informations Utilisateur*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📱 Numéro : +${num}\n` +
          `🚫 Banni : ${dbUser.banned ? "Oui" : "Non"}\n` +
          `📩 Cmds utilisées : ${dbUser.cmdUsed || 0}\n` +
          `📅 Vu depuis : ${new Date(dbUser.joinedAt).toLocaleDateString("fr-FR")}`
        if (ppUrl) {
          await sock.sendMessage(chatId, { image: { url: ppUrl }, caption: text }, { quoted: message })
        } else {
          await ctx.reply(text)
        }
        break
      }

      case "bio":
      case "status": {
        const target = resolveTarget(message, sender)
        const num = normalizeJid(target)
        try {
          const status = await sock.fetchStatus(target)
          const bio = status?.status || "Aucune bio disponible."
          await ctx.reply(`📝 *Bio*\n👤 +${num}\n💬 _"${bio}"_`)
        } catch {
          await ctx.reply("🚫 Bio non disponible (privée).")
        }
        break
      }

      // ═══════════════ GROUPE ═════════════════════
      case "kick": {
        if (!isGroup) { await ctx.reply("👥 Cette commande ne fonctionne qu'en groupe."); break }
        if (!isUserAdmin && !isOwner) { await ctx.reply("👮 Réservé aux admins."); break }
        if (!isBotAdmin) { await ctx.reply("❌ Je dois être admin pour expulser."); break }
        const mentioned = getMentioned(message)
        if (!mentioned.length) { await ctx.reply("❌ Mentionne le membre à expulser."); break }
        await sock.groupParticipantsUpdate(chatId, mentioned, "remove")
        await ctx.reply("👢 Membre expulsé avec succès.")
        break
      }

      case "promote": {
        if (!isGroup) { await ctx.reply("👥 Cette commande ne fonctionne qu'en groupe."); break }
        if (!isUserAdmin && !isOwner) { await ctx.reply("👮 Réservé aux admins."); break }
        if (!isBotAdmin) { await ctx.reply("❌ Je dois être admin pour promouvoir."); break }
        const mentioned = getMentioned(message)
        if (!mentioned.length) { await ctx.reply("❌ Mentionne le membre à promouvoir."); break }
        await sock.groupParticipantsUpdate(chatId, mentioned, "promote")
        await ctx.reply(`👑 @${mentioned[0].split("@")[0]} est maintenant admin !`)
        break
      }

      case "demote": {
        if (!isGroup) { await ctx.reply("👥 Cette commande ne fonctionne qu'en groupe."); break }
        if (!isUserAdmin && !isOwner) { await ctx.reply("👮 Réservé aux admins."); break }
        if (!isBotAdmin) { await ctx.reply("❌ Je dois être admin pour rétrograder."); break }
        const mentioned = getMentioned(message)
        if (!mentioned.length) { await ctx.reply("❌ Mentionne le membre à rétrograder."); break }
        await sock.groupParticipantsUpdate(chatId, mentioned, "demote")
        await ctx.reply(`⬇️ @${mentioned[0].split("@")[0]} n'est plus admin.`)
        break
      }

      case "mute": {
        if (!isGroup) { await ctx.reply("👥 Cette commande ne fonctionne qu'en groupe."); break }
        if (!isUserAdmin && !isOwner) { await ctx.reply("👮 Réservé aux admins."); break }
        if (!isBotAdmin) { await ctx.reply("❌ Je dois être admin pour fermer le groupe."); break }
        await sock.groupSettingUpdate(chatId, "announcement")
        await ctx.reply("🔒 Groupe fermé. Seuls les admins peuvent écrire.")
        break
      }

      case "unmute": {
        if (!isGroup) { await ctx.reply("👥 Cette commande ne fonctionne qu'en groupe."); break }
        if (!isUserAdmin && !isOwner) { await ctx.reply("👮 Réservé aux admins."); break }
        if (!isBotAdmin) { await ctx.reply("❌ Je dois être admin pour ouvrir le groupe."); break }
        await sock.groupSettingUpdate(chatId, "not_announcement")
        await ctx.reply("🔓 Groupe ouvert. Tout le monde peut écrire.")
        break
      }

      case "antilink": {
        if (!isGroup) { await ctx.reply("👥 Cette commande ne fonctionne qu'en groupe."); break }
        if (!isUserAdmin && !isOwner) { await ctx.reply("👮 Réservé aux admins."); break }
        const toggle = args[0]?.toLowerCase()
        if (!["on", "off"].includes(toggle)) { await ctx.reply("❌ Utilise : `.antilink on` ou `.antilink off`"); break }
        await updateGroup(chatId, { antilink: toggle === "on" })
        await ctx.reply(`🔗 Antilink *${toggle === "on" ? "activé" : "désactivé"}*.`)
        break
      }

      case "welcome": {
        if (!isGroup) { await ctx.reply("👥 Cette commande ne fonctionne qu'en groupe."); break }
        if (!isUserAdmin && !isOwner) { await ctx.reply("👮 Réservé aux admins."); break }
        const toggle = args[0]?.toLowerCase()
        if (!["on", "off"].includes(toggle)) { await ctx.reply("❌ Utilise : `.welcome on` ou `.welcome off`"); break }
        await updateGroup(chatId, { welcome: toggle === "on" })
        await ctx.reply(`👋 Message de bienvenue *${toggle === "on" ? "activé" : "désactivé"}*.`)
        break
      }

      case "goodbye": {
        if (!isGroup) { await ctx.reply("👥 Cette commande ne fonctionne qu'en groupe."); break }
        if (!isUserAdmin && !isOwner) { await ctx.reply("👮 Réservé aux admins."); break }
        const toggle = args[0]?.toLowerCase()
        if (!["on", "off"].includes(toggle)) { await ctx.reply("❌ Utilise : `.goodbye on` ou `.goodbye off`"); break }
        await updateGroup(chatId, { goodbye: toggle === "on" })
        await ctx.reply(`👋 Message d'au revoir *${toggle === "on" ? "activé" : "désactivé"}*.`)
        break
      }

      case "ginfo":
      case "groupinfo": {
        if (!isGroup) { await ctx.reply("👥 Cette commande ne fonctionne qu'en groupe."); break }
        const meta = await sock.groupMetadata(chatId)
        const admins = meta.participants.filter(p => p.admin).length
        await ctx.reply(
          `📋 *${meta.subject}*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👥 Membres : ${meta.participants.length}\n` +
          `👮 Admins : ${admins}\n` +
          `📝 Description : _${meta.desc || "Aucune"}_`
        )
        break
      }

      case "tagall":
      case "everyone": {
        if (!isGroup) { await ctx.reply("👥 Cette commande ne fonctionne qu'en groupe."); break }
        if (!isUserAdmin && !isOwner) { await ctx.reply("👮 Réservé aux admins."); break }
        const meta = await sock.groupMetadata(chatId)
        const members = meta.participants.map(p => p.id)
        const text = args.length ? args.join(" ") : "📢 Attention tout le monde !"
        const mentionsText = members.map(m => `@${m.split("@")[0]}`).join(" ")
        await sock.sendMessage(chatId, { text: `📢 *${text}*\n\n${mentionsText}`, mentions: members }, { quoted: message })
        break
      }

      case "hidetag":
      case "ht": {
        if (!isGroup) { await ctx.reply("👥 Cette commande ne fonctionne qu'en groupe."); break }
        if (!isUserAdmin && !isOwner) { await ctx.reply("👮 Réservé aux admins."); break }
        const meta = await sock.groupMetadata(chatId)
        const members = meta.participants.map(p => p.id)
        const text = args.join(" ") || "📢"
        await sock.sendMessage(chatId, { text, mentions: members }, { quoted: message })
        break
      }

      case "setname":
      case "rename": {
        if (!isGroup) { await ctx.reply("👥 Cette commande ne fonctionne qu'en groupe."); break }
        if (!isUserAdmin && !isOwner) { await ctx.reply("👮 Réservé aux admins."); break }
        if (!isBotAdmin) { await ctx.reply("❌ Je dois être admin pour changer le nom."); break }
        const name = args.join(" ")
        if (!name) { await ctx.reply("❌ Donne un nom. Ex: `.setname Mon Super Groupe`"); break }
        await sock.groupUpdateSubject(chatId, name)
        await ctx.reply(`✏️ Nom du groupe changé en *${name}*.`)
        break
      }

      case "setdesc":
      case "description": {
        if (!isGroup) { await ctx.reply("👥 Cette commande ne fonctionne qu'en groupe."); break }
        if (!isUserAdmin && !isOwner) { await ctx.reply("👮 Réservé aux admins."); break }
        if (!isBotAdmin) { await ctx.reply("❌ Je dois être admin pour changer la description."); break }
        const desc = args.join(" ")
        if (!desc) { await ctx.reply("❌ Donne une description."); break }
        await sock.groupUpdateDescription(chatId, desc)
        await ctx.reply("📋 Description mise à jour !")
        break
      }

      case "getlink":
      case "lien": {
        if (!isGroup) { await ctx.reply("👥 Cette commande ne fonctionne qu'en groupe."); break }
        if (!isUserAdmin && !isOwner) { await ctx.reply("👮 Réservé aux admins."); break }
        if (!isBotAdmin) { await ctx.reply("❌ Je dois être admin pour obtenir le lien."); break }
        try {
          const code = await sock.groupInviteCode(chatId)
          await ctx.reply(`🔗 https://chat.whatsapp.com/${code}`)
        } catch (err) {
          await ctx.reply(`❌ Erreur : ${err.message}`)
        }
        break
      }

      case "revoke":
      case "resetlink": {
        if (!isGroup) { await ctx.reply("👥 Cette commande ne fonctionne qu'en groupe."); break }
        if (!isUserAdmin && !isOwner) { await ctx.reply("👮 Réservé aux admins."); break }
        if (!isBotAdmin) { await ctx.reply("❌ Je dois être admin pour réinitialiser le lien."); break }
        try {
          const newCode = await sock.groupRevokeInvite(chatId)
          await ctx.reply(`🔄 Nouveau lien :\nhttps://chat.whatsapp.com/${newCode}`)
        } catch (err) {
          await ctx.reply(`❌ Erreur : ${err.message}`)
        }
        break
      }

      case "admins":
      case "listadmins": {
        if (!isGroup) { await ctx.reply("👥 Cette commande ne fonctionne qu'en groupe."); break }
        const meta = await sock.groupMetadata(chatId)
        const admins = meta.participants.filter(p => p.admin)
        if (!admins.length) { await ctx.reply("❌ Aucun admin trouvé."); break }
        const list = admins.map((a, i) => `  ${i + 1}. @${a.id.split("@")[0]}${a.admin === "superadmin" ? " 👑" : ""}`).join("\n")
        await sock.sendMessage(chatId, {
          text: `👮 *Admins de ${meta.subject}*\n━━━━━━━━━━━━━━━━━━━━\n${list}`,
          mentions: admins.map(a => a.id)
        }, { quoted: message })
        break
      }

      case "poll":
      case "sondage": {
        if (!isGroup) { await ctx.reply("👥 Cette commande ne fonctionne qu'en groupe."); break }
        const parts = args.join(" ").split("|").map(p => p.trim()).filter(Boolean)
        if (parts.length < 3) { await ctx.reply("❌ Usage : `.poll Question | Option1 | Option2`"); break }
        const question = parts[0]
        const options  = parts.slice(1).slice(0, 12)
        await sock.sendMessage(chatId, { poll: { name: question, values: options, selectableCount: 1 } })
        break
      }

      // ═══════════════ OWNER ══════════════════════
      case "ban": {
        if (!isOwner) break
        const mentioned = getMentioned(message)
        if (!mentioned.length) { await ctx.reply("❌ Mentionne un utilisateur à bannir."); break }
        await banUser(mentioned[0])
        await ctx.reply(`🚫 +${mentioned[0].split("@")[0]} a été banni.`)
        break
      }

      case "unban": {
        if (!isOwner) break
        const mentioned = getMentioned(message)
        if (!mentioned.length) { await ctx.reply("❌ Mentionne un utilisateur à débannir."); break }
        await unbanUser(mentioned[0])
        await ctx.reply(`✅ +${mentioned[0].split("@")[0]} a été débanni.`)
        break
      }

      case "bc":
      case "broadcast": {
        if (!isOwner) break
        const text = args.join(" ")
        if (!text) { await ctx.reply("❌ Donne un message à diffuser."); break }
        const groups = await sock.groupFetchAllParticipating()
        let count = 0
        for (const [gJid] of Object.entries(groups)) {
          try {
            await sock.sendMessage(gJid, { text: `📢 *${config.BOT_NAME}*\n\n${text}` })
            count++
            await new Promise(r => setTimeout(r, 1000))
          } catch {}
        }
        await ctx.reply(`✅ Message envoyé à ${count} groupes.`)
        break
      }

      case "stats": {
        if (!isOwner) break
        const s = getStats()
        const uptime = formatUptime(process.uptime() * 1000)
        await ctx.reply(
          `📊 *Statistiques*\n\n` +
          `👥 Utilisateurs : ${s.totalUsers}\n` +
          `🏘️ Groupes : ${s.totalGroups}\n` +
          `📩 Commandes : ${s.totalCmds}\n` +
          `⏱️ Uptime : ${uptime}`
        )
        break
      }

      case "mode": {
        if (!isOwner) break
        const mode = args[0]?.toLowerCase()
        if (!["public", "private"].includes(mode)) { await ctx.reply("❌ Utilise : .mode public ou .mode private"); break }
        config.MODE = mode
        await ctx.reply(`⚙️ Mode changé en *${mode}*.`)
        break
      }

      case "setprefix": {
        if (!isOwner) break
        const p = args[0]
        if (!p) { await ctx.reply("❌ Donne un nouveau préfixe. Ex: .setprefix !"); break }
        config.PREFIX = p
        await ctx.reply(`✅ Préfixe changé en *${p}*`)
        break
      }

      // ═══════════════ INCONNU ════════════════════
      default:
        // Commande non reconnue avec le préfixe → on ignore silencieusement
        return
    }

    if (config.AUTO_REACT) await ctx.react("✅")

    await updateUser(senderNum, { lastSeen: Date.now(), cmdUsed: (user?.cmdUsed || 0) + 1 })
    await incrementCmds()

  } catch (err) {
    logger.error("HANDLER", err)
    try {
      await sock.sendMessage(m.messages[0]?.key?.remoteJid, {
        text: `❌ Erreur : _${err.message}_`
      }, { quoted: m.messages[0] })
    } catch {}
  }
}

module.exports = { handleMessage }

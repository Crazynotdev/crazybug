const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require("gifted-baileys")

const pino    = require("pino")
const chalk   = require("chalk")
const figlet  = require("figlet")
const readline = require("readline")

const config  = require("./config")
const logger  = require("./lib/logger")
const { initDB, getGroup } = require("./database/db")
const { handleMessage } = require("./handler")

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise((resolve) => rl.question(q, resolve))

function banner() {
  console.clear()
  try {
    console.log(chalk.cyanBright(figlet.textSync("CRAZY VOL1", { font: "Standard" })))
  } catch {
    console.log(chalk.cyanBright.bold("=== CRAZY VOL1 ==="))
  }
  console.log(chalk.gray("  " + "━".repeat(55)))
  console.log(chalk.greenBright(`  🤖 ${config.BOT_NAME} v${config.BOT_VERSION}`))
  console.log(chalk.gray(`  ${config.BOT_TAG}`))
  console.log(chalk.gray("  " + "━".repeat(55)) + "\n")
}

async function chooseConnectionMethod() {
  // Si forcé via .env / config, on respecte ce choix sans demander.
  if (config.CONNECTION_METHOD === "qr" || config.CONNECTION_METHOD === "code") {
    return config.CONNECTION_METHOD
  }
  const answer = await ask(chalk.yellow("📲 Connexion par [1] QR Code  ou  [2] Code (PairCode) ? Tape 1 ou 2 : "))
  return answer.trim() === "2" ? "code" : "qr"
}

async function startBot() {
  banner()
  await initDB()

  const { state, saveCreds } = await useMultiFileAuthState(config.SESSION_PATH)
  const { version } = await fetchLatestBaileysVersion()

  const method = await chooseConnectionMethod()

  const sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: method === "qr",
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
  })

  // ── Mode PairCode : demande le numéro et affiche le code ──
  if (method === "code" && !sock.authState?.creds?.registered) {
    const phoneNumber = await ask(chalk.yellow("📱 Entre ton numéro WhatsApp (avec indicatif, ex: 242061234567) : "))
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phoneNumber.trim().replace(/[^0-9]/g, ""))
        console.log(chalk.bgGreenBright.black(`\n  🔑 TON CODE DE COUPLAGE : ${code}  \n`))
        console.log(chalk.gray("  Va dans WhatsApp > Appareils liés > Lier avec un numéro de téléphone\n"))
      } catch (err) {
        logger.error("PAIRCODE", err)
      }
    }, 3000)
  }

  // ─────────────────────────────────────────────
  //              GESTION DE CONNEXION
  // ─────────────────────────────────────────────
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr && method === "qr") {
      console.log(chalk.gray("\n  📷 Scanne ce QR code avec WhatsApp (Appareils liés)\n"))
    }

    if (connection === "open") {
      logger.connect(config.BOT_NAME, sock.user?.id)
      logger.divider()
      rl.close()
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut

      if (statusCode === DisconnectReason.loggedOut) {
        logger.disconnect("Session déconnectée (logout). Supprime le dossier /session et relance.")
        process.exit(1)
      } else if (shouldReconnect) {
        logger.reconnect(1)
        setTimeout(() => startBot(), 3000)
      } else {
        logger.disconnect("Connexion fermée définitivement.")
        process.exit(1)
      }
    }
  })

  sock.ev.on("creds.update", saveCreds)

  // ─────────────────────────────────────────────
  //              RÉCEPTION DES MESSAGES
  // ─────────────────────────────────────────────
  sock.ev.on("messages.upsert", async (m) => {
    await handleMessage(sock, m)
  })

  // ─────────────────────────────────────────────
  //         EVENTS GROUPE : welcome / goodbye
  // ─────────────────────────────────────────────
  sock.ev.on("group-participants.update", async (event) => {
    try {
      const { id: chatId, participants, action } = event
      const groupConf = await getGroup(chatId)
      const meta = await sock.groupMetadata(chatId).catch(() => null)
      const groupName = meta?.subject || "le groupe"

      for (const participant of participants) {
        const num = participant.split("@")[0]

        if (action === "add" && groupConf.welcome) {
          const text = (groupConf.welcomeMsg || "👋 Bienvenue @user dans *@group* !")
            .replace("@user", `@${num}`)
            .replace("@group", groupName)
          await sock.sendMessage(chatId, { text, mentions: [participant] })
          logger.group("add", participant, groupName)
        }

        if (action === "remove" && groupConf.goodbye) {
          await sock.sendMessage(chatId, { text: `👋 @${num} a quitté *${groupName}*.`, mentions: [participant] })
          logger.group("remove", participant, groupName)
        }

        if (action === "promote") logger.group("promote", participant, groupName)
        if (action === "demote")  logger.group("demote", participant, groupName)
      }
    } catch (err) {
      logger.error("GROUP-EVENT", err)
    }
  })

  // ─────────────────────────────────────────────
  //              ANTILINK (simple)
  // ─────────────────────────────────────────────
  sock.ev.on("messages.upsert", async (m) => {
    try {
      const message = m.messages[0]
      if (!message?.message || message.key.fromMe) return
      const chatId = message.key.remoteJid
      if (!chatId.endsWith("@g.us")) return

      const groupConf = await getGroup(chatId)
      if (!groupConf.antilink) return

      const body =
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text || ""

      const linkRegex = /(chat\.whatsapp\.com|https?:\/\/)/i
      if (linkRegex.test(body)) {
        const sender = message.key.participant || message.participant
        const meta = await sock.groupMetadata(chatId).catch(() => null)
        const senderIsAdmin = meta?.participants?.find(p => p.id === sender)?.admin
        if (senderIsAdmin) return

        await sock.sendMessage(chatId, { delete: message.key }).catch(() => {})
        await sock.sendMessage(chatId, {
          text: `🚫 @${sender.split("@")[0]} les liens sont interdits ici !`,
          mentions: [sender]
        })
      }
    } catch (err) {
      logger.error("ANTILINK", err)
    }
  })

  process.on("uncaughtException", (err) => logger.error("UNCAUGHT", err))
  process.on("unhandledRejection", (err) => logger.error("UNHANDLED", err))

  return sock
}

startBot().catch((err) => {
  console.error(chalk.red("❌ Erreur fatale au démarrage :"), err)
  process.exit(1)
})

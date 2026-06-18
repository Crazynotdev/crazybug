const chalk  = require("chalk")
const moment = require("moment")

const time = () => chalk.gray(`[${moment().format("HH:mm:ss")}]`)

const tag = {
  msg:        chalk.bgCyan.black(" MSG "),
  cmd:        chalk.bgGreen.black(" CMD "),
  media:      chalk.bgMagenta.black(" MEDIA "),
  group:      chalk.bgBlue.black(" GROUP "),
  connect:    chalk.bgGreenBright.black(" ONLINE "),
  disconnect: chalk.bgRed.white(" OFFLINE "),
  error:      chalk.bgRed.white(" ERROR "),
  warn:       chalk.bgYellow.black(" WARN "),
  info:       chalk.bgWhite.black(" INFO "),
  boot:       chalk.bgGreenBright.black(" BOOT "),
  ban:        chalk.bgRed.white(" BAN "),
}

function truncate(str, max) {
  if (!str) return ""
  return str.length > max ? str.slice(0, max) + "…" : str
}

function isGroupJid(jid) {
  return jid?.endsWith("@g.us")
}

const logger = {
  msg(sender, jid, text, type = "text", name = "") {
    const numero  = chalk.cyan(sender.replace(/[^0-9]/g, ""))
    const pseudo  = name ? chalk.bold.white(`~${name}`) : chalk.gray("inconnu")
    const chat    = isGroupJid(jid) ? chalk.blue("[groupe]") : chalk.gray("[DM]")
    const content = chalk.white(truncate(text, 80))
    const mtype   = type !== "text" ? chalk.magenta(` [${type}]`) : ""
    console.log(`${time()} ${tag.msg} ${pseudo} ${chalk.gray("(")}${numero}${chalk.gray(")")} ${chalk.gray("→")} ${chat}${mtype}\n${chalk.gray("             ›")} ${content}`)
  },

  cmd(sender, cmdName, args, jid, name = "") {
    const numero = chalk.greenBright(sender.replace(/[^0-9]/g, ""))
    const pseudo = name ? chalk.bold.white(`~${name}`) : chalk.gray("inconnu")
    const chat   = isGroupJid(jid) ? chalk.blue("[groupe]") : chalk.gray("[DM]")
    const a      = args.length ? chalk.gray(args.join(" ").slice(0, 40)) : ""
    console.log(`${time()} ${tag.cmd} ${pseudo} ${chalk.gray("(")}${numero}${chalk.gray(")")} ${chalk.gray("→")} ${chat} ${chalk.gray("›")} ${chalk.bold.green(cmdName)} ${a}`)
  },

  media(sender, mediaType, jid, name = "") {
    const numero = chalk.magenta(sender.replace(/[^0-9]/g, ""))
    const pseudo = name ? chalk.bold.white(`~${name}`) : chalk.gray("inconnu")
    const chat   = isGroupJid(jid) ? chalk.blue("[groupe]") : chalk.gray("[DM]")
    console.log(`${time()} ${tag.media} ${pseudo} ${chalk.gray("(")}${numero}${chalk.gray(")")} ${chalk.gray("→")} ${chat} ${chalk.gray("›")} ${chalk.magenta(mediaType)}`)
  },

  connect(name, jid) {
    console.log(`${time()} ${tag.connect} ${chalk.greenBright(name)} ${chalk.gray(jid?.split(":")[0] || "")}`)
  },

  disconnect(reason) {
    console.log(`${time()} ${tag.disconnect} ${chalk.red(reason || "Connexion perdue")}`)
  },

  reconnect(attempt) {
    console.log(`${time()} ${tag.warn} ${chalk.yellow(`Reconnexion tentative #${attempt}...`)}`)
  },

  group(action, who, groupName) {
    const actions = {
      add:     chalk.green("➕ rejoint"),
      remove:  chalk.red("➖ quitté"),
      promote: chalk.yellow("👑 promu admin"),
      demote:  chalk.gray("⬇️ rétrogradé"),
    }
    const label = actions[action] || chalk.white(action)
    console.log(`${time()} ${tag.group} ${chalk.cyan(who.replace(/[^0-9]/g, ""))} ${label} ${chalk.gray("dans")} ${chalk.blue(truncate(groupName || "groupe", 25))}`)
  },

  error(context, err) {
    const msg = err?.message || String(err)
    console.log(`${time()} ${tag.error} ${chalk.red(context)} ${chalk.gray("›")} ${chalk.redBright(truncate(msg, 100))}`)
  },

  warn(text)  { console.log(`${time()} ${tag.warn} ${chalk.yellow(text)}`) },
  info(text)  { console.log(`${time()} ${tag.info} ${chalk.white(text)}`) },
  boot(text)  { console.log(`${time()} ${tag.boot} ${chalk.greenBright(text)}`) },
  ban(sender, action = "banni") {
    console.log(`${time()} ${tag.ban} ${chalk.red(sender.replace(/[^0-9]/g, ""))} ${chalk.gray("›")} ${action}`)
  },
  divider() {
    console.log(chalk.gray("  " + "━".repeat(55)))
  }
}

module.exports = logger

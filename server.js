import "dotenv/config";
import express from "express";
import bodyParser from "body-parser";
import { Client, GatewayIntentBits, EmbedBuilder, Events } from "discord.js";

const {
  PORT = 8080,
  DISCORD_TOKEN,
  CHANNEL_ID,
  EULER_WEBHOOK_SECRET,
} = process.env;

if (!DISCORD_TOKEN || !CHANNEL_ID) {
  console.error("กรุณาใส่ DISCORD_TOKEN และ CHANNEL_ID ใน .env");
  process.exit(1);
}

/* ---------- Discord client ---------- */
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`🦀 ปูโกะออนไลน์แล้วในชื่อ ${c.user.tag}`);
});

await client.login(DISCORD_TOKEN);

/* ---------- Express app ---------- */
const app = express();

// เก็บ raw body เพื่อ verify signature ได้
app.use(
  bodyParser.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

/* ---------- ตัวช่วย ---------- */
function verifyEulerSignature(req) {
  const sigHeader = req.get("x-euler-signature");
  if (!sigHeader) return false;
  return sigHeader.trim() === EULER_WEBHOOK_SECRET;
}

const clamp = (s, max) => (s ?? "").toString().slice(0, max);

// เดาประเภทอีเวนต์แบบยืดหยุ่น (รองรับชื่อที่ต่างกัน)
function detectKind(payload) {
  const k = (
    payload?.event ||
    payload?.type ||
    payload?.status ||
    ""
  ).toLowerCase();
  if (!k) return "";
  if (/(start|live_on|go_live|online|opened)/.test(k)) return "start";
  if (/(end|live_off|offline|closed|stop)/.test(k)) return "end";
  return k;
}

/* ---------- ธีมปูโกะ: อาหารทะเล ---------- */
const seafoodStartLines = (u) => [
  `🦀 ปูโกะต้มยำพร้อมเสิร์ฟ! **@${u}** กำลัง LIVE อยู่จ้า~`,
  `🦐 กลิ่นกุ้งเผาลอยมาเลย~ แวะมาดู **@${u}** LIVE กัน 🌊`,
  `🐚 หอยแครงลวกกำลังเดือด~ **@${u}** เปิดไลฟ์แล้ว!`,
  `🦑 หมึกย่างหอม ๆ รออยู่! เข้ามาเจอ **@${u}** กันเร็วๆ`,
  `🍲 ซีฟู้ดหม้อไฟพร้อม! **@${u}** ไลฟ์แล้วน้า~`,
];

const seafoodEndLines = (u) => [
  `🦀 หม้อซีฟู้ดปิดแล้ว~ ไลฟ์ของ **@${u}** จบแล้วจ้า`,
  `🦐 กุ้งหมดตะกร้าแล้ว~ ขอบคุณที่มาดูไลฟ์ของ **@${u}**`,
  `🐚 หอยหมดถัง! ไลฟ์ของ **@${u}** ปิดเตาแล้วนะ`,
  `🦑 เก็บเตาย่างเรียบร้อย~ **@${u}** ปิดไลฟ์แล้วน้า`,
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ---------- สร้าง Embed แจ้งเตือน ---------- */
function buildStartEmbed(u, info = {}) {
  const title = clamp(info.title || `@${u} เปิดครัวซีฟู้ดแล้วจ้า~`, 256);
  const cover = info.cover || info.thumbnail || info.image;
  const startAt = info.started_at
    ? Math.floor(new Date(info.started_at).getTime() / 1000)
    : Math.floor(Date.now() / 1000);

  const desc = [
    pick(seafoodStartLines(u)),
    "",
    `เริ่มเมื่อ: <t:${startAt}:R>`,
  ].join("\n");

  const e = new EmbedBuilder()
    .setColor(0xff7043) // โทนส้ม-ซีฟู้ด
    .setTitle(`🍤 🔴 LIVE: ${title}`)
    .setURL(`https://www.tiktok.com/@${u}/live`)
    .setDescription(desc)
    .setTimestamp();

  if (cover && /^https?:\/\//i.test(cover)) e.setImage(cover);
  return e;
}

function buildEndEmbed(u, info = {}) {
  const mins = info.duration_minutes ?? info.minutes ?? null;
  let desc = pick(seafoodEndLines(u));
  if (mins != null) desc += `\nรวมเวลาไลฟ์: **${mins} นาที** ⏱️`;
  desc += `\nไว้เจอกันใหม่ มาซดน้ำซุปทะเลด้วยกันนะ 🌊`;

  return new EmbedBuilder()
    .setColor(0xffcc80) // โทนเหลืองอุ่น
    .setTitle("🍲 ⚫️ ไลฟ์จบแล้ว")
    .setDescription(desc)
    .setTimestamp();
}

/* ---------- ส่งข้อความเข้า Discord ---------- */
async function sendToDiscord(payload) {
  const ch = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!ch?.isTextBased?.()) {
    console.error("ส่งไม่ได้: CHANNEL_ID ไม่ใช่ text channel");
    return;
  }

  const username =
    (payload?.username || payload?.user || payload?.account || "").replace(
      /^@/,
      ""
    ) || "streamer";

  const kind = detectKind(payload);
  const info = payload?.roomInfo || payload?.live || payload?.data || {};

  if (kind === "start") {
    await ch.send({
      content: `🔔 **@${username}** กำลัง LIVE แล้วจ้า~ 🦀🌊`,
      embeds: [buildStartEmbed(username, info)],
    });
  } else if (kind === "end") {
    await ch.send({ embeds: [buildEndEmbed(username, info)] });
  } else {
    // อีเวนต์อื่น ๆ เก็บ log เผื่อ map เพิ่ม
    console.log("ℹ️ รับ event ที่ไม่รู้จัก:", kind, payload);
  }
}

/* ---------- Webhook endpoint ---------- */
app.post("/webhooks/euler-live", async (req, res) => {
  try {
    if (!verifyEulerSignature(req)) {
      console.warn("❌ invalid signature");
      return res.status(401).send("invalid signature");
    }

    const payload = req.body || {};
    console.log("✅ received:", JSON.stringify(payload));
    await sendToDiscord(payload);

    res.status(200).send("ok");
  } catch (e) {
    console.error("webhook error:", e);
    res.status(500).send("error");
  }
});

app.get("/", (_req, res) => res.send("OK"));
app.listen(PORT, () => console.log(`🌐 Webhook server running at :${PORT}`));

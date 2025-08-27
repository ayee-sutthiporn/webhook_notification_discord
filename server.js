import "dotenv/config";
import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
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
  console.log(`✅ Discord bot online as ${c.user.tag}`);
});

await client.login(DISCORD_TOKEN);

/* ---------- Express app ---------- */
const app = express();

// เก็บ raw body เพื่อ verify signature ได้
app.use(
  bodyParser.json({
    verify: (req, res, buf) => {
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

/* ---------- สร้าง Embed แจ้งเตือน ---------- */
function buildStartEmbed(u, info = {}) {
  const title = clamp(info.title || `@${u} กำลังไลฟ์น้า~`, 256);
  const cover = info.cover || info.thumbnail || info.image;
  const startAt = info.started_at
    ? Math.floor(new Date(info.started_at).getTime() / 1000)
    : Math.floor(Date.now() / 1000);

  const e = new EmbedBuilder()
    .setColor(0xffb6c1)
    .setTitle(`✿ 🔴 LIVE: ${title} ✿`)
    .setURL(`https://www.tiktok.com/@${u}/live`)
    .setDescription(
      `เมี้ยว~ **@${u}** เปิดไลฟ์แล้วน้า 🐾\nมาเม้ามอยกันได้เลย~\n\nเริ่มเมื่อ: <t:${startAt}:R>`
    )
    .setTimestamp();

  if (cover && /^https?:\/\//i.test(cover)) e.setImage(cover);
  return e;
}

function buildEndEmbed(u, info = {}) {
  const mins = info.duration_minutes ?? info.minutes ?? null;
  let desc = `สตรีมของ **@${u}** จบแล้วเมี้ยว~`;
  if (mins != null) desc += `\nรวมเวลาไลฟ์: **${mins} นาที** ⏱️`;
  desc += `\nขอบคุณที่มาดูกันนะคะ ฅ^•ﻌ•^ฅ`;

  return new EmbedBuilder()
    .setColor(0x99aab5)
    .setTitle("✿ ⚫️ ไลฟ์จบแล้ว ✿")
    .setDescription(desc)
    .setTimestamp();
}

async function sendToDiscord(payload) {
  const ch = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!ch?.isTextBased?.()) {
    console.error("ส่งไม่ได้: CHANNEL_ID ไม่ใช่ text channel");
    return;
  }

  const username = (
    payload.username ||
    payload.user ||
    payload.account ||
    ""
  ).replace(/^@/, "");
  const kind = (payload.event || payload.type || "").toLowerCase();

  // room/live info ที่อาจส่งมาจาก Euler (ตั้งชื่อยืดหยุ่นไว้ก่อน)
  const info = payload.roomInfo || payload.live || payload.data || {};

  if (kind.includes("start")) {
    await ch.send({
      content: `🔔 **@${username}** กำลัง LIVE แล้วค่าาา~ 😺💕`,
      embeds: [buildStartEmbed(username, info)],
    });
  } else if (kind.includes("end")) {
    await ch.send({ embeds: [buildEndEmbed(username, info)] });
  } else {
    // ถ้าเป็น event อื่น ๆ ให้ log ไว้ดูก่อน
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
    // คุณอาจ console.log(payload) เพื่อดูโครงสร้างจริงจาก Euler แล้ว mapping ให้ตรง
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

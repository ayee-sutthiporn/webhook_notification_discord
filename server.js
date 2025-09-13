import "dotenv/config";
import express from "express";
import { Client, GatewayIntentBits, EmbedBuilder, Events } from "discord.js";
import { WebcastPushConnection } from "tiktok-live-connector";

/* ---------- ENV ---------- */
const {
  PORT = 8080,
  DISCORD_TOKEN,
  CHANNEL_ID, // แชนแนลที่ใช้ประกาศ Live Start/End
  TIKTOK_USERNAME, // ชื่อผู้ใช้ TikTok (ไม่ต้องมี @)
} = process.env;

if (!DISCORD_TOKEN || !CHANNEL_ID || !TIKTOK_USERNAME) {
  console.error(
    "กรุณาใส่ ENV ให้ครบ: DISCORD_TOKEN, CHANNEL_ID, TIKTOK_USERNAME"
  );
  process.exit(1);
}

/* ---------- Discord client ---------- */
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`🦀 ปูโกะออนไลน์แล้วในชื่อ ${c.user.tag}`);
});

/* ---------- TikTok live tracker ---------- */
let isLive = false;
let lastLiveStartAt = null; // number (ms)
let lastLiveEndAt = null; // number (ms)
let lastRoomCover = null; // url string or null

// อย่าสร้าง connection ใหม่ทุกครั้ง ให้ใช้ตัวเดียวทั้งโปรเซส
const tiktok = new WebcastPushConnection(TIKTOK_USERNAME);

/* ---------- Helper: ส่งเข้า Discord ---------- */
async function sendToDiscord(payload) {
  const ch = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!ch?.isTextBased?.()) {
    console.error("ส่งไม่ได้: CHANNEL_ID ไม่ใช่ text channel");
    return;
  }
  await ch.send(payload);
}

/* ---------- ธีมปูโกะ: ข้อความสุ่ม ---------- */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function clamp(s, max) {
  return (s ?? "").toString().slice(0, max);
}

const seafoodStartLines = (u) => [
  `🦀 ปูโกะโผล่มาทัก~ **@${u}** เปิดไลฟ์แล้วน้าา 💖`,
  `✨ ปูโกะได้ยินเสียงคลื่นเลย~ มาดู **@${u}** กันเถอะ! 🌊`,
  `💬 เมี้ยว..เอ้ย! ก้ามปูพร้อม! **@${u}** ไลฟ์สดแล้วน้าา >w<`,
  `🌟 ปูโกะดีดก้ามด้วยความดีใจ! **@${u}** เปิดไลฟ์แล้ว!`,
  `🍤 หิวซีฟู้ดจัง~ แต่ตอนนี้ปูโกะอยากดูไลฟ์ของ **@${u}** มากกว่า~`,
  `🌊 คลื่นซัดมาแล้ว~ ปูโกะรีบมาบอกว่า **@${u}** ไลฟ์อยู่จ้า!`,
  `🎉 ปูโกะเคาะก้ามดัง ๆ~ **@${u}** เริ่มสตรีมแล้วน้าา`,
  `💖 ปูโกะยิ้มกว้าง~ ได้เวลาดูไลฟ์ของ **@${u}** กันแล้ว`,
  `☀️ วันนี้สดใสขึ้นทันที เพราะ **@${u}** เปิดไลฟ์แล้วจ้า`,
  `⭐ ปูโกะตื่นเต้นมาก~ มาสนุกกับ **@${u}** กันเลย!`,

  // 🤪 เพิ่มสายฮา
  `🦀 ปูโกะกำลังกินข้าว… อ้าว! **@${u}** ไลฟ์แล้ว รีบวางช้อนก่อน!`,
  `😂 ปูโกะกำลังนอนตะแคง ดีดก้ามตกใจเลย~ **@${u}** ออนไลน์แล้ว`,
  `🤔 ปูโกะกะจะไปฟิตเนส แต่เปลี่ยนใจมาดู **@${u}** ดีกว่า~`,
  `🦀 ปูโกะบอกเพื่อน ๆ แล้วว่า “ถ้าไม่ดูไลฟ์ **@${u}** เดี๋ยวโดนหนีบก้ามนะ!”`,
  `🤣 ปูโกะดีดก้ามจนคีย์บอร์ดพัง… เพราะตื่นเต้นที่ **@${u}** ไลฟ์สดแล้ว`,
];

const seafoodEndLines = (u) => [
  `🦀 ปูโกะเก็บก้าม~ ไลฟ์ของ **@${u}** จบแล้วน้าา ขอบคุณที่มาดูกัน 💕`,
  `🌙 ปูโกะบอกฝันดี~ ไลฟ์ของ **@${u}** ปิดไปแล้วจ้าา`,
  `💖 ก้ามปูพักก่อน~ วันนี้สนุกมาก ขอบคุณที่อยู่กับ **@${u}** น้าา`,
  `✨ ปูโกะส่งหัวใจให้เลย~ ไลฟ์ของ **@${u}** จบแล้ว แต่เจอกันใหม่แน่นอน!`,
  `🌊 คลื่นทะเลสงบแล้ว~ ไลฟ์ของ **@${u}** จบลงเรียบร้อย ไว้มาเจอกันใหม่นะ`,
  `🦀 ปูโกะขอบคุณทุกคนมากเลย~ ไลฟ์ของ **@${u}** ปิดแล้วน้า`,
  `⭐ ปูโกะดีดก้ามทิ้งท้าย~ ขอบคุณที่อยู่ด้วยกันในไลฟ์ของ **@${u}**`,
  `🍀 จบไลฟ์แล้ว แต่ปูโกะยังอยู่ในใจทุกคนเสมอ~ ขอบคุณที่ดู **@${u}** น้าา`,
  `📺 วันนี้ปิดจอแล้ว~ ไลฟ์ของ **@${u}** จบแล้วครับ ขอบคุณทุกการกดหัวใจ 💕`,
  `🌸 ปูโกะโบกก้ามบ๊ายบาย~ แล้วมาเจอกันอีกครั้งในไลฟ์ของ **@${u}** นะ`,
];

/* ---------- Embed ---------- */
function buildStartEmbed(u, info = {}) {
  const title = clamp(info?.title || `@${u} เปิดครัวซีฟู้ดแล้วจ้า~`, 256);
  const cover = info?.cover || info?.thumbnail || info?.image || lastRoomCover;
  const startAt = info?.started_at
    ? Math.floor(new Date(info.started_at).getTime() / 1000)
    : Math.floor((lastLiveStartAt ?? Date.now()) / 1000);

  const desc = [
    pick(seafoodStartLines(u)),
    "",
    `เริ่มเมื่อ: <t:${startAt}:R>`,
  ].join("\n");

  const e = new EmbedBuilder()
    .setColor(0xff7043)
    .setTitle(`🍤 🔴 LIVE: ${title}`)
    .setURL(`https://www.tiktok.com/@${u}/live`)
    .setDescription(desc)
    .setTimestamp();

  if (cover && /^https?:\/\//i.test(cover)) e.setImage(cover);
  return e;
}
function buildEndEmbed(u, info = {}) {
  const mins = info?.duration_minutes ?? info?.minutes ?? null;
  let desc = pick(seafoodEndLines(u));
  if (mins != null) desc += `\nรวมเวลาไลฟ์: **${mins} นาที** ⏱️`;
  desc += `\nไว้เจอกันใหม่ มาซดน้ำซุปทะเลด้วยกันนะ 🌊`;

  return new EmbedBuilder()
    .setColor(0xffcc80)
    .setTitle("🍲 ⚫️ ไลฟ์จบแล้ว")
    .setDescription(desc)
    .setTimestamp();
}

/* ---------- อีเวนต์จาก TikTok (รีลไทม์) ---------- */
tiktok.on("connected", (state) => {
  console.log("✅ TikTok connected roomId:", state?.roomId);
});

tiktok.on("streamStart", (data) => {
  isLive = true;
  lastLiveStartAt = Date.now();
  lastRoomCover =
    data?.roomInfo?.cover ?? data?.roomInfo?.background ?? lastRoomCover;

  sendToDiscord({
    content: `🔔 **@${TIKTOK_USERNAME}** กำลัง LIVE แล้วจ้า~ 🦀🌊`,
    embeds: [buildStartEmbed(TIKTOK_USERNAME, data?.roomInfo)],
  }).catch(console.error);
});

tiktok.on("streamEnd", () => {
  isLive = false;
  lastLiveEndAt = Date.now();

  sendToDiscord({ embeds: [buildEndEmbed(TIKTOK_USERNAME)] }).catch(
    console.error
  );
});

tiktok.on("disconnected", () => {
  console.warn("⚠️ TikTok disconnected, will retry…");
  scheduleReconnect();
});

/* ---------- รีคอนเนกต์อัตโนมัติ (exponential backoff) ---------- */
let retryMs = 5_000;
async function connectForever() {
  try {
    await tiktok.connect(); // ถ้ายังไม่ไลฟ์ อาจ throw ได้
    retryMs = 5_000; // ต่อได้ รีเซ็ต backoff
  } catch (e) {
    console.warn("❌ connect error:", e?.message ?? e);
    scheduleReconnect();
  }
}
function scheduleReconnect() {
  setTimeout(connectForever, retryMs);
  retryMs = Math.min(retryMs * 2, 5 * 60_000); // สูงสุด 5 นาที
}

/* ---------- Start ---------- */
await client.login(DISCORD_TOKEN);
connectForever();

/* ---------- Express (health check) ---------- */
const app = express();
app.get("/", (_req, res) => res.send("OK"));
app.listen(PORT, () => console.log(`🌐 Health server running at :${PORT}`));

/* ============================================================
   Генератор data.js
   Тянет топ популярных аниме с Shikimori (русские названия, жанры,
   описания, постеры), проверяет наличие в Kodik и пишет ../data.js.

   Запуск:  node tools/gen-data.mjs
   Параметры (необязательно):
     TARGET — сколько тайтлов оставить (по умолчанию 120)
     PAGES  — сколько страниц по 50 тянуть с Shikimori (по умолчанию 5)
   ============================================================ */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TARGET = Number(process.env.TARGET || 120);
const PAGES = Number(process.env.PAGES || 5);
const SHIKI = "https://shikimori.io/api/graphql";
const KODIK_TOKEN = "447d179e875efe44217f20d1ee2146be";
const KODIK_API = "https://kodik-api.com/get-player";
const UA = "AniVerse/1.0 (catalog builder)";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STATUS_MAP = { anons: "Анонс", ongoing: "Онгоинг", released: "Завершён" };

// Чистим описание Shikimori от BBCode-тегов, оставляя видимый текст
function cleanDesc(s) {
  if (!s) return "";
  return s
    .replace(/\[\/?[a-zA-Z][^\]]*\]/g, "") // [b], [/b], [character=..], [/character] ...
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 420)
    .replace(/\s+\S*$/, (m) => (s.length > 420 ? "…" : m));
}

async function gqlPage(page) {
  const query = `{
    animes(order: popularity, limit: 50, page: ${page}, kind: "tv") {
      id russian name score status
      airedOn { year }
      genres { russian }
      poster { mainUrl }
      description
    }
  }`;
  const res = await fetch(SHIKI, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ query })
  });
  if (!res.ok) throw new Error("Shikimori HTTP " + res.status);
  const data = await res.json();
  if (data.errors) throw new Error("Shikimori GraphQL: " + JSON.stringify(data.errors));
  return data.data.animes || [];
}

// Есть ли тайтл в Kodik (по shikimori/mal id)
async function inKodik(id) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`${KODIK_API}?token=${KODIK_TOKEN}&shikimoriID=${id}`, {
        headers: { "User-Agent": UA }
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = await r.json();
      return Boolean(d.found && d.allowed === 1 && d.link);
    } catch {
      await sleep(600);
    }
  }
  return false;
}

async function main() {
  console.log(`Тяну ${PAGES} стр. по 50 с Shikimori…`);
  const raw = [];
  for (let p = 1; p <= PAGES; p++) {
    const list = await gqlPage(p);
    raw.push(...list);
    console.log(`  стр.${p}: +${list.length} (всего ${raw.length})`);
    await sleep(400);
  }

  // Только осмысленные записи
  const candidates = raw.filter((a) => a.russian && a.poster?.mainUrl && a.score > 0);

  console.log(`Проверяю наличие в Kodik (это займёт ~минуту)…`);
  const out = [];
  for (const a of candidates) {
    if (out.length >= TARGET) break;
    const ok = await inKodik(a.id);
    process.stdout.write(ok ? "•" : "·");
    if (ok) {
      out.push({
        id: String(a.id),
        shikimoriID: Number(a.id),
        title: a.russian,
        original: a.name || "",
        year: a.airedOn?.year || null,
        genres: (a.genres || []).map((g) => g.russian).slice(0, 3),
        rating: a.score ? Number(a.score) : 0,
        status: STATUS_MAP[a.status] || "Завершён",
        poster: a.poster.mainUrl,
        description: cleanDesc(a.description)
      });
    }
    await sleep(180);
  }
  console.log(`\nГотово в Kodik: ${out.length} тайтлов.`);

  const header = `/*
  АВТОСГЕНЕРИРОВАНО скриптом tools/gen-data.mjs (${new Date().toISOString().slice(0, 10)}).
  Топ популярных аниме с Shikimori, проверенные на наличие в Kodik.
  Чтобы обновить/добавить тайтлы — запусти: node tools/gen-data.mjs
  Можно и вручную дописывать объекты в массив ANIME (нужен лишь shikimoriID).
*/\n\n`;

  const body =
    "const ANIME = " +
    JSON.stringify(out, null, 2) +
    ";\n\n" +
    `/* ===== Настройки Kodik ===== */\n` +
    `const KODIK_TOKEN = ${JSON.stringify(KODIK_TOKEN)};\n` +
    `const KODIK_API = ${JSON.stringify(KODIK_API)};\n`;

  const target = join(__dirname, "..", "data.js");
  writeFileSync(target, header + body, "utf8");
  console.log("Записан файл:", target);
}

main().catch((e) => {
  console.error("Ошибка:", e.message);
  process.exit(1);
});

/* ============================================================
   Добавляет аниме указанного сезона/года в существующий data.js.
   Не трогает уже добавленные тайтлы, новые помечает isNew:true
   и ставит в начало списка.

   Запуск:  node tools/add-season.mjs            (по умолчанию сезон 2026)
            SEASON=winter_2026 node tools/add-season.mjs
            SEASON=2026 PAGES=4 node tools/add-season.mjs
   ============================================================ */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data.js");

const SEASON = process.env.SEASON || "2026";
const PAGES = Number(process.env.PAGES || 4);
const SHIKI = "https://shikimori.io/api/graphql";
const KODIK_TOKEN = "447d179e875efe44217f20d1ee2146be";
const KODIK_API = "https://kodik-api.com/get-player";
const UA = "AniVerse/1.0 (season updater)";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STATUS_MAP = { anons: "Анонс", ongoing: "Онгоинг", released: "Завершён" };

function cleanDesc(s) {
  if (!s) return "";
  return s
    .replace(/\[\/?[a-zA-Z][^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 420);
}

// Грузим текущий каталог из data.js
function loadExisting() {
  const src = readFileSync(DATA, "utf8");
  const sandbox = {};
  // eslint-disable-next-line no-new-func
  new Function("exports", src + "\nexports.ANIME = ANIME;")(sandbox);
  return sandbox.ANIME;
}

async function gqlPage(page) {
  const query = `{
    animes(season: "${SEASON}", order: popularity, limit: 50, page: ${page}, kind: "tv") {
      id russian name score status
      airedOn { year }
      genres { russian }
      poster { mainUrl }
      description
    }
  }`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(SHIKI, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": UA },
        body: JSON.stringify({ query })
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (data.errors) throw new Error(JSON.stringify(data.errors));
      return data.data.animes || [];
    } catch (e) {
      await sleep(2500);
    }
  }
  throw new Error("Shikimori недоступен");
}

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
  const existing = loadExisting();
  const have = new Set(existing.map((a) => String(a.id)));
  console.log(`В каталоге уже ${existing.length} тайтлов. Ищу сезон "${SEASON}"…`);

  const raw = [];
  for (let p = 1; p <= PAGES; p++) {
    const list = await gqlPage(p);
    raw.push(...list);
    console.log(`  стр.${p}: +${list.length}`);
    await sleep(400);
  }

  const candidates = raw.filter((a) => a.russian && a.poster?.mainUrl && !have.has(String(a.id)));
  console.log(`Новых кандидатов: ${candidates.length}. Проверяю в Kodik…`);

  const fresh = [];
  for (const a of candidates) {
    const ok = await inKodik(a.id);
    process.stdout.write(ok ? "•" : "·");
    if (ok) {
      fresh.push({
        id: String(a.id),
        shikimoriID: Number(a.id),
        title: a.russian,
        original: a.name || "",
        year: a.airedOn?.year || null,
        genres: (a.genres || []).map((g) => g.russian).slice(0, 3),
        rating: a.score ? Number(a.score) : 0,
        status: STATUS_MAP[a.status] || "Онгоинг",
        poster: a.poster.mainUrl,
        description: cleanDesc(a.description),
        isNew: true
      });
    }
    await sleep(180);
  }
  console.log(`\nДобавляю ${fresh.length} новинок.`);

  const merged = [...fresh, ...existing];

  const header = `/*
  Каталог аниме (data.js).
  Топ популярных + новинки сезона, проверены на наличие в Kodik.
  Пересобрать базу:  node tools/gen-data.mjs
  Добавить сезон:    node tools/add-season.mjs
*/\n\n`;
  const body =
    "const ANIME = " +
    JSON.stringify(merged, null, 2) +
    ";\n\n/* ===== Настройки Kodik ===== */\n" +
    `const KODIK_TOKEN = ${JSON.stringify(KODIK_TOKEN)};\n` +
    `const KODIK_API = ${JSON.stringify(KODIK_API)};\n`;

  writeFileSync(DATA, header + body, "utf8");
  console.log(`Готово. Всего в каталоге: ${merged.length}.`);
}

main().catch((e) => {
  console.error("Ошибка:", e.message);
  process.exit(1);
});

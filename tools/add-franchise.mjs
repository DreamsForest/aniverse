/* ============================================================
   Доп. поле franchise для каждого тайтла из Shikimori.
   franchise — общий код франшизы (напр. "jujutsu_kaisen"),
   не зависит от названия → правильно группирует сезоны,
   даже если у части свой подзаголовок ("Смертельная миграция").

   ЗАПУСК:  node tools/add-franchise.mjs
   Перезаписывает data.js, сохраняя структуру и блок KODIK.
   Запускать после изменения каталога, перед tools/gen-seo.mjs.
   ============================================================ */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data.js");
const GQL = "https://shikimori.io/api/graphql";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadAnime() {
  const src = readFileSync(DATA, "utf8");
  const sandbox = {};
  new Function("e", src + "\ne.ANIME=ANIME;")(sandbox);
  return sandbox.ANIME;
}

// Запрос franchise для пачки id с ретраями (Shikimori иногда отдаёт пусто/ошибку)
async function fetchFranchises(ids) {
  const query = `{ animes(ids:"${ids.join(",")}", limit:${ids.length}){ id franchise } }`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(GQL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "AniVerse" },
        body: JSON.stringify({ query })
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      const list = json?.data?.animes;
      if (!Array.isArray(list)) throw new Error("bad payload");
      return list;
    } catch (e) {
      console.log(`  ретрай ${attempt}/4 (${e.message})`);
      await sleep(1500 * attempt);
    }
  }
  return [];
}

async function main() {
  const ANIME = loadAnime();
  const ids = ANIME.map((a) => String(a.shikimoriID));
  const map = {};

  for (let i = 0; i < ids.length; i += 40) {
    const batch = ids.slice(i, i + 40);
    const list = await fetchFranchises(batch);
    for (const x of list) map[String(x.id)] = x.franchise || "";
    console.log(`Получено ${Object.keys(map).length}/${ids.length}`);
    await sleep(700); // вежливо к API
  }

  let filled = 0;
  for (const a of ANIME) {
    a.franchise = map[String(a.shikimoriID)] || "";
    if (a.franchise) filled++;
  }
  console.log(`Проставлено franchise: ${filled}/${ANIME.length}`);

  // Перезаписываем только массив ANIME, сохраняя заголовок и блок KODIK
  const raw = readFileSync(DATA, "utf8");
  const startIdx = raw.indexOf("const ANIME = [");
  const closeIdx = raw.indexOf("];", startIdx);
  if (startIdx < 0 || closeIdx < 0) throw new Error("Не нашёл массив ANIME в data.js");
  const header = raw.slice(0, startIdx);
  const footer = raw.slice(closeIdx + 2);
  const body = "const ANIME = " + JSON.stringify(ANIME, null, 2) + ";";
  writeFileSync(DATA, header + body + footer, "utf8");
  console.log("data.js обновлён.");
}

main();

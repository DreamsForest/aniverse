/* ============================================================
   Дополняет каталог недостающими частями уже добавленных франшиз:
   все сезоны + OVA/ONA/фильмы/спешлы (PV, музыку, рекламу пропускаем),
   которые есть в Kodik.

   Логика:
   1. для каждой франшизы из data.js берём состав с Shikimori
      (/api/animes/:id/franchise);
   2. новые id (которых нет в каталоге) обогащаем через GraphQL;
   3. оставляем подходящие kind и проверяем наличие в Kodik;
   4. дописываем в data.js (структура и блок KODIK сохраняются).

   ЗАПУСК:  node tools/expand-seasons.mjs
   Потом:   node tools/gen-seo.mjs (с SITE_URL).
   ============================================================ */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data.js");
const GQL = "https://shikimori.io/api/graphql";
const REST_HOSTS = ["shikimori.one", "shikimori.io"];
const UA = "AniVerse/1.0 (catalog builder)";
// Только сериалы и OVA/ONA — фильмы и спешлы (рекапы, picture-drama, старые
// фильмы Dragon Ball и т.п.) раздувают каталог мусором, их не берём.
const KINDS_OK = new Set(["tv", "ova", "ona"]);
const YEAR_MIN = Number(process.env.YEAR_MIN || 2005);
const PER_FRANCHISE = Number(process.env.PER_FRANCHISE || 12);
const DRY = process.env.DRY === "1";
const STATUS_MAP = { anons: "Анонс", ongoing: "Онгоинг", released: "Завершён" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadData() {
  const src = readFileSync(DATA, "utf8");
  const e = {};
  new Function("e", src + "\ne.ANIME=ANIME;e.KODIK_TOKEN=KODIK_TOKEN;e.KODIK_API=KODIK_API;")(e);
  return e;
}

function cleanDesc(s) {
  if (!s) return "";
  const t = s.replace(/\[\/?[a-zA-Z][^\]]*\]/g, "").replace(/\s+/g, " ").trim();
  return t.length > 420 ? t.slice(0, 419).replace(/\s+\S*$/, "") + "…" : t;
}

// Состав франшизы (id всех связанных работ)
async function franchiseNodes(id) {
  for (const host of REST_HOSTS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await fetch(`https://${host}/api/animes/${id}/franchise`, { headers: { "User-Agent": UA } });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const j = await r.json();
        if (Array.isArray(j.nodes)) return j.nodes;
        throw new Error("no nodes");
      } catch (e) {
        await sleep(900 * attempt);
      }
    }
  }
  return [];
}

// Детали пачки тайтлов
async function fetchDetails(ids) {
  const query = `{ animes(ids:"${ids.join(",")}", limit:${ids.length}){
    id russian name kind score status franchise
    airedOn { year } genres { russian } poster { mainUrl } description
  } }`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await fetch(GQL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": UA },
        body: JSON.stringify({ query })
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      if (!Array.isArray(j?.data?.animes)) throw new Error("bad payload");
      return j.data.animes;
    } catch (e) {
      await sleep(1500 * attempt);
    }
  }
  return [];
}

async function inKodik(id, token, api) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`${api}?token=${token}&shikimoriID=${id}`, { headers: { "User-Agent": UA } });
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
  const { ANIME, KODIK_TOKEN, KODIK_API } = loadData();
  const existing = new Set(ANIME.map((a) => String(a.shikimoriID)));
  // Франшизы, реально представленные в каталоге — добавляем только их части,
  // чтобы не тянуть левые кроссовер-франшизы (напр. VTuber-короткометражки umisea).
  const catalogFranchises = new Set(ANIME.map((a) => a.franchise).filter(Boolean));

  // По одному представителю на франшизу (иначе одиночный id)
  const reps = new Map();
  for (const a of ANIME) {
    const key = a.franchise ? "f:" + a.franchise : "id:" + a.shikimoriID;
    if (!reps.has(key)) reps.set(key, String(a.shikimoriID));
  }
  console.log(`Франшиз/групп для обхода: ${reps.size}`);

  // Собираем кандидатов
  const candidates = new Set();
  let done = 0;
  for (const repId of reps.values()) {
    const nodes = await franchiseNodes(repId);
    for (const n of nodes) {
      const nid = String(n.id);
      if (!existing.has(nid)) candidates.add(nid);
    }
    if (++done % 20 === 0) console.log(`  обойдено ${done}/${reps.size}, кандидатов: ${candidates.size}`);
    await sleep(450);
  }
  console.log(`Новых кандидатов всего: ${candidates.size}`);

  // Детали
  const ids = [...candidates];
  const details = [];
  for (let i = 0; i < ids.length; i += 40) {
    details.push(...(await fetchDetails(ids.slice(i, i + 40))));
    await sleep(700);
  }

  // Предфильтр: нужный kind, франшиза из каталога, есть постер/название,
  // год не старее YEAR_MIN, не рекап/пилот.
  let cand = details.filter(
    (d) =>
      KINDS_OK.has(d.kind) &&
      d.franchise &&
      catalogFranchises.has(d.franchise) &&
      d.russian &&
      d.poster?.mainUrl &&
      d.airedOn?.year &&
      d.airedOn.year >= YEAR_MIN &&
      !/\b(рекап|пилот)/i.test(d.russian)
  );
  // Сортируем по франшизе и году, ограничиваем число новых частей на франшизу
  cand.sort((a, b) => (a.franchise || "").localeCompare(b.franchise || "") || a.airedOn.year - b.airedOn.year);
  const perF = {};
  cand = cand.filter((d) => {
    const k = d.franchise || "id" + d.id;
    perF[k] = (perF[k] || 0) + 1;
    return perF[k] <= PER_FRANCHISE;
  });
  console.log(`После фильтра (kind tv/ova/ona, год ≥ ${YEAR_MIN}, ≤${PER_FRANCHISE}/франшизу): ${cand.length}`);

  if (DRY) {
    cand
      .sort((a, b) => (a.franchise || "").localeCompare(b.franchise || "") || a.airedOn.year - b.airedOn.year)
      .forEach((d) => console.log(`  ? ${d.russian} [${d.airedOn.year}] ${d.kind} f=${d.franchise} (${d.id})`));
    console.log(`\n[DRY] Записи нет. Кандидатов: ${cand.length}. Проверка Kodik пропущена.`);
    return;
  }

  // Проверка Kodik (берём только доступные к просмотру)
  const added = [];
  for (const d of cand) {
    const ok = await inKodik(d.id, KODIK_TOKEN, KODIK_API);
    process.stdout.write(ok ? "•" : "·");
    if (!ok) {
      await sleep(160);
      continue;
    }
    added.push({
      id: String(d.id),
      shikimoriID: Number(d.id),
      title: d.russian,
      original: d.name || "",
      year: d.airedOn?.year || null,
      genres: (d.genres || []).map((g) => g.russian).filter(Boolean).slice(0, 3),
      rating: d.score ? Number(d.score) : 0,
      status: STATUS_MAP[d.status] || "Завершён",
      poster: d.poster.mainUrl,
      description: cleanDesc(d.description),
      franchise: d.franchise || ""
    });
    await sleep(160);
  }

  console.log(`\nДобавляется (есть в Kodik): ${added.length}`);
  added.forEach((a) => console.log(`  + ${a.title} [${a.year}] (${a.id})`));
  if (!added.length) {
    console.log("Нечего добавлять.");
    return;
  }

  const merged = [...ANIME, ...added];
  const raw = readFileSync(DATA, "utf8");
  const startIdx = raw.indexOf("const ANIME = [");
  const closeIdx = raw.indexOf("];", startIdx);
  const header = raw.slice(0, startIdx);
  const footer = raw.slice(closeIdx + 2);
  writeFileSync(DATA, header + "const ANIME = " + JSON.stringify(merged, null, 2) + ";" + footer, "utf8");
  console.log(`data.js: было ${ANIME.length}, стало ${merged.length}.`);
}

main().catch((e) => {
  console.error("Ошибка:", e.message);
  process.exit(1);
});

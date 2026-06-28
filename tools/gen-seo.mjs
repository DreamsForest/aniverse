/* ============================================================
   Генератор SEO-страниц.
   На каждый тайтл создаёт реальную индексируемую страницу
   /anime/<id>/index.html с уникальными мета-тегами, текстом,
   Schema.org и рабочим плеером Kodik. Плюс sitemap.xml.

   ЗАПУСК:  SITE_URL=https://ваш-домен.ру node tools/gen-seo.mjs
   (если SITE_URL не задан — подставится https://example.com,
    потом нужно будет перегенерировать с реальным доменом)
   ============================================================ */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const SITE = (process.env.SITE_URL || "https://example.com").replace(/\/+$/, "");

// Грузим каталог из data.js
function loadData() {
  const src = readFileSync(join(ROOT, "data.js"), "utf8");
  const sandbox = {};
  new Function("e", src + "\ne.ANIME=ANIME;e.KODIK_TOKEN=KODIK_TOKEN;e.KODIK_API=KODIK_API;")(sandbox);
  return sandbox;
}

const esc = (s) =>
  String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const clip = (s, n) => {
  s = String(s || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s;
};

// Транслитерация кириллицы в латиницу для ЧПУ-адресов (/zhanr/romantika/ и т.п.)
const TRANSLIT = {
  а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",
  л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"c",
  ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya"
};
const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .split("")
    .map((ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch))
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

// Ключ франшизы: нормализуем romaji-название, выкидывая указатели сезонов/частей
// (2nd season, part, ova, римские цифры…), чтобы все сезоны тайтла попали в одну группу.
const FRANCHISE_STOP = new Set(["the", "final", "season", "part", "cour", "movie", "tv", "ova", "ona", "specials", "special"]);
const franchiseKey = (a) =>
  String(a.original || a.title || "")
    .toLowerCase()
    .replace(/[:\-–—!?,.()]/g, " ")
    .replace(/\b(\d+)(st|nd|rd|th)\b/g, " ")
    .replace(/\b(i{1,3}|iv|v|vi{0,3})\b/g, " ")
    .replace(/\s+\d+\s*$/, " ")
    .split(/\s+/)
    .filter((w) => w && !FRANCHISE_STOP.has(w))
    .join(" ")
    .trim();

// Карточка тайтла. hrefBase — относительный путь к папке anime/ от текущей страницы.
const cardHTML = (x, hrefBase) =>
  `<a class="card" href="${hrefBase}${x.id}/">
    <div class="poster" style="background:linear-gradient(135deg,#221a4d,#3a1d52)">
      ${x.poster ? `<img src="${esc(x.poster)}" alt="${esc(x.title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"/>` : ""}
      <div class="card-body"><h3 class="card-title">${esc(x.title)}</h3><div class="card-meta">${[x.year, (x.genres || [])[0]].filter(Boolean).join(" · ")}</div></div>
    </div>
  </a>`;

function pageHTML(a, all, KODIK_TOKEN, KODIK_API, landedGenres = new Set(), related = []) {
  const url = `${SITE}/anime/${a.id}/`;
  const metaTitle = `${a.title}${a.original ? " (" + a.original + ")" : ""} — смотреть онлайн | AniVerse`;
  const metaDesc =
    clip(a.description, 150) ||
    `Смотрите аниме «${a.title}» онлайн бесплатно в хорошем качестве на AniVerse.`;
  const genres = (a.genres || []).join(", ");

  const ld = {
    "@context": "https://schema.org",
    "@type": "TVSeries",
    name: a.title,
    alternateName: a.original || undefined,
    image: a.poster || undefined,
    description: clip(a.description, 400) || metaDesc,
    genre: a.genres || undefined,
    datePublished: a.year ? String(a.year) : undefined,
    inLanguage: "ru",
    url
  };

  const similar = all
    .filter((x) => x.id !== a.id && x.genres.some((g) => a.genres.includes(g)))
    .slice(0, 8)
    .map((x) => cardHTML(x, "../"))
    .join("");

  // Связанные сезоны/части той же франшизы (в хронологическом порядке)
  const seasons = related.length
    ? `<h2 class="section-title">Сезоны и связанные части</h2>
  <p class="title-desc">Другие части франшизы «${esc(a.title)}» — смотрите по порядку:</p>
  <div class="grid">${related.map((x) => cardHTML(x, "../")).join("")}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${esc(metaTitle)}</title>
<meta name="description" content="${esc(metaDesc)}"/>
<link rel="canonical" href="${url}"/>
<meta name="theme-color" content="#07060f"/>
<meta property="og:type" content="video.tv_show"/>
<meta property="og:title" content="${esc(a.title)} — смотреть онлайн"/>
<meta property="og:description" content="${esc(metaDesc)}"/>
<meta property="og:url" content="${url}"/>
${a.poster ? `<meta property="og:image" content="${esc(a.poster)}"/>` : ""}
<meta property="og:locale" content="ru_RU"/>
<meta name="twitter:card" content="summary_large_image"/>
<link rel="icon" href="../../favicon.svg" type="image/svg+xml"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://shikimori.io"/>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="../../styles.css"/>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
<div class="aurora"><span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span></div>
<header class="header glass">
  <a href="../../index.html" class="logo"><span class="logo-mark">◢◤</span><span class="logo-text">Ani<span>Verse</span></span></a>
  <nav class="nav"><a href="../../index.html" class="nav-link">Главная</a><a href="../../index.html#/catalog" class="nav-link">Каталог</a></nav>
</header>
<main>
  <a class="back-link" href="../../index.html#/catalog">← В каталог</a>
  <article class="title-banner">
    <div class="title-poster" style="background:linear-gradient(135deg,#1c1740,#34184a)">
      ${a.poster ? `<img src="${esc(a.poster)}" alt="${esc(a.title)}" referrerpolicy="no-referrer" onerror="this.remove()"/>` : esc(a.title)}
    </div>
    <div class="title-info">
      <h1>${esc(a.title)} — смотреть онлайн</h1>
      <p class="title-original">${esc(a.original)}</p>
      <div class="meta-row">
        ${a.rating > 0 ? `<span class="meta-pill star">★ ${a.rating.toFixed(1)}</span>` : ""}
        ${a.year ? `<span class="meta-pill">${a.year}</span>` : ""}
        <span class="meta-pill">${esc(a.status)}</span>
        ${(a.genres || []).map((g) => landedGenres.has(g)
          ? `<a class="meta-pill" href="../../zhanr/${slugify(g)}/">${esc(g)}</a>`
          : `<span class="meta-pill">${esc(g)}</span>`).join("")}
      </div>
      <p class="title-desc">${esc(a.description)}</p>
    </div>
  </article>

  <h2 class="section-title">Смотреть «${esc(a.title)}» онлайн</h2>
  <div class="player-wrap" id="player">
    <div class="player-loading"><div class="spinner"></div><p>Загружаем плеер…</p></div>
  </div>

  ${seasons}

  ${similar ? `<h2 class="section-title">Похожие аниме</h2><div class="grid">${similar}</div>` : ""}
</main>
<footer class="footer">
  <p>AniVerse — каталог аниме онлайн. Видео предоставляет внешний плеер Kodik.</p>
</footer>
<script>
(async function(){
  try{
    var r = await fetch("${KODIK_API}?token=${KODIK_TOKEN}&shikimoriID=${a.shikimoriID}");
    var d = await r.json();
    var box = document.getElementById("player");
    if(d.found && d.allowed===1 && d.link){
      var link = "https:" + d.link.replace(/^https?:/, "");
      box.innerHTML = '<iframe src="'+link+'" allow="autoplay; fullscreen; encrypted-media" allowfullscreen referrerpolicy="no-referrer"></iframe>';
      try{
        var h = JSON.parse(localStorage.getItem("aniverse:history")||"[]").filter(function(x){return x!=="${a.id}";});
        h.unshift("${a.id}"); localStorage.setItem("aniverse:history", JSON.stringify(h.slice(0,12)));
      }catch(e){}
    } else {
      box.innerHTML = '<div class="player-loading"><div class="big">😕</div><p>Сейчас недоступно для просмотра</p></div>';
    }
  }catch(e){
    document.getElementById("player").innerHTML = '<div class="player-loading"><div class="big">😕</div><p>Не удалось загрузить плеер</p></div>';
  }
})();
</script>
<div id="ad-bottom" class="ad-bar"><button class="ad-bar-close" aria-label="Закрыть">×</button><div class="ad-bar-inner"></div></div>
<script src="../../ads.js"></script>
</body>
</html>`;
}

/* ------------------------------------------------------------------
   Лендинг-страница категории (жанр / год / подборка).
   path — путь без слешей по краям, напр. "zhanr/romantika" или "god/2026".
   ------------------------------------------------------------------ */
function landingHTML({ path, h1, metaTitle, metaDesc, intro, items, related }) {
  const depth = path.split("/").filter(Boolean).length;
  const up = "../".repeat(depth);
  const url = `${SITE}/${path}/`;
  const grid = items.map((x) => cardHTML(x, up + "anime/")).join("");
  const nav = related
    .map((r) => `<a class="meta-pill" href="${up}${r.path}/">${esc(r.label)}</a>`)
    .join("");

  const ld = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: metaTitle,
    url,
    inLanguage: "ru",
    description: metaDesc,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: items.length,
      itemListElement: items.slice(0, 30).map((x, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE}/anime/${x.id}/`,
        name: x.title
      }))
    }
  };

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${esc(metaTitle)}</title>
<meta name="description" content="${esc(metaDesc)}"/>
<link rel="canonical" href="${url}"/>
<meta name="theme-color" content="#07060f"/>
<meta property="og:type" content="website"/>
<meta property="og:title" content="${esc(metaTitle)}"/>
<meta property="og:description" content="${esc(metaDesc)}"/>
<meta property="og:url" content="${url}"/>
<meta property="og:locale" content="ru_RU"/>
<link rel="icon" href="${up}favicon.svg" type="image/svg+xml"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://shikimori.io"/>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="${up}styles.css"/>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
<div class="aurora"><span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span></div>
<header class="header glass">
  <a href="${up}index.html" class="logo"><span class="logo-mark">◢◤</span><span class="logo-text">Ani<span>Verse</span></span></a>
  <nav class="nav"><a href="${up}index.html" class="nav-link">Главная</a><a href="${up}index.html#/catalog" class="nav-link">Каталог</a></nav>
</header>
<main>
  <a class="back-link" href="${up}index.html#/catalog">← В каталог</a>
  <h1>${esc(h1)}</h1>
  <p class="title-desc">${esc(intro)}</p>
  <div class="grid">${grid}</div>
  ${nav ? `<h2 class="section-title">Смотреть по категориям</h2><div class="meta-row">${nav}</div>` : ""}
</main>
<footer class="footer">
  <p>AniVerse — каталог аниме онлайн. Видео предоставляет внешний плеер Kodik.</p>
</footer>
<div id="ad-bottom" class="ad-bar"><button class="ad-bar-close" aria-label="Закрыть">×</button><div class="ad-bar-inner"></div></div>
<script src="${up}ads.js"></script>
</body>
</html>`;
}

function main() {
  const { ANIME, KODIK_TOKEN, KODIK_API } = loadData();
  if (SITE.includes("example.com")) {
    console.log("⚠  SITE_URL не задан — использую https://example.com.");
    console.log("   Для боевого SEO запусти:  SITE_URL=https://ваш-домен node tools/gen-seo.mjs\n");
  }

  // ---- Категории для лендингов (считаем до генерации страниц тайтлов,
  //      чтобы ссылки на жанры вели только на существующие лендинги) ----
  const GENRE_MIN = 6; // не плодим тонкие страницы из 1–2 тайтлов
  const YEAR_MIN = 6;
  const byRating = (a, b) => (b.rating || 0) - (a.rating || 0);

  const genreCounts = {};
  for (const a of ANIME) for (const g of a.genres || []) genreCounts[g] = (genreCounts[g] || 0) + 1;
  const genres = Object.keys(genreCounts)
    .filter((g) => genreCounts[g] >= GENRE_MIN)
    .sort((a, b) => genreCounts[b] - genreCounts[a]);
  const landedGenres = new Set(genres); // у этих жанров есть лендинг → можно ссылаться

  // Франшизы: группируем сезоны/части одного тайтла для блока «Связанные сезоны».
  // Основной ключ — поле franchise из Shikimori (надёжно ловит сезоны с собственными
  // подзаголовками). Если его нет — откатываемся на нормализованное название.
  const franchiseGroups = {};
  for (const a of ANIME) {
    const k = a.franchise ? `f:${a.franchise}` : franchiseKey(a) ? `k:${franchiseKey(a)}` : "";
    if (k) (franchiseGroups[k] = franchiseGroups[k] || []).push(a);
  }
  const relatedById = {};
  for (const list of Object.values(franchiseGroups)) {
    if (list.length < 2) continue;
    const sorted = [...list].sort(
      (a, b) => (a.year || 0) - (b.year || 0) || String(a.title).localeCompare(String(b.title), "ru")
    );
    for (const a of sorted) relatedById[a.id] = sorted.filter((x) => x.id !== a.id);
  }

  let count = 0;
  for (const a of ANIME) {
    const dir = join(ROOT, "anime", String(a.id));
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "index.html"),
      pageHTML(a, ANIME, KODIK_TOKEN, KODIK_API, landedGenres, relatedById[a.id] || []),
      "utf8"
    );
    count++;
  }

  // ---- Лендинги категорий: жанры, годы, топ рейтинга ----
  // Ловят частотные запросы («аниме романтика», «аниме 2026», «топ аниме»)
  // и связывают каталог внутренними ссылками.
  const yearCounts = {};
  for (const a of ANIME) if (a.year) yearCounts[a.year] = (yearCounts[a.year] || 0) + 1;
  const years = Object.keys(yearCounts)
    .filter((y) => yearCounts[y] >= YEAR_MIN)
    .sort((a, b) => Number(b) - Number(a));

  const relGenres = genres.map((g) => ({ path: `zhanr/${slugify(g)}`, label: g }));
  const relYears = years.map((y) => ({ path: `god/${y}`, label: `Аниме ${y}` }));
  const relTop = { path: "reyting/top", label: "Топ по рейтингу" };

  const landings = [];
  const writeLanding = (opts, pri) => {
    const dir = join(ROOT, ...opts.path.split("/"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), landingHTML(opts), "utf8");
    landings.push({ loc: `${SITE}/${opts.path}/`, pri });
  };

  for (const g of genres) {
    const items = ANIME.filter((a) => (a.genres || []).includes(g)).sort(byRating);
    writeLanding(
      {
        path: `zhanr/${slugify(g)}`,
        h1: `Аниме жанра «${g}»`,
        metaTitle: `Аниме жанра ${g} — смотреть онлайн бесплатно | AniVerse`,
        metaDesc: `Смотреть аниме в жанре ${g} онлайн бесплатно в хорошем качестве. ${items.length} тайтлов: новинки и популярная классика на AniVerse.`,
        intro: `Подборка аниме в жанре «${g}» — ${items.length} тайтлов, отсортированных по рейтингу. Смотрите онлайн бесплатно в HD с озвучкой и субтитрами.`,
        items,
        related: [...relGenres.filter((r) => r.label !== g).slice(0, 12), relTop]
      },
      "0.7"
    );
  }

  for (const y of years) {
    const items = ANIME.filter((a) => String(a.year) === String(y)).sort(byRating);
    writeLanding(
      {
        path: `god/${y}`,
        h1: `Аниме ${y} года`,
        metaTitle: `Аниме ${y} — смотреть онлайн бесплатно | AniVerse`,
        metaDesc: `Аниме ${y} года: ${items.length} тайтлов онлайн бесплатно в хорошем качестве. Лучшие сериалы и фильмы ${y} на AniVerse.`,
        intro: `Аниме ${y} года — ${items.length} тайтлов по рейтингу. Новинки и хиты сезона, смотрите онлайн бесплатно в HD.`,
        items,
        related: [...relYears.filter((r) => r.label !== `Аниме ${y}`).slice(0, 12), ...relGenres.slice(0, 6), relTop]
      },
      "0.7"
    );
  }

  {
    const items = [...ANIME].sort(byRating).slice(0, 30);
    writeLanding(
      {
        path: "reyting/top",
        h1: "Топ аниме по рейтингу",
        metaTitle: "Топ аниме — лучшие тайтлы по рейтингу смотреть онлайн | AniVerse",
        metaDesc: "Топ лучших аниме по рейтингу: смотрите самые высоко оценённые сериалы и фильмы онлайн бесплатно в HD на AniVerse.",
        intro: "Рейтинг лучших аниме каталога — 30 тайтлов с самой высокой оценкой. Смотрите онлайн бесплатно в хорошем качестве.",
        items,
        related: [...relGenres.slice(0, 12), ...relYears.slice(0, 6)]
      },
      "0.7"
    );
  }

  // sitemap.xml
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${SITE}/`, pri: "1.0" },
    ...landings,
    ...ANIME.map((a) => ({ loc: `${SITE}/anime/${a.id}/`, pri: "0.8" }))
  ];
  const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.pri}</priority></url>`
      )
      .join("\n") +
    `\n</urlset>\n`;
  writeFileSync(join(ROOT, "sitemap.xml"), sitemap, "utf8");

  // robots.txt с актуальным доменом
  writeFileSync(
    join(ROOT, "robots.txt"),
    `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`,
    "utf8"
  );

  // Проставляем домен в index.html (canonical / og:url / og:image / Schema.org).
  // Заменяем ВСЕ вхождения текущего домена (берём из canonical), а не только example.com,
  // иначе при смене домена index.html останется со старым адресом.
  if (!SITE.includes("example.com")) {
    const idxPath = join(ROOT, "index.html");
    let idx = readFileSync(idxPath, "utf8");
    const m = idx.match(/<link\s+rel="canonical"\s+href="(https?:\/\/[^/"]+)/i);
    const current = m && m[1];
    if (current && current !== SITE) idx = idx.split(current).join(SITE);
    idx = idx.replace(/https:\/\/example\.com/g, SITE);
    writeFileSync(idxPath, idx, "utf8");
    console.log(`index.html: домен обновлён → ${SITE}`);
  }

  console.log(`Страниц тайтлов: ${count}`);
  console.log(`Лендингов категорий: ${landings.length} (жанры: ${genres.length}, годы: ${years.length}, топ: 1)`);
  console.log(`sitemap.xml: ${urls.length} URL`);
  console.log(`Домен: ${SITE}`);
}

main();

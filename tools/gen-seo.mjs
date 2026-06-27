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

function pageHTML(a, all, KODIK_TOKEN, KODIK_API) {
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
    .map(
      (x) =>
        `<a class="card" href="../${x.id}/index.html"><div class="poster" style="background:linear-gradient(135deg,#221a4d,#3a1d52)">
          ${x.poster ? `<img src="${esc(x.poster)}" alt="${esc(x.title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"/>` : ""}
          <div class="card-body"><h3 class="card-title">${esc(x.title)}</h3><div class="card-meta">${[x.year, x.genres[0]].filter(Boolean).join(" · ")}</div></div>
        </div></a>`
    )
    .join("");

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
        ${(a.genres || []).map((g) => `<span class="meta-pill">${esc(g)}</span>`).join("")}
      </div>
      <p class="title-desc">${esc(a.description)}</p>
    </div>
  </article>

  <h2 class="section-title">Смотреть «${esc(a.title)}» онлайн</h2>
  <div class="player-wrap" id="player">
    <div class="player-loading"><div class="spinner"></div><p>Загружаем плеер…</p></div>
  </div>

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
</body>
</html>`;
}

function main() {
  const { ANIME, KODIK_TOKEN, KODIK_API } = loadData();
  if (SITE.includes("example.com")) {
    console.log("⚠  SITE_URL не задан — использую https://example.com.");
    console.log("   Для боевого SEO запусти:  SITE_URL=https://ваш-домен node tools/gen-seo.mjs\n");
  }

  let count = 0;
  for (const a of ANIME) {
    const dir = join(ROOT, "anime", String(a.id));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), pageHTML(a, ANIME, KODIK_TOKEN, KODIK_API), "utf8");
    count++;
  }

  // sitemap.xml
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${SITE}/`, pri: "1.0" },
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

  // Проставляем домен в index.html (canonical / og:url / Schema.org)
  if (!SITE.includes("example.com")) {
    const idxPath = join(ROOT, "index.html");
    const idx = readFileSync(idxPath, "utf8").replace(/https:\/\/example\.com/g, SITE);
    writeFileSync(idxPath, idx, "utf8");
    console.log("index.html: домен обновлён");
  }

  console.log(`Сгенерировано страниц: ${count}`);
  console.log(`sitemap.xml: ${urls.length} URL`);
  console.log(`Домен: ${SITE}`);
}

main();

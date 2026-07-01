/* ============================================================
   AniVerse — клиентское приложение (без бэкенда).
   Видео отдаёт Kodik по shikimoriID (см. data.js).
   Роутинг по hash:
     #/                — главная
     #/catalog         — каталог
     #/title/:id       — страница тайтла
     #/watch/:id       — просмотр (встраиваем плеер Kodik)
   ============================================================ */

const app = document.getElementById("app");
const searchInput = document.getElementById("searchInput");

/* ---------- Утилиты ---------- */
const byId = (id) => ANIME.find((a) => a.id === id);

// Детерминированный градиент для постера-заглушки по id
function gradientFor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${h} 70% 22%), hsl(${(h + 60) % 360} 75% 30%))`;
}

function posterHTML(a) {
  if (a.poster)
    return `<img src="${a.poster}" alt="${escapeAttr(a.title)}" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add('loaded')" onerror="this.remove()" />`;
  return `<div class="poster-fallback">${a.title}</div>`;
}

function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}

/* ---------- Kodik ---------- */
// Возвращает ссылку на плеер по shikimoriID или null
async function fetchKodikLink(shikimoriID) {
  const url = `${KODIK_API}?token=${encodeURIComponent(KODIK_TOKEN)}&shikimoriID=${encodeURIComponent(shikimoriID)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("network");
  const data = await res.json();
  if (!data.found || data.allowed !== 1 || !data.link) return null;
  // link приходит как //kodikplayer.com/... — принудительно ставим https,
  // чтобы работало и локально (file://), и на хостинге.
  return "https:" + data.link.replace(/^https?:/, "");
}

/* ---------- Компоненты ---------- */
function cardHTML(a) {
  // Ссылка на реальную SEO-страницу (index.html указан явно — чтобы открывалось
  // и через file:// локально, и на хостинге)
  return `
    <a class="card" href="anime/${a.id}/index.html">
      <div class="poster" style="background:${gradientFor(a.id)}">
        <span class="status-tag${a.isNew ? " new" : ""}">${a.isNew ? "NEW" : a.status}</span>
        ${a.rating > 0 ? `<span class="rating">★ ${a.rating.toFixed(1)}</span>` : ""}
        ${posterHTML(a)}
        <div class="card-body">
          <h3 class="card-title">${a.title}</h3>
          <div class="card-meta">${[a.year, a.genres[0]].filter(Boolean).join(" · ")}</div>
        </div>
      </div>
    </a>`;
}

function gridHTML(list) {
  if (!list.length) {
    return `<div class="empty"><div class="big">🔍</div><p>Ничего не найдено. Попробуйте изменить запрос.</p></div>`;
  }
  return `<div class="grid">${list.map(cardHTML).join("")}</div>`;
}

// Сетка каталога с рекламой: нативная карточка ближе к началу + рекламные
// ряды-баннеры, повторяющиеся через каждые AD_EVERY карточек (чтобы при
// прокрутке большого каталога реклама встречалась не один раз).
// Слоты скрыты, пока ads.js не подгрузит в них рекламу.
const AD_EVERY = 18; // рекламный ряд после каждых N карточек
function catalogGridHTML(list) {
  if (!list.length) return gridHTML(list);
  const cards = list.map(cardHTML);
  const out = [];
  cards.forEach((card, i) => {
    out.push(card);
    // после каждых AD_EVERY карточек (кроме самого конца сетки) — баннер-ряд
    if ((i + 1) % AD_EVERY === 0 && i + 1 < cards.length) {
      out.push(`<div class="ad-slot ad-row" data-ad="in-content"></div>`);
    }
  });
  // нативная карточка ближе к началу сетки (первый рекламный ряд идёт позже)
  if (out.length > 6) out.splice(6, 0, `<div class="ad-card" data-ad="native"></div>`);
  return `<div class="grid">${out.join("")}</div>`;
}

/* Все жанры из каталога */
function allGenres() {
  const set = new Set();
  ANIME.forEach((a) => a.genres.forEach((g) => set.add(g)));
  return ["Все", ...[...set].sort()];
}

/* ---------- История просмотров (localStorage) ---------- */
const HISTORY_KEY = "aniverse:history";

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function pushHistory(id) {
  let h = getHistory().filter((x) => x !== id);
  h.unshift(id);
  h = h.slice(0, 12);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  } catch {}
}

function historyAnime() {
  return getHistory().map(byId).filter(Boolean);
}

/* ---------- Состояние фильтров и сортировки ---------- */
let activeGenre = "Все";
let query = "";
let sortBy = "popular"; // popular | rating | year | title

const SORTS = {
  popular: { label: "По популярности", fn: null }, // исходный порядок (популярность)
  rating: { label: "По рейтингу", fn: (a, b) => b.rating - a.rating },
  year: { label: "По году (новые)", fn: (a, b) => (b.year || 0) - (a.year || 0) },
  title: { label: "По названию", fn: (a, b) => a.title.localeCompare(b.title, "ru") }
};

function filtered() {
  let list = ANIME.filter((a) => {
    const okGenre = activeGenre === "Все" || a.genres.includes(activeGenre);
    const q = query.trim().toLowerCase();
    const okQuery =
      !q ||
      a.title.toLowerCase().includes(q) ||
      (a.original || "").toLowerCase().includes(q) ||
      a.genres.some((g) => g.toLowerCase().includes(q));
    return okGenre && okQuery;
  });
  const sorter = SORTS[sortBy]?.fn;
  if (sorter) list = [...list].sort(sorter);
  return list;
}

/* ---------- Страницы ---------- */
function renderHome() {
  const fresh = ANIME.filter((a) => a.isNew);
  const popular = ANIME.filter((a) => !a.isNew);
  const featured = popular[0] || ANIME[0]; // самый популярный
  const trending = popular.slice(0, 12);
  const topRated = [...ANIME].filter((a) => a.rating > 0).sort((a, b) => b.rating - a.rating).slice(0, 12);
  const ongoing = ANIME.filter((a) => a.status === "Онгоинг" && !a.isNew).slice(0, 12);
  const history = historyAnime();

  app.className = "fade";
  app.innerHTML = `
    <section class="hero">
      <span class="hero-badge">🔥 В топе сейчас</span>
      <h1>${featured.title}</h1>
      <p>${featured.description}</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="anime/${featured.id}/index.html">▶ Смотреть</a>
        <a class="btn btn-ghost" href="anime/${featured.id}/index.html">Подробнее</a>
      </div>
    </section>

    ${history.length ? `<h2 class="section-title">Продолжить просмотр</h2>${gridHTML(history)}` : ""}

    ${fresh.length ? `<h2 class="section-title">✦ Новинки 2026</h2>${gridHTML(fresh.slice(0, 18))}` : ""}

    <div class="ad-slot" data-ad="in-content"></div>

    <h2 class="section-title">Популярное</h2>
    ${gridHTML(trending)}

    <h2 class="section-title">Высокий рейтинг</h2>
    ${gridHTML(topRated)}

    ${ongoing.length ? `<h2 class="section-title">Онгоинги</h2>${gridHTML(ongoing)}` : ""}
  `;
}

function renderCatalog() {
  const chips = allGenres()
    .map(
      (g) =>
        `<button class="chip ${g === activeGenre ? "active" : ""}" data-genre="${escapeAttr(g)}">${g}</button>`
    )
    .join("");

  const sortOptions = Object.entries(SORTS)
    .map(([k, v]) => `<option value="${k}" ${k === sortBy ? "selected" : ""}>${v.label}</option>`)
    .join("");

  app.className = "fade";
  app.innerHTML = `
    <div class="catalog-head">
      <h2 class="section-title" style="margin:0">Каталог аниме</h2>
      <select id="sortSelect" class="sort-select">${sortOptions}</select>
    </div>
    <div class="chips">${chips}</div>
    <div id="catalogGrid">${catalogGridHTML(filtered())}</div>
  `;

  const rerender = () => {
    document.getElementById("catalogGrid").innerHTML = catalogGridHTML(filtered());
  };

  app.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      activeGenre = chip.dataset.genre;
      app.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
      rerender();
    });
  });

  document.getElementById("sortSelect").addEventListener("change", (e) => {
    sortBy = e.target.value;
    rerender();
  });
}

function renderTitle(id) {
  const a = byId(id);
  if (!a) return renderNotFound();

  app.className = "fade";
  app.innerHTML = `
    <a class="back-link" href="#/catalog">← Назад в каталог</a>
    <section class="title-banner">
      <div class="title-poster" style="background:${gradientFor(a.id)}">${posterHTML(a)}</div>
      <div class="title-info">
        <h1>${a.title}</h1>
        <p class="title-original">${a.original || ""}</p>
        <div class="meta-row">
          <span class="meta-pill star">★ ${a.rating.toFixed(1)}</span>
          ${a.year ? `<span class="meta-pill">${a.year}</span>` : ""}
          <span class="meta-pill">${a.status}</span>
          ${a.genres.map((g) => `<span class="meta-pill">${g}</span>`).join("")}
        </div>
        <p class="title-desc">${a.description}</p>
        <a class="btn btn-primary" href="#/watch/${a.id}">▶ Смотреть</a>
      </div>
    </section>

    <div id="comments-root" data-anime-id="${escapeAttr(a.id)}"></div>
  `;

  // Подключаем комментарии (виджет из comments.js)
  if (window.AniComments) window.AniComments.mount(document.getElementById("comments-root"));
}

async function renderWatch(id) {
  const a = byId(id);
  if (!a) return renderNotFound();

  // Каркас со скелетоном плеера
  app.className = "fade";
  app.innerHTML = `
    <a class="back-link" href="#/title/${a.id}">← ${a.title}</a>
    <div class="player-wrap" id="playerWrap">
      <div class="player-loading">
        <div class="spinner"></div>
        <p>Загружаем плеер…</p>
      </div>
    </div>
    <h2 class="section-title">${a.title}</h2>
    <p class="title-desc">${a.description}</p>
  `;
  window.scrollTo({ top: 0, behavior: "smooth" });

  const wrap = document.getElementById("playerWrap");
  try {
    const link = await fetchKodikLink(a.shikimoriID);
    // Пользователь мог уйти на другую страницу, пока грузилось
    if (location.hash !== `#/watch/${a.id}`) return;
    if (!link) {
      wrap.innerHTML = playerError(
        "Это аниме недоступно для просмотра",
        "Возможно, оно заблокировано в вашем регионе или ещё не добавлено в плеер."
      );
      return;
    }
    wrap.innerHTML = `<iframe src="${link}" allow="autoplay; fullscreen; encrypted-media" allowfullscreen referrerpolicy="no-referrer"></iframe>`;
    pushHistory(a.id);
  } catch (e) {
    if (location.hash !== `#/watch/${a.id}`) return;
    wrap.innerHTML = playerError(
      "Не удалось загрузить плеер",
      "Проверьте подключение к интернету и попробуйте обновить страницу."
    );
  }
}

function playerError(title, text) {
  return `<div class="player-loading"><div class="big">😕</div><p><b>${title}</b></p><p style="opacity:.7">${text}</p></div>`;
}

function renderNotFound() {
  app.className = "fade";
  app.innerHTML = `<div class="empty"><div class="big">👾</div><p>Страница не найдена.</p><a class="btn btn-primary" href="#/">На главную</a></div>`;
}

/* ---------- Роутер ---------- */
function setActiveNav(name) {
  document.querySelectorAll(".nav-link").forEach((l) =>
    l.classList.toggle("active", l.dataset.nav === name)
  );
}

function router() {
  const hash = location.hash.replace(/^#\/?/, "");
  const parts = hash.split("/").filter(Boolean);

  if (parts.length === 0) {
    setActiveNav("home");
    return renderHome();
  }
  if (parts[0] === "catalog") {
    setActiveNav("catalog");
    return renderCatalog();
  }
  if (parts[0] === "title" && parts[1]) {
    setActiveNav("");
    return renderTitle(parts[1]);
  }
  if (parts[0] === "watch" && parts[1]) {
    setActiveNav("");
    return renderWatch(parts[1]);
  }
  renderNotFound();
}

/* ---------- Поиск (всегда ведёт в каталог) ---------- */
searchInput.addEventListener("input", (e) => {
  query = e.target.value;
  if (!location.hash.startsWith("#/catalog")) {
    location.hash = "#/catalog";
  } else {
    const grid = document.getElementById("catalogGrid");
    if (grid) grid.innerHTML = gridHTML(filtered());
  }
});

window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", router);
router();

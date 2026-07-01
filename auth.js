/* ============================================================
   AniToki — авторизация (клиент).
   Подключается на всех страницах. Делает:
     • кнопку аккаунта в шапке (вход / имя пользователя / выход),
     • модалку входа и регистрации + повторная отправка письма,
     • глобальный объект window.AniAuth для других скриптов
       (комментарии, админка).
   Все запросы идут на /api/* того же домена (куки HttpOnly).
   ============================================================ */
(function () {
  "use strict";

  const API_BASE = "/api";
  const isFile = location.protocol === "file:";
  let currentUser = null;
  const listeners = new Set();

  /* ---------- сетевой помощник ---------- */
  async function api(path, opts = {}) {
    if (isFile) return { ok: false, data: { error: "API недоступен при открытии файла напрямую." } };
    const init = { method: opts.method || "GET", credentials: "same-origin", headers: {} };
    if (opts.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
    let res, data = {};
    try {
      res = await fetch(API_BASE + path, init);
      try { data = await res.json(); } catch {}
    } catch (e) {
      return { ok: false, data: { error: "Нет связи с сервером." } };
    }
    return { ok: res.ok && data.ok !== false, status: res.status, data };
  }

  /* ---------- состояние ---------- */
  function setUser(u) {
    currentUser = u;
    listeners.forEach((fn) => { try { fn(currentUser); } catch {} });
    renderAccount();
  }
  function onChange(fn) { listeners.add(fn); if (currentUser !== undefined) fn(currentUser); return () => listeners.delete(fn); }

  async function refresh() {
    const { ok, data } = await api("/auth/me");
    setUser(ok ? data.user : null);
    return currentUser;
  }

  /* ---------- утилиты UI ---------- */
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // бейдж уровня аккаунта (число слева от ника; цвет/эмблема меняется каждые 5 ур.)
  function lvlBadge(level, tier) {
    level = Number(level) || 0;
    if (level < 1) return "";
    const t = (((Number(tier) || 1) - 1) % 6) + 1;
    return `<span class="lvl-badge lvl-t${t}" title="Уровень ${level}">${level}</span>`;
  }

  let toastTimer;
  function toast(msg, type = "info") {
    let box = document.getElementById("ani-toast");
    if (!box) { box = el(`<div id="ani-toast" class="ani-toast"></div>`); document.body.appendChild(box); }
    box.textContent = msg;
    box.className = "ani-toast show " + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.className = "ani-toast"; }, 4000);
  }

  /* ---------- шапка: кнопка аккаунта ---------- */
  function renderAccount() {
    const header = document.querySelector(".header");
    if (!header) return;
    let slot = header.querySelector(".account");
    if (!slot) { slot = el(`<div class="account"></div>`); header.appendChild(slot); }
    // на страницах без поиска (статические/лендинги) прижимаем меню+аккаунт вправо
    const nav = header.querySelector(".nav");
    if (nav && !header.querySelector(".search")) nav.style.marginLeft = "auto";

    if (!currentUser) {
      slot.innerHTML = `<button class="btn-acc" id="ani-login-btn">Войти</button>`;
      slot.querySelector("#ani-login-btn").onclick = () => openModal("login");
      return;
    }

    const adminLink = currentUser.role === "admin"
      ? `<a class="acc-item" href="${adminHref()}">🛡 Админка</a>` : "";
    const warn = currentUser.muted
      ? `<div class="acc-item warn">Мут до ${new Date(currentUser.mutedUntil).toLocaleDateString("ru-RU")}</div>` : "";
    slot.innerHTML = `
      <div class="acc-menu">
        <button class="btn-acc" id="ani-acc-btn">
          <span class="acc-ava">${esc(currentUser.username.slice(0, 1).toUpperCase())}</span>
          ${lvlBadge(currentUser.level, currentUser.tier)}
          <span class="acc-name">${esc(currentUser.username)}</span>
        </button>
        <div class="acc-drop" id="ani-acc-drop" hidden>
          ${adminLink}
          ${warn}
          <button class="acc-item" id="ani-logout">Выйти</button>
        </div>
      </div>`;
    const btn = slot.querySelector("#ani-acc-btn");
    const drop = slot.querySelector("#ani-acc-drop");
    btn.onclick = (e) => { e.stopPropagation(); drop.hidden = !drop.hidden; };
    document.addEventListener("click", () => { if (drop) drop.hidden = true; });
    slot.querySelector("#ani-logout").onclick = async () => {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
      toast("Вы вышли из аккаунта.");
    };
  }

  // путь к admin.html в зависимости от глубины страницы
  function adminHref() {
    const depth = location.pathname.replace(/\/[^/]*$/, "/").split("/").filter(Boolean).length;
    // на статических страницах /anime/<id>/ глубина 2; в корне 0
    const segs = location.pathname.split("/").filter(Boolean);
    // если последний сегмент — файл (index.html), не считаем его за папку
    const dirDepth = /\.[a-z0-9]+$/i.test(segs[segs.length - 1] || "") ? segs.length - 1 : segs.length;
    return "../".repeat(dirDepth) + "admin.html";
  }

  /* ---------- модалка входа/регистрации ---------- */
  let modal;
  let resetToken = "";
  function openModal(tab = "login") {
    if (isFile) { toast("Авторизация работает только на опубликованном сайте.", "error"); return; }
    closeModal();
    modal = el(`
      <div class="ani-modal-bg">
        <div class="ani-modal" role="dialog" aria-modal="true">
          <button class="ani-modal-x" aria-label="Закрыть">×</button>
          <div class="ani-tabs">
            <button data-tab="login" class="ani-tab">Вход</button>
            <button data-tab="register" class="ani-tab">Регистрация</button>
          </div>
          <div class="ani-modal-body"></div>
        </div>
      </div>`);
    document.body.appendChild(modal);
    modal.querySelector(".ani-modal-x").onclick = closeModal;
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
    modal.querySelectorAll(".ani-tab").forEach((t) => {
      t.onclick = () => showTab(t.dataset.tab);
    });
    showTab(tab);
  }
  function closeModal() { if (modal) { modal.remove(); modal = null; } }

  function showTab(tab) {
    if (!modal) return;
    // вкладки видны только для login/register; forgot/reset — без переключателя
    const withTabs = tab === "login" || tab === "register";
    const tabsRow = modal.querySelector(".ani-tabs");
    if (tabsRow) tabsRow.hidden = !withTabs;
    modal.querySelectorAll(".ani-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
    const body = modal.querySelector(".ani-modal-body");
    if (tab === "register") { body.innerHTML = registerForm(); bindRegister(body); }
    else if (tab === "forgot") { body.innerHTML = forgotForm(); bindForgot(body); }
    else if (tab === "reset") { body.innerHTML = resetForm(); bindReset(body); }
    else { body.innerHTML = loginForm(); bindLogin(body); }
  }

  function loginForm() {
    return `
      <form class="ani-form" novalidate>
        <label>Email<input type="email" name="email" autocomplete="email" required></label>
        <label>Пароль<input type="password" name="password" autocomplete="current-password" required></label>
        <button class="btn btn-primary" type="submit">Войти</button>
        <p class="ani-form-msg"></p>
        <p class="ani-form-alt">
          <a href="#" data-act="forgot">Забыли пароль?</a>
          <span class="ani-dot">·</span>
          <a href="#" data-act="resend">Не пришло письмо подтверждения?</a>
        </p>
      </form>`;
  }
  function forgotForm() {
    return `
      <form class="ani-form" novalidate>
        <p class="ani-form-lead">Укажите email аккаунта — пришлём ссылку для смены пароля.</p>
        <label>Email<input type="email" name="email" autocomplete="email" required></label>
        <button class="btn btn-primary" type="submit">Прислать ссылку</button>
        <p class="ani-form-msg"></p>
        <p class="ani-form-alt"><a href="#" data-act="tologin">← Вернуться ко входу</a></p>
      </form>`;
  }
  function resetForm() {
    return `
      <form class="ani-form" novalidate>
        <p class="ani-form-lead">Придумайте новый пароль для аккаунта.</p>
        <label>Новый пароль<input type="password" name="password" autocomplete="new-password" required>
          <small class="ani-hint">Минимум 8 символов.</small></label>
        <button class="btn btn-primary" type="submit">Сохранить пароль</button>
        <p class="ani-form-msg"></p>
      </form>`;
  }
  function registerForm() {
    return `
      <form class="ani-form" novalidate>
        <label>Имя пользователя<input type="text" name="username" autocomplete="username" required></label>
        <label>Email<input type="email" name="email" autocomplete="email" required></label>
        <label>Пароль<input type="password" name="password" autocomplete="new-password" required>
          <small class="ani-hint">Минимум 8 символов.</small></label>
        <button class="btn btn-primary" type="submit">Создать аккаунт</button>
        <p class="ani-form-msg"></p>
      </form>`;
  }

  function bindLogin(body) {
    const form = body.querySelector("form");
    const msg = body.querySelector(".ani-form-msg");
    form.onsubmit = async (e) => {
      e.preventDefault();
      msg.className = "ani-form-msg";
      msg.textContent = "Входим…";
      const email = form.email.value.trim();
      const password = form.password.value;
      const { ok, data } = await api("/auth/login", { method: "POST", body: { email, password } });
      if (ok) {
        setUser(data.user);
        closeModal();
        toast("С возвращением, " + data.user.username + "!");
      } else {
        msg.className = "ani-form-msg error";
        msg.textContent = data.error || "Не удалось войти.";
        if (data.needVerify) {
          msg.innerHTML += ` <a href="#" data-act="resend">Отправить письмо ещё раз</a>`;
          const a = msg.querySelector('[data-act="resend"]');
          if (a) a.onclick = (ev) => { ev.preventDefault(); doResend(email, msg); };
        }
      }
    };
    const resend = body.querySelector('[data-act="resend"]');
    if (resend) resend.onclick = (e) => {
      e.preventDefault();
      const email = form.email.value.trim();
      if (!email) { msg.className = "ani-form-msg error"; msg.textContent = "Введите email выше и нажмите ещё раз."; return; }
      doResend(email, msg);
    };
    const forgot = body.querySelector('[data-act="forgot"]');
    if (forgot) forgot.onclick = (e) => { e.preventDefault(); showTab("forgot"); };
  }

  function bindForgot(body) {
    const form = body.querySelector("form");
    const msg = body.querySelector(".ani-form-msg");
    form.onsubmit = async (e) => {
      e.preventDefault();
      msg.className = "ani-form-msg"; msg.textContent = "Отправляем…";
      const email = form.email.value.trim();
      const { data } = await api("/auth/forgot", { method: "POST", body: { email } });
      msg.className = "ani-form-msg ok";
      msg.textContent = data.message || "Если аккаунт существует — письмо отправлено.";
    };
    const back = body.querySelector('[data-act="tologin"]');
    if (back) back.onclick = (e) => { e.preventDefault(); showTab("login"); };
  }

  function bindReset(body) {
    const form = body.querySelector("form");
    const msg = body.querySelector(".ani-form-msg");
    form.onsubmit = async (e) => {
      e.preventDefault();
      msg.className = "ani-form-msg"; msg.textContent = "Сохраняем…";
      const password = form.password.value;
      const { ok, data } = await api("/auth/reset", { method: "POST", body: { token: resetToken, password } });
      if (ok) {
        msg.className = "ani-form-msg ok";
        msg.textContent = data.message || "Пароль изменён. Войдите с новым паролем.";
        form.reset();
        setTimeout(() => showTab("login"), 1200);
      } else {
        msg.className = "ani-form-msg error";
        msg.textContent = data.error || "Не удалось сменить пароль.";
      }
    };
  }

  async function doResend(email, msg) {
    msg.className = "ani-form-msg";
    msg.textContent = "Отправляем…";
    const { data } = await api("/auth/resend", { method: "POST", body: { email } });
    msg.className = "ani-form-msg ok";
    msg.textContent = data.message || "Если аккаунт есть и не подтверждён — письмо отправлено.";
  }

  function bindRegister(body) {
    const form = body.querySelector("form");
    const msg = body.querySelector(".ani-form-msg");
    form.onsubmit = async (e) => {
      e.preventDefault();
      msg.className = "ani-form-msg";
      msg.textContent = "Создаём…";
      const username = form.username.value.trim();
      const email = form.email.value.trim();
      const password = form.password.value;
      const { ok, data } = await api("/auth/register", { method: "POST", body: { username, email, password } });
      if (ok) {
        msg.className = "ani-form-msg ok";
        msg.textContent = data.message || "Письмо отправлено. Подтвердите почту, затем войдите.";
        form.reset();
      } else {
        msg.className = "ani-form-msg error";
        msg.textContent = data.error || "Не удалось зарегистрироваться.";
      }
    };
  }

  /* ---------- requireAuth ---------- */
  function requireAuth() {
    if (currentUser) return Promise.resolve(currentUser);
    openModal("login");
    return Promise.reject(new Error("not-authenticated"));
  }

  /* ---------- уведомление о подтверждении почты ---------- */
  function handleVerifyParam() {
    const p = new URLSearchParams(location.search);
    const v = p.get("verify");
    if (!v) return;
    const map = {
      ok: ["Почта подтверждена! Теперь войдите в аккаунт.", "ok"],
      expired: ["Ссылка подтверждения истекла. Запросите письмо заново.", "error"],
      bad: ["Ссылка подтверждения недействительна.", "error"],
    };
    const [text, type] = map[v] || ["", "info"];
    if (text) setTimeout(() => toast(text, type), 300);
    // чистим query, чтобы тост не повторялся
    p.delete("verify");
    const qs = p.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
    if (v === "ok") setTimeout(() => openModal("login"), 800);
  }

  /* ---------- обработка ссылки сброса пароля (?reset=token) ---------- */
  function handleResetParam() {
    const p = new URLSearchParams(location.search);
    const token = p.get("reset");
    if (!token) return;
    resetToken = token;
    // чистим query, чтобы токен не светился в адресной строке / истории
    p.delete("reset");
    const qs = p.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
    setTimeout(() => openModal("reset"), 300);
  }

  /* ---------- экспорт ---------- */
  window.AniAuth = {
    api, get user() { return currentUser; }, onChange, refresh,
    openModal, requireAuth, toast, esc, lvlBadge,
  };

  /* ---------- старт ---------- */
  function init() {
    renderAccount();
    handleVerifyParam();
    handleResetParam();
    refresh();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

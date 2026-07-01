/* ============================================================
   AniToki — комментарии под тайтлом (клиент).
   Монтируется в <div id="comments-root" data-anime-id="...">.
   Требует auth.js (window.AniAuth). Работает на статических
   страницах /anime/<id>/ и в SPA (#/title/:id).
   ============================================================ */
(function () {
  "use strict";

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }
  const A = () => window.AniAuth;
  const esc = (s) => (A() ? A().esc(s) : String(s));

  function fmtDate(ms) {
    try { return new Date(ms).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" }); }
    catch { return ""; }
  }

  let root, animeId, me, offChange = null;

  async function mount(target) {
    root = target || document.getElementById("comments-root");
    if (!root || !A()) return;
    animeId = root.dataset.animeId;
    if (!animeId) return;
    root.innerHTML = `<h2 class="section-title">Комментарии</h2><div class="cm-loading">Загрузка…</div>`;
    if (location.protocol === "file:") {
      root.querySelector(".cm-loading").textContent =
        "Комментарии доступны на опубликованном сайте.";
      return;
    }
    await load();
    // перерисовываем форму при входе/выходе (одна активная подписка)
    if (offChange) offChange();
    offChange = A().onChange(() => {
      if (root && document.body.contains(root)) renderForm();
      else if (offChange) { offChange(); offChange = null; }
    });
  }

  async function load() {
    const { ok, data } = await A().api("/comments/" + encodeURIComponent(animeId));
    if (!ok) { root.innerHTML = `<h2 class="section-title">Комментарии</h2><p class="cm-empty">Не удалось загрузить.</p>`; return; }
    me = data.me;
    render(data.comments || []);
  }

  function render(comments) {
    root.innerHTML = `
      <h2 class="section-title">Комментарии${comments.length ? " · " + comments.length : ""}</h2>
      <div class="cm-form-slot"></div>
      <div class="cm-list">${comments.length ? comments.map(commentHTML).join("") : `<p class="cm-empty">Пока нет комментариев. Будьте первым!</p>`}</div>`;
    renderForm();
    root.querySelector(".cm-list").querySelectorAll(".cm-item").forEach(bindItem);
  }

  function renderForm() {
    const slot = root.querySelector(".cm-form-slot");
    if (!slot) return;
    const u = A().user;
    if (!u) {
      slot.innerHTML = `<div class="cm-gate">Чтобы оставить комментарий, <a href="#" class="cm-login">войдите</a> в аккаунт.</div>`;
      slot.querySelector(".cm-login").onclick = (e) => { e.preventDefault(); A().openModal("login"); };
      return;
    }
    if (!u.emailVerified) {
      slot.innerHTML = `<div class="cm-gate">Подтвердите почту, чтобы комментировать.</div>`;
      return;
    }
    if (u.banned) { slot.innerHTML = `<div class="cm-gate warn">Аккаунт заблокирован.</div>`; return; }
    if (u.muted) {
      slot.innerHTML = `<div class="cm-gate warn">Вам временно запрещено комментировать (до ${fmtDate(u.mutedUntil)}).</div>`;
      return;
    }
    slot.innerHTML = `
      <form class="cm-form">
        <textarea name="body" maxlength="2000" rows="3" placeholder="Поделитесь мнением о тайтле…" required></textarea>
        <div class="cm-form-row">
          <span class="cm-counter">0 / 2000</span>
          <button class="btn btn-primary" type="submit">Отправить</button>
        </div>
        <p class="cm-msg"></p>
      </form>`;
    const form = slot.querySelector("form");
    const ta = form.body, counter = slot.querySelector(".cm-counter"), msg = slot.querySelector(".cm-msg");
    ta.oninput = () => { counter.textContent = ta.value.length + " / 2000"; };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const body = ta.value.trim();
      if (!body) return;
      msg.className = "cm-msg"; msg.textContent = "Отправляем…";
      const { ok, data } = await A().api("/comments/" + encodeURIComponent(animeId), { method: "POST", body: { body } });
      if (ok) {
        ta.value = ""; counter.textContent = "0 / 2000"; msg.textContent = "";
        prependComment(data.comment);
      } else {
        msg.className = "cm-msg error";
        msg.textContent = data.error || "Не удалось отправить.";
      }
    };
  }

  function prependComment(c) {
    const list = root.querySelector(".cm-list");
    const empty = list.querySelector(".cm-empty");
    if (empty) empty.remove();
    const node = document.createElement("div");
    node.innerHTML = commentHTML(c);
    const item = node.firstElementChild;
    list.prepend(item);
    bindItem(item);
    const title = root.querySelector(".section-title");
    const n = list.querySelectorAll(".cm-item").length;
    if (title) title.textContent = "Комментарии · " + n;
  }

  function commentHTML(c) {
    const adminBadge = c.isAdmin ? `<span class="cm-badge">админ</span>` : "";
    const canDelete = c.mine || (A().user && A().user.role === "admin");
    return `
      <div class="cm-item" data-id="${c.id}" data-author="${c.authorId}" data-author-name="${esc(c.author)}">
        <div class="cm-avatar">${esc(c.author.slice(0, 1).toUpperCase())}</div>
        <div class="cm-body">
          <div class="cm-head">
            ${A().lvlBadge ? A().lvlBadge(c.authorLevel, c.authorTier) : ""}
            <span class="cm-author">${esc(c.author)}</span>${adminBadge}
            <span class="cm-time">${fmtDate(c.createdAt)}</span>
          </div>
          <div class="cm-text">${esc(c.body).replace(/\n/g, "<br>")}</div>
          <div class="cm-actions">
            <button class="cm-vote up ${c.myVote === 1 ? "on" : ""}" data-v="1">▲ <span class="cm-likes">${c.likes}</span></button>
            <button class="cm-vote down ${c.myVote === -1 ? "on" : ""}" data-v="-1">▼ <span class="cm-dislikes">${c.dislikes}</span></button>
            <button class="cm-report" data-act="report-comment">Пожаловаться</button>
            ${!c.mine ? `<button class="cm-report" data-act="report-user">На пользователя</button>` : ""}
            ${canDelete ? `<button class="cm-del" data-act="delete">Удалить</button>` : ""}
          </div>
        </div>
      </div>`;
  }

  function bindItem(item) {
    const id = item.dataset.id;
    item.querySelectorAll(".cm-vote").forEach((b) => {
      b.onclick = async () => {
        if (!A().user) return A().openModal("login");
        const value = Number(b.dataset.v);
        const { ok, data } = await A().api(`/comment/${id}/vote`, { method: "POST", body: { value } });
        if (!ok) { A().toast(data.error || "Не удалось проголосовать.", "error"); return; }
        item.querySelector(".cm-likes").textContent = data.likes;
        item.querySelector(".cm-dislikes").textContent = data.dislikes;
        item.querySelector(".cm-vote.up").classList.toggle("on", data.myVote === 1);
        item.querySelector(".cm-vote.down").classList.toggle("on", data.myVote === -1);
        // обновляем бейдж уровня во всех комментариях этого автора
        if (data.authorId && A().lvlBadge) {
          const fresh = A().lvlBadge(data.authorLevel, data.authorTier);
          root.querySelectorAll(`.cm-item[data-author="${data.authorId}"] .cm-head`).forEach((head) => {
            const old = head.querySelector(".lvl-badge");
            if (old) old.outerHTML = fresh;
            else if (fresh) head.insertAdjacentHTML("afterbegin", fresh);
          });
        }
      };
    });

    const repC = item.querySelector('[data-act="report-comment"]');
    if (repC) repC.onclick = async () => {
      if (!A().user) return A().openModal("login");
      const reason = prompt("Причина жалобы на комментарий (необязательно):");
      if (reason === null) return;
      const { ok, data } = await A().api(`/comment/${id}/report`, { method: "POST", body: { reason } });
      A().toast(ok ? (data.message || "Жалоба отправлена.") : (data.error || "Ошибка."), ok ? "ok" : "error");
    };

    const repU = item.querySelector('[data-act="report-user"]');
    if (repU) repU.onclick = async () => {
      if (!A().user) return A().openModal("login");
      const userId = Number(item.dataset.author);
      const reason = prompt(`Причина жалобы на пользователя ${item.dataset.authorName} (необязательно):`);
      if (reason === null) return;
      const { ok, data } = await A().api(`/report-user`, { method: "POST", body: { userId, reason } });
      A().toast(ok ? (data.message || "Жалоба отправлена.") : (data.error || "Ошибка."), ok ? "ok" : "error");
    };

    const del = item.querySelector('[data-act="delete"]');
    if (del) del.onclick = async () => {
      if (!confirm("Удалить комментарий?")) return;
      const { ok, data } = await A().api(`/comment/${id}`, { method: "DELETE" });
      if (ok) {
        item.remove();
        A().toast("Комментарий удалён.", "ok");
      } else A().toast(data.error || "Не удалось удалить.", "error");
    };
  }

  window.AniComments = { mount };
  ready(() => { if (document.getElementById("comments-root")) mount(); });
})();

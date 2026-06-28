/* ============================================================
   Монетизация AniVerse — единая точка для рекламных баннеров.

   КАК ПОДКЛЮЧИТЬ:
   1. Зарегистрируйся в рекламной сети (Adsterra / Monetag и т.п.),
      создай зону «баннер», скопируй её код.
   2. Вставь этот код (можно с <script>) в поле bottomBanner ниже,
      между обратными кавычками. Пусто ("") = баннер скрыт.
   3. Готово — баннер появится липкой полосой снизу на всех страницах.

   Скрипт корректно выполняет <script> из вставленного кода и
   ничего не показывает, пока поле пустое (не ломает вёрстку).
   ============================================================ */
window.ANIVERSE_ADS = {
  // Пример (заменить на свой код зоны):
  // bottomBanner: '<script async data-cfasync="false" src="//ad-network.example/banner.js"></script><div id="zone-12345"></div>',
  bottomBanner: ""
};

(function () {
  function exec(container, html) {
    container.innerHTML = html;
    // innerHTML не выполняет <script> — пересоздаём теги, чтобы код сети запустился
    container.querySelectorAll("script").forEach(function (old) {
      var s = document.createElement("script");
      for (var i = 0; i < old.attributes.length; i++) {
        s.setAttribute(old.attributes[i].name, old.attributes[i].value);
      }
      s.text = old.text;
      old.replaceWith(s);
    });
  }

  function init() {
    var cfg = window.ANIVERSE_ADS || {};
    var bar = document.getElementById("ad-bottom");
    if (!bar) return;
    if (cfg.bottomBanner && cfg.bottomBanner.trim()) {
      exec(bar.querySelector(".ad-bar-inner"), cfg.bottomBanner);
      bar.classList.add("show");
      var close = bar.querySelector(".ad-bar-close");
      if (close) close.addEventListener("click", function () { bar.remove(); });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

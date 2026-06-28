/* ============================================================
   Монетизация AniVerse — единая точка для рекламных баннеров.

   КАК ПОДКЛЮЧИТЬ:
   1. Зарегистрируйся в рекламной сети (Adsterra / Monetag и т.п.),
      создай зону «баннер», скопируй её код.
   2. Вставь этот код (можно с <script>) в поле bottomBanner ниже,
      между обратными кавычками. Пусто ("") = баннер скрыт.
   3. Готово — баннер появится липкой полосой снизу на всех страницах.

   Полоса показывается ТОЛЬКО когда реклама реально подгрузилась
   (пока сеть на модерации/ничего не отдаёт — пустого бара нет).
   ============================================================ */
window.ANIVERSE_ADS = {
  // Adsterra — баннер 728×90 (зона e04a7f75…)
  bottomBanner: `
<script type="text/javascript">
  atOptions = {
    'key' : 'e04a7f751115b2e15616ec2904525c10',
    'format' : 'iframe',
    'height' : 90,
    'width' : 728,
    'params' : {}
  };
</script>
<script type="text/javascript" src="https://www.highperformanceformat.com/e04a7f751115b2e15616ec2904525c10/invoke.js"></script>
`
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
    if (!bar || !cfg.bottomBanner || !cfg.bottomBanner.trim()) return;
    var inner = bar.querySelector(".ad-bar-inner");

    // Кнопка закрытия
    var close = bar.querySelector(".ad-bar-close");
    if (close) close.addEventListener("click", function () { bar.remove(); });

    // Показываем бар только когда внутри реально появился контент с высотой
    // (баннер-iframe), а не просто служебные <script>.
    var obs = new MutationObserver(function () {
      if (inner.offsetHeight > 0) {
        bar.classList.add("show");
        obs.disconnect();
      }
    });
    obs.observe(inner, { childList: true, subtree: true });

    exec(inner, cfg.bottomBanner);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

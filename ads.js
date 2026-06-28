/* ============================================================
   Монетизация AniVerse — единая точка для рекламных баннеров.

   КАК ПОДКЛЮЧИТЬ:
   1. Зарегистрируйся в рекламной сети (Adsterra / Monetag и т.п.),
      создай зону «баннер», скопируй её код.
   2. Вставь этот код (с <script>) в поле bottomBanner ниже,
      между обратными кавычками. Пусто ("") = баннер скрыт.

   Баннер грузится в изолированном iframe (srcdoc) — так код сети
   выполняется штатно (document.write/currentScript работают), что
   надёжнее прямой вставки в DOM. Полоса снизу показывается ТОЛЬКО
   когда реклама реально подгрузилась (нет филла — нет пустого бара).
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
  function init() {
    var cfg = window.ANIVERSE_ADS || {};
    var bar = document.getElementById("ad-bottom");
    if (!bar || !cfg.bottomBanner || !cfg.bottomBanner.trim()) return;
    var inner = bar.querySelector(".ad-bar-inner");

    var close = bar.querySelector(".ad-bar-close");
    if (close) close.addEventListener("click", function () { bar.remove(); });

    // Баннер — в собственном iframe, чтобы код сети выполнился корректно
    var frame = document.createElement("iframe");
    frame.setAttribute("scrolling", "no");
    frame.setAttribute("title", "advertising");
    frame.style.cssText = "width:728px;max-width:100vw;height:90px;border:0;display:block;";
    frame.srcdoc =
      "<!DOCTYPE html><html><head><meta charset='utf-8'>" +
      "<style>html,body{margin:0;padding:0;overflow:hidden}</style></head><body>" +
      cfg.bottomBanner +
      "</body></html>";
    inner.appendChild(frame);

    // Показываем полосу, только когда внутри iframe реально появилась реклама
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      try {
        var doc = frame.contentDocument;
        if (doc && doc.querySelector("iframe, img, ins")) {
          bar.classList.add("show");
          clearInterval(timer);
        }
      } catch (e) {
        /* контент сети кросс-доменный — игнорируем */
      }
      if (tries > 20) clearInterval(timer); // ~10с без филла → полоса не показывается
    }, 500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

/* ============================================================
   Монетизация AniVerse — единая точка для рекламных баннеров.

   ПОЛЯ:
   - bottomBanner — липкая полоса снизу на всех страницах.
   - inContent    — блок(и) в контенте (.ad-slot): на страницах тайтлов
                    между плеером и «Похожими», на главной и лендингах.

   Вставь код зоны от рекламной сети между обратными кавычками.
   Пусто ("") = соответствующая реклама не показывается.
   Лучше для каждого места завести ОТДЕЛЬНУЮ зону в кабинете сети
   (точнее статистика и выше заполняемость), но можно временно
   использовать один и тот же код.

   Баннер грузится в изолированном iframe (srcdoc) — так код сети
   выполняется штатно. Контейнер показывается только при реальном филле.
   ============================================================ */
var AD_CODE = `
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
`;

window.ANIVERSE_ADS = {
  bottomBanner: AD_CODE,
  inContent: AD_CODE // ← заведи отдельную зону и вставь сюда её код
};

(function () {
  function bannerIframe(code, w, h) {
    var f = document.createElement("iframe");
    f.setAttribute("scrolling", "no");
    f.setAttribute("title", "advertising");
    f.setAttribute("loading", "lazy");
    f.style.cssText = "width:" + w + "px;max-width:100%;height:" + h + "px;border:0;display:block;margin:0 auto;";
    f.srcdoc =
      "<!DOCTYPE html><html><head><meta charset='utf-8'>" +
      "<style>html,body{margin:0;padding:0;overflow:hidden}</style></head><body>" +
      code + "</body></html>";
    return f;
  }

  // Вызывает cb(true) когда внутри iframe реально появилась реклама, иначе cb(false)
  function whenFilled(frame, cb) {
    var n = 0;
    var t = setInterval(function () {
      n++;
      try {
        var d = frame.contentDocument;
        if (d && d.querySelector("iframe, img, ins")) { clearInterval(t); cb(true); }
      } catch (e) { /* контент сети кросс-доменный */ }
      if (n > 20) { clearInterval(t); cb(false); } // ~10с без филла
    }, 500);
  }

  function mountSticky(code) {
    var bar = document.getElementById("ad-bottom");
    if (!bar) return;
    var inner = bar.querySelector(".ad-bar-inner");
    var close = bar.querySelector(".ad-bar-close");
    if (close) close.addEventListener("click", function () { bar.remove(); });
    var f = bannerIframe(code, 728, 90);
    inner.appendChild(f);
    whenFilled(f, function (ok) { if (ok) bar.classList.add("show"); });
  }

  function mountInline(slot, code) {
    if (slot.dataset.adFilled) return;
    slot.dataset.adFilled = "1";
    var f = bannerIframe(code, 728, 90);
    slot.appendChild(f);
    whenFilled(f, function (ok) {
      if (ok) slot.style.display = "flex";
      else if (slot.parentNode) slot.parentNode.removeChild(slot);
    });
  }

  function fillInline() {
    var code = (window.ANIVERSE_ADS || {}).inContent;
    if (!code || !code.trim()) return;
    var slots = document.querySelectorAll(".ad-slot:not([data-ad-filled])");
    for (var i = 0; i < slots.length; i++) mountInline(slots[i], code);
  }

  function init() {
    var cfg = window.ANIVERSE_ADS || {};
    if (cfg.bottomBanner && cfg.bottomBanner.trim()) mountSticky(cfg.bottomBanner);
    fillInline();
    // SPA подгружает контент динамически — дозаполняем новые слоты
    if (window.MutationObserver) {
      var obs = new MutationObserver(function () { fillInline(); });
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

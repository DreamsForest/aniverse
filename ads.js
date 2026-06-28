/* ============================================================
   Монетизация AniVerse — единая точка для рекламы.

   ПОЛЯ (вставь код зоны от рекламной сети между обратными кавычками,
   пусто "" = реклама в этом месте не показывается):
   - bottomBanner — липкая полоса снизу (баннер 728×90).
   - inContent    — блоки в контенте (.ad-slot): между плеером и
                    «Похожими», на главной, в середине каталога (728×90).
   - sideBanner   — боковые рейлы слева/справа на широких экранах
                    (вертикальный баннер 160×600).
   - nativeGrid   — нативный блок в сетке карточек (.ad-card),
                    формат Native Banner.

   Лучше под каждое место завести ОТДЕЛЬНУЮ зону в кабинете сети.
   Реклама грузится в изолированном iframe (srcdoc) и показывается
   только при реальном филле (нет рекламы — нет пустого места).
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
  inContent: AD_CODE,
  sideBanner: "", // ← код зоны 160×600 (Wide Skyscraper)
  nativeGrid: ""  // ← код зоны Native Banner
};

(function () {
  function frame(code, css) {
    var f = document.createElement("iframe");
    f.setAttribute("scrolling", "no");
    f.setAttribute("title", "advertising");
    f.setAttribute("loading", "lazy");
    f.style.cssText = css;
    f.srcdoc =
      "<!DOCTYPE html><html><head><meta charset='utf-8'>" +
      "<style>html,body{margin:0;padding:0;overflow:hidden}</style></head><body>" +
      code + "</body></html>";
    return f;
  }
  function banner(code, w, h) {
    return frame(code, "width:" + w + "px;max-width:100%;height:" + h + "px;border:0;display:block;margin:0 auto;");
  }
  function fluid(code) {
    return frame(code, "width:100%;height:100%;border:0;display:block;");
  }

  // cb(true) когда внутри iframe реально появилась реклама, иначе cb(false)
  function whenFilled(f, cb) {
    var n = 0;
    var t = setInterval(function () {
      n++;
      try {
        var d = f.contentDocument;
        if (d && d.querySelector("iframe, img, ins, a[href]")) { clearInterval(t); cb(true); }
      } catch (e) {}
      if (n > 20) { clearInterval(t); cb(false); }
    }, 500);
  }

  function mountSticky(code) {
    var bar = document.getElementById("ad-bottom");
    if (!bar) return;
    var close = bar.querySelector(".ad-bar-close");
    if (close) close.addEventListener("click", function () { bar.remove(); });
    var f = banner(code, 728, 90);
    bar.querySelector(".ad-bar-inner").appendChild(f);
    whenFilled(f, function (ok) { if (ok) bar.classList.add("show"); });
  }

  function mountRail(id, code) {
    var rail = document.getElementById(id);
    if (!rail) return;
    var f = banner(code, 160, 600);
    rail.querySelector(".ad-rail-inner").appendChild(f);
    whenFilled(f, function (ok) { if (ok) rail.classList.add("show"); });
  }

  function fillSlots() {
    var ic = (window.ANIVERSE_ADS || {}).inContent;
    if (ic && ic.trim()) {
      var slots = document.querySelectorAll(".ad-slot:not([data-ad-filled])");
      for (var i = 0; i < slots.length; i++) {
        (function (slot) {
          slot.dataset.adFilled = "1";
          var f = banner(ic, 728, 90);
          slot.appendChild(f);
          whenFilled(f, function (ok) {
            if (ok) slot.style.display = "flex";
            else if (slot.parentNode) slot.parentNode.removeChild(slot);
          });
        })(slots[i]);
      }
    }
    var ng = (window.ANIVERSE_ADS || {}).nativeGrid;
    if (ng && ng.trim()) {
      var cards = document.querySelectorAll(".ad-card:not([data-ad-filled])");
      for (var j = 0; j < cards.length; j++) {
        (function (card) {
          card.dataset.adFilled = "1";
          var f = fluid(ng);
          card.appendChild(f);
          whenFilled(f, function (ok) {
            if (ok) card.style.display = "flex";
            else if (card.parentNode) card.parentNode.removeChild(card);
          });
        })(cards[j]);
      }
    }
  }

  function init() {
    var cfg = window.ANIVERSE_ADS || {};
    if (cfg.bottomBanner && cfg.bottomBanner.trim()) mountSticky(cfg.bottomBanner);
    if (cfg.sideBanner && cfg.sideBanner.trim()) {
      mountRail("ad-left", cfg.sideBanner);
      mountRail("ad-right", cfg.sideBanner);
    }
    fillSlots();
    if (window.MutationObserver) {
      new MutationObserver(function () { fillSlots(); }).observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

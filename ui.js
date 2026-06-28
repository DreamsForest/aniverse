/* ============================================================
   UI-эффекты AniVerse: плавное появление карточек при прокрутке.
   Карточки .card по умолчанию скрыты (через html.js .card{opacity:0})
   и проявляются, когда попадают в зону видимости.
   Работает и для статических страниц, и для SPA (следит за DOM).
   ============================================================ */
(function () {
  var de = document.documentElement;
  de.classList.add("js");

  if (!("IntersectionObserver" in window)) return; // нет поддержки — карточки просто видны

  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    },
    { rootMargin: "0px 0px -6% 0px", threshold: 0.04 }
  );

  function scan(root) {
    var cards = (root || document).querySelectorAll(".card:not(.in)");
    for (var i = 0; i < cards.length; i++) io.observe(cards[i]);
  }

  scan(document);

  // SPA дорисовывает карточки динамически — наблюдаем за добавлением узлов
  if (window.MutationObserver) {
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        if (muts[i].addedNodes && muts[i].addedNodes.length) {
          scan(document);
          break;
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  window.AniVerseUI = { scan: scan };
})();

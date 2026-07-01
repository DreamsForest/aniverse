// Система уровней аккаунта.
// Репутация = сумма (лайки − дизлайки) на комментариях пользователя (не меньше 0).
// Порог уровня растёт: чтобы БЫТЬ уровнем L, нужно 5·(L−1)·L/2 очков.
//   L1: 0, L2: 5, L3: 15, L4: 30, L5: 50, L6: 75, L7: 105, L8: 140 …
// Каждые 5 уровней — новый «тир» эмблемы (меняется цвет/форма, цифра = сам уровень).

// Кумулятивный порог, чтобы достичь уровня L.
function threshold(L) {
  return Math.round((5 * (L - 1) * L) / 2);
}

export function levelInfo(reputation) {
  const rep = Math.max(0, Math.floor(Number(reputation) || 0));
  let level = 1;
  while (threshold(level + 1) <= rep) level++;
  const cur = threshold(level);       // очков нужно было на текущий уровень
  const nxt = threshold(level + 1);   // очков нужно на следующий
  const into = rep - cur;             // прогресс внутри уровня
  const need = nxt - cur;             // сколько всего в этом уровне
  const tier = Math.floor((level - 1) / 5) + 1; // 1..N — «поколение» эмблемы
  return { rep, level, tier, into, need, next: nxt };
}

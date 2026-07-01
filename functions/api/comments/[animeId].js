// GET  /api/comments/:animeId — список комментариев тайтла.
// POST /api/comments/:animeId — добавить комментарий (нужна подтверждённая
//      почта, нельзя в бане/муте, проверка запрещённых слов).

import { ok, fail } from "../../_lib/respond.js";
import { getCurrentUser, isBanned, isMuted } from "../../_lib/auth.js";
import { checkBadWords } from "../../_lib/badwords.js";
import { rateLimit } from "../../_lib/ratelimit.js";
import { levelInfo } from "../../_lib/levels.js";

const MAX_LEN = 2000;

export async function onRequestGet({ params, request, env }) {
  const animeId = String(params.animeId || "").slice(0, 64);
  if (!animeId) return fail("Не указан тайтл.");

  const { results } = await env.DB.prepare(
    `SELECT c.id, c.body, c.created_at, c.user_id,
            u.username, u.role, u.reputation,
            COALESCE(SUM(CASE WHEN v.value = 1  THEN 1 ELSE 0 END), 0) AS likes,
            COALESCE(SUM(CASE WHEN v.value = -1 THEN 1 ELSE 0 END), 0) AS dislikes
       FROM comments c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN comment_votes v ON v.comment_id = c.id
      WHERE c.anime_id = ? AND c.deleted = 0
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT 200`
  ).bind(animeId).all();

  // Голоса текущего пользователя — чтобы подсветить его лайк/дизлайк.
  const me = await getCurrentUser(env, request);
  let myVotes = {};
  if (me && results.length) {
    const { results: vr } = await env.DB.prepare(
      `SELECT v.comment_id, v.value
         FROM comment_votes v
         JOIN comments c ON c.id = v.comment_id
        WHERE v.user_id = ? AND c.anime_id = ?`
    ).bind(me.id, animeId).all();
    for (const v of vr) myVotes[v.comment_id] = v.value;
  }

  const comments = results.map((r) => {
    const lvl = levelInfo(r.reputation);
    return {
      id: r.id,
      body: r.body,
      createdAt: r.created_at,
      author: r.username,
      authorId: r.user_id,
      authorLevel: lvl.level,
      authorTier: lvl.tier,
      isAdmin: r.role === "admin",
      likes: r.likes,
      dislikes: r.dislikes,
      myVote: myVotes[r.id] || 0,
      mine: me ? r.user_id === me.id : false,
    };
  });

  return ok({
    comments,
    me: me ? { id: me.id, canComment: !!me.email_verified && !isBanned(me) && !isMuted(me) } : null,
  });
}

export async function onRequestPost({ params, request, env }) {
  const animeId = String(params.animeId || "").slice(0, 64);
  if (!animeId) return fail("Не указан тайтл.");

  const user = await getCurrentUser(env, request);
  if (!user) return fail("Войдите в аккаунт, чтобы оставить комментарий.", 401);
  if (!user.email_verified) return fail("Подтвердите почту, чтобы комментировать.", 403);
  if (isBanned(user)) return fail("Аккаунт заблокирован — комментирование недоступно.", 403);
  if (isMuted(user)) {
    const until = new Date(Number(user.muted_until)).toLocaleString("ru-RU");
    return fail(`Вам временно запрещено комментировать (до ${until}).`, 403);
  }

  let data;
  try { data = await request.json(); } catch { return fail("Некорректный запрос."); }
  const body = String(data.body || "").trim();

  if (body.length < 1) return fail("Комментарий пустой.");
  if (body.length > MAX_LEN) return fail(`Слишком длинно (максимум ${MAX_LEN} символов).`);

  const bad = checkBadWords(body);
  if (bad.blocked) {
    return fail("Комментарий содержит недопустимую лексику и не был опубликован.", 422, {
      reason: "badwords",
    });
  }

  // Анти-флуд: не чаще 1 комментария в 15 секунд и не более 20 за 10 минут.
  if (!(await rateLimit(env, `comment15:${user.id}`, 1, 15 * 1000)))
    return fail("Слишком часто. Подождите немного перед следующим комментарием.", 429);
  if (!(await rateLimit(env, `comment10m:${user.id}`, 20, 10 * 60 * 1000)))
    return fail("Слишком много комментариев. Попробуйте позже.", 429);

  const now = Date.now();
  const res = await env.DB.prepare(
    "INSERT INTO comments (anime_id, user_id, body, created_at) VALUES (?,?,?,?)"
  ).bind(animeId, user.id, body, now).run();

  const lvl = levelInfo(user.reputation);
  return ok({
    comment: {
      id: res.meta.last_row_id,
      body,
      createdAt: now,
      author: user.username,
      authorId: user.id,
      authorLevel: lvl.level,
      authorTier: lvl.tier,
      isAdmin: user.role === "admin",
      likes: 0,
      dislikes: 0,
      myVote: 0,
      mine: true,
    },
  });
}

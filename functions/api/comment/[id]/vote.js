// POST /api/comment/:id/vote  { value: 1 | -1 }
// Лайк/дизлайк. Повторный тот же голос — снимает его (переключатель).

import { ok, fail } from "../../../_lib/respond.js";
import { getCurrentUser, isBanned } from "../../../_lib/auth.js";
import { levelInfo } from "../../../_lib/levels.js";

export async function onRequestPost({ params, request, env }) {
  const commentId = Number(params.id);
  if (!Number.isInteger(commentId) || commentId <= 0) return fail("Некорректный комментарий.");

  const user = await getCurrentUser(env, request);
  if (!user) return fail("Войдите, чтобы голосовать.", 401);
  if (!user.email_verified) return fail("Подтвердите почту.", 403);
  if (isBanned(user)) return fail("Аккаунт заблокирован.", 403);

  let data;
  try { data = await request.json(); } catch { return fail("Некорректный запрос."); }
  const value = Number(data.value);
  if (value !== 1 && value !== -1) return fail("Некорректный голос.");

  const comment = await env.DB.prepare(
    "SELECT id, user_id FROM comments WHERE id = ? AND deleted = 0"
  ).bind(commentId).first();
  if (!comment) return fail("Комментарий не найден.", 404);
  if (comment.user_id === user.id) return fail("Нельзя голосовать за свой комментарий.");

  const existing = await env.DB.prepare(
    "SELECT value FROM comment_votes WHERE comment_id = ? AND user_id = ?"
  ).bind(commentId, user.id).first();

  const oldVal = existing ? existing.value : 0;
  let myVote = value;
  if (!existing) {
    await env.DB.prepare(
      "INSERT INTO comment_votes (comment_id, user_id, value) VALUES (?,?,?)"
    ).bind(commentId, user.id, value).run();
  } else if (existing.value === value) {
    // тот же голос ещё раз → снимаем
    await env.DB.prepare(
      "DELETE FROM comment_votes WHERE comment_id = ? AND user_id = ?"
    ).bind(commentId, user.id).run();
    myVote = 0;
  } else {
    await env.DB.prepare(
      "UPDATE comment_votes SET value = ? WHERE comment_id = ? AND user_id = ?"
    ).bind(value, commentId, user.id).run();
  }

  // Обновляем репутацию автора комментария на дельту голоса (не ниже 0).
  const delta = myVote - oldVal;
  if (delta !== 0) {
    await env.DB.prepare(
      "UPDATE users SET reputation = MAX(0, reputation + ?) WHERE id = ?"
    ).bind(delta, comment.user_id).run();
  }

  const counts = await env.DB.prepare(
    `SELECT COALESCE(SUM(CASE WHEN value = 1  THEN 1 ELSE 0 END), 0) AS likes,
            COALESCE(SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END), 0) AS dislikes
       FROM comment_votes WHERE comment_id = ?`
  ).bind(commentId).first();

  // актуальный уровень автора (для мгновенного обновления бейджа у клиента)
  const author = await env.DB.prepare("SELECT reputation FROM users WHERE id = ?")
    .bind(comment.user_id).first();
  const lvl = levelInfo(author ? author.reputation : 0);

  return ok({
    likes: counts.likes, dislikes: counts.dislikes, myVote,
    authorId: comment.user_id, authorLevel: lvl.level, authorTier: lvl.tier,
  });
}

// DELETE /api/comment/:id — удалить свой комментарий (или любой, если админ).
// Мягкое удаление: ставим deleted = 1.

import { ok, fail } from "../../../_lib/respond.js";
import { getCurrentUser } from "../../../_lib/auth.js";

export async function onRequestDelete({ params, request, env }) {
  const commentId = Number(params.id);
  if (!Number.isInteger(commentId) || commentId <= 0) return fail("Некорректный комментарий.");

  const user = await getCurrentUser(env, request);
  if (!user) return fail("Требуется вход.", 401);

  const comment = await env.DB.prepare(
    "SELECT user_id FROM comments WHERE id = ? AND deleted = 0"
  ).bind(commentId).first();
  if (!comment) return fail("Комментарий не найден.", 404);

  const isOwner = comment.user_id === user.id;
  const isAdmin = user.role === "admin";
  if (!isOwner && !isAdmin) return fail("Нет прав на удаление.", 403);

  // снимаем с автора репутацию, набранную этим комментарием
  const net = await env.DB.prepare(
    "SELECT COALESCE(SUM(value), 0) AS n FROM comment_votes WHERE comment_id = ?"
  ).bind(commentId).first();
  if (net && net.n) {
    await env.DB.prepare("UPDATE users SET reputation = MAX(0, reputation - ?) WHERE id = ?")
      .bind(net.n, comment.user_id).run();
  }

  await env.DB.prepare("UPDATE comments SET deleted = 1 WHERE id = ?").bind(commentId).run();
  // закрываем связанные жалобы
  await env.DB.prepare(
    "UPDATE reports SET status = 'resolved' WHERE kind = 'comment' AND target_id = ?"
  ).bind(commentId).run();

  return ok({});
}

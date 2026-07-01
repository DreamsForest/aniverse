// POST /api/comment/:id/report  { reason }
// Жалоба на комментарий — уходит в админку. Один открытый репорт
// от пользователя на конкретный комментарий.

import { ok, fail } from "../../../_lib/respond.js";
import { getCurrentUser } from "../../../_lib/auth.js";

export async function onRequestPost({ params, request, env }) {
  const commentId = Number(params.id);
  if (!Number.isInteger(commentId) || commentId <= 0) return fail("Некорректный комментарий.");

  const user = await getCurrentUser(env, request);
  if (!user) return fail("Войдите, чтобы пожаловаться.", 401);

  let data = {};
  try { data = await request.json(); } catch {}
  const reason = String(data.reason || "").trim().slice(0, 500);

  const comment = await env.DB.prepare(
    "SELECT id, anime_id, user_id FROM comments WHERE id = ? AND deleted = 0"
  ).bind(commentId).first();
  if (!comment) return fail("Комментарий не найден.", 404);

  const dup = await env.DB.prepare(
    "SELECT id FROM reports WHERE kind = 'comment' AND target_id = ? AND reporter_id = ? AND status = 'open'"
  ).bind(commentId, user.id).first();
  if (dup) return ok({ message: "Жалоба уже отправлена." });

  await env.DB.prepare(
    `INSERT INTO reports (kind, target_id, anime_id, reporter_id, reason, created_at)
     VALUES ('comment', ?, ?, ?, ?, ?)`
  ).bind(commentId, comment.anime_id, user.id, reason, Date.now()).run();

  return ok({ message: "Спасибо! Жалоба отправлена модератору." });
}

// POST /api/report-user  { userId, reason }
// Жалоба на пользователя (его аккаунт) — уходит в админку.

import { ok, fail } from "../_lib/respond.js";
import { getCurrentUser } from "../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(env, request);
  if (!user) return fail("Войдите, чтобы пожаловаться.", 401);

  let data = {};
  try { data = await request.json(); } catch {}
  const targetId = Number(data.userId);
  const reason = String(data.reason || "").trim().slice(0, 500);
  if (!Number.isInteger(targetId) || targetId <= 0) return fail("Некорректный пользователь.");
  if (targetId === user.id) return fail("Нельзя пожаловаться на себя.");

  const target = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(targetId).first();
  if (!target) return fail("Пользователь не найден.", 404);

  const dup = await env.DB.prepare(
    "SELECT id FROM reports WHERE kind = 'user' AND target_id = ? AND reporter_id = ? AND status = 'open'"
  ).bind(targetId, user.id).first();
  if (dup) return ok({ message: "Жалоба уже отправлена." });

  await env.DB.prepare(
    `INSERT INTO reports (kind, target_id, anime_id, reporter_id, reason, created_at)
     VALUES ('user', ?, '', ?, ?, ?)`
  ).bind(targetId, user.id, reason, Date.now()).run();

  return ok({ message: "Спасибо! Жалоба на пользователя отправлена модератору." });
}

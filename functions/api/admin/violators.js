// GET /api/admin/violators — пользователи с активным баном или мутом (только админ).
// Для раздела «Нарушители» в админке: имя, тип, срок окончания, причина.

import { ok, fail } from "../../_lib/respond.js";
import { getCurrentUser } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const admin = await getCurrentUser(env, request);
  if (!admin || admin.role !== "admin") return fail("Доступ только для администратора.", 403);

  const now = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT id, username, banned_until, muted_until, mod_reason
       FROM users
      WHERE banned_until > ? OR muted_until > ?
      ORDER BY MAX(banned_until, muted_until) DESC
      LIMIT 200`
  ).bind(now, now).all();

  const violators = results.map((u) => ({
    id: u.id,
    username: u.username,
    banned: Number(u.banned_until) > now,
    bannedUntil: Number(u.banned_until) || 0,
    muted: Number(u.muted_until) > now,
    mutedUntil: Number(u.muted_until) || 0,
    reason: u.mod_reason || "",
  }));

  return ok({ violators });
}

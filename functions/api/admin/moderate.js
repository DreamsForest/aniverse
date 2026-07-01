// POST /api/admin/moderate  { userId, action, days, reason }
// action: 'ban' | 'mute' | 'unban' | 'unmute'  (только админ).
// Бан — полная блокировка (нет входа и комментариев) на 1–7 дней.
// Мут — запрет комментировать (читать можно) на 1–7 дней.

import { ok, fail } from "../../_lib/respond.js";
import { getCurrentUser, destroyAllSessions } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const admin = await getCurrentUser(env, request);
  if (!admin || admin.role !== "admin") return fail("Доступ только для администратора.", 403);

  let data;
  try { data = await request.json(); } catch { return fail("Некорректный запрос."); }

  const userId = Number(data.userId);
  const action = String(data.action || "");
  const reason = String(data.reason || "").trim().slice(0, 300);
  if (!Number.isInteger(userId) || userId <= 0) return fail("Некорректный пользователь.");
  if (userId === admin.id) return fail("Нельзя применить к себе.");

  const target = await env.DB.prepare("SELECT id, role FROM users WHERE id = ?").bind(userId).first();
  if (!target) return fail("Пользователь не найден.", 404);
  if (target.role === "admin") return fail("Нельзя модерировать администратора.");

  const now = Date.now();

  if (action === "ban" || action === "mute") {
    const days = Math.min(7, Math.max(1, Math.floor(Number(data.days) || 0)));
    if (!days) return fail("Срок: от 1 до 7 дней.");
    const until = now + days * 24 * 60 * 60 * 1000;
    if (action === "ban") {
      await env.DB.prepare("UPDATE users SET banned_until = ?, mod_reason = ? WHERE id = ?")
        .bind(until, reason, userId).run();
      await destroyAllSessions(env, userId); // выкидываем из всех сессий
    } else {
      await env.DB.prepare("UPDATE users SET muted_until = ?, mod_reason = ? WHERE id = ?")
        .bind(until, reason, userId).run();
    }
    return ok({ until, days });
  }

  if (action === "unban") {
    await env.DB.prepare("UPDATE users SET banned_until = 0 WHERE id = ?").bind(userId).run();
    return ok({});
  }
  if (action === "unmute") {
    await env.DB.prepare("UPDATE users SET muted_until = 0 WHERE id = ?").bind(userId).run();
    return ok({});
  }

  return fail("Неизвестное действие.");
}

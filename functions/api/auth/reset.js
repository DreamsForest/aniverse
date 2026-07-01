// POST /api/auth/reset  { token, password }
// Устанавливает новый пароль по токену из письма, гасит токен и все сессии.

import { ok, fail } from "../../_lib/respond.js";
import { hashPassword, destroyAllSessions } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  let data;
  try { data = await request.json(); } catch { return fail("Некорректный запрос."); }
  const token = String(data.token || "");
  const password = String(data.password || "");

  if (!token) return fail("Нет токена сброса.");
  if (password.length < 8) return fail("Пароль должен быть не короче 8 символов.");
  if (password.length > 200) return fail("Слишком длинный пароль.");

  const row = await env.DB.prepare(
    "SELECT user_id, expires_at FROM email_tokens WHERE token = ? AND purpose = 'reset'"
  ).bind(token).first();

  if (!row) return fail("Ссылка недействительна или уже использована.", 400);
  if (Number(row.expires_at) < Date.now()) {
    await env.DB.prepare("DELETE FROM email_tokens WHERE token = ?").bind(token).run();
    return fail("Срок действия ссылки истёк. Запросите смену пароля заново.", 400);
  }

  const { hash, salt } = await hashPassword(password);
  await env.DB.prepare(
    "UPDATE users SET password_hash = ?, password_salt = ?, email_verified = 1 WHERE id = ?"
  ).bind(hash, salt, row.user_id).run();

  await env.DB.prepare("DELETE FROM email_tokens WHERE token = ?").bind(token).run();
  await destroyAllSessions(env, row.user_id); // выкидываем из всех сессий на всякий случай

  return ok({ message: "Пароль изменён. Теперь войдите с новым паролем." });
}

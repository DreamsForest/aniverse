// POST /api/admin/setup  { secret, password }
// Одноразовая инициализация админ-аккаунта. Защищена секретом
// ADMIN_SETUP_SECRET (задаётся как секрет в Cloudflare, НЕ в коде).
// Email админа берётся из env.ADMIN_EMAIL.
//
// Создаёт (или повышает существующего) пользователя с этим email:
// role='admin', почта сразу подтверждена, пароль — переданный.
// Так пароль админа не хранится в репозитории.

import { ok, fail } from "../../_lib/respond.js";
import { hashPassword } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_SETUP_SECRET) {
    return fail("Инициализация недоступна: не задан ADMIN_SETUP_SECRET.", 403);
  }

  let data;
  try { data = await request.json(); } catch { return fail("Некорректный запрос."); }

  if (String(data.secret || "") !== env.ADMIN_SETUP_SECRET) {
    return fail("Неверный секрет.", 403);
  }

  const email = String(env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(data.password || "");
  if (!email) return fail("Не задан ADMIN_EMAIL.");
  if (password.length < 8) return fail("Пароль администратора — минимум 8 символов.");

  const { hash, salt } = await hashPassword(password);
  const now = Date.now();

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();

  if (existing) {
    await env.DB.prepare(
      `UPDATE users SET password_hash = ?, password_salt = ?, email_verified = 1,
              role = 'admin', banned_until = 0, muted_until = 0 WHERE id = ?`
    ).bind(hash, salt, existing.id).run();
    return ok({ message: "Админ-аккаунт обновлён.", email });
  }

  // придумываем свободное имя пользователя
  let username = "admin";
  for (let i = 0; i < 50; i++) {
    const taken = await env.DB.prepare("SELECT 1 FROM users WHERE username_lc = ?")
      .bind(username.toLowerCase()).first();
    if (!taken) break;
    username = "admin" + Math.floor(Math.random() * 10000);
  }

  await env.DB.prepare(
    `INSERT INTO users (email, username, username_lc, password_hash, password_salt,
                        email_verified, role, created_at)
     VALUES (?,?,?,?,?,1,'admin',?)`
  ).bind(email, username, username.toLowerCase(), hash, salt, now).run();

  return ok({ message: "Админ-аккаунт создан.", email, username });
}

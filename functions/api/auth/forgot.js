// POST /api/auth/forgot  { email }
// Запрос на сброс пароля. Если аккаунт есть и почта подтверждена —
// создаём одноразовый токен (1 час) и шлём письмо со ссылкой.
// Анти-перечисление: ответ всегда одинаковый.

import { ok, fail } from "../../_lib/respond.js";
import { randomHex } from "../../_lib/auth.js";
import { sendPasswordResetEmail } from "../../_lib/email.js";
import { rateLimit, clientIp } from "../../_lib/ratelimit.js";

export async function onRequestPost({ request, env }) {
  let data;
  try { data = await request.json(); } catch { return fail("Некорректный запрос."); }
  const email = String(data.email || "").trim().toLowerCase();
  if (!email) return fail("Введите email.");

  const allowed = await rateLimit(env, `forgot:${clientIp(request)}`, 5, 60 * 60 * 1000);
  if (!allowed) return fail("Слишком много запросов. Попробуйте позже.", 429);

  const generic = ok({ message: "Если аккаунт с таким email существует — письмо для смены пароля отправлено." });

  const user = await env.DB.prepare("SELECT id, email_verified FROM users WHERE email = ?")
    .bind(email).first();

  // Сбрасываем пароль только подтверждённым аккаунтам (иначе через сброс можно
  // «активировать» чужую неподтверждённую почту).
  if (user && user.email_verified) {
    await env.DB.prepare("DELETE FROM email_tokens WHERE user_id = ? AND purpose = 'reset'")
      .bind(user.id).run();
    const token = randomHex(32);
    const expires = Date.now() + 60 * 60 * 1000; // 1 час
    await env.DB.prepare(
      "INSERT INTO email_tokens (token, user_id, purpose, expires_at) VALUES (?,?,?,?)"
    ).bind(token, user.id, "reset", expires).run();
    const base = (env.SITE_URL || "").replace(/\/+$/, "");
    await sendPasswordResetEmail(env, email, `${base}/?reset=${token}`);
  }

  return generic;
}

// POST /api/auth/resend  { email }
// Повторно отправляет письмо подтверждения (если аккаунт есть и не подтверждён).
// Анти-перечисление: ответ всегда одинаковый.

import { ok, fail } from "../../_lib/respond.js";
import { randomHex } from "../../_lib/auth.js";
import { sendVerificationEmail } from "../../_lib/email.js";
import { rateLimit, clientIp } from "../../_lib/ratelimit.js";

export async function onRequestPost({ request, env }) {
  let data;
  try { data = await request.json(); } catch { return fail("Некорректный запрос."); }
  const email = String(data.email || "").trim().toLowerCase();
  if (!email) return fail("Введите email.");

  const allowed = await rateLimit(env, `resend:${clientIp(request)}`, 5, 60 * 60 * 1000);
  if (!allowed) return fail("Слишком много запросов. Попробуйте позже.", 429);

  const user = await env.DB.prepare("SELECT id, email_verified FROM users WHERE email = ?")
    .bind(email).first();

  if (user && !user.email_verified) {
    await env.DB.prepare("DELETE FROM email_tokens WHERE user_id = ? AND purpose = 'verify'")
      .bind(user.id).run();
    const token = randomHex(32);
    const expires = Date.now() + 24 * 60 * 60 * 1000;
    await env.DB.prepare(
      "INSERT INTO email_tokens (token, user_id, purpose, expires_at) VALUES (?,?,?,?)"
    ).bind(token, user.id, "verify", expires).run();
    const base = (env.SITE_URL || "").replace(/\/+$/, "");
    await sendVerificationEmail(env, email, `${base}/api/auth/verify?token=${token}`);
  }

  return ok({ message: "Если аккаунт существует и не подтверждён — письмо отправлено." });
}

// POST /api/auth/register  { email, username, password }
// Создаёт пользователя (неподтверждённого) и шлёт письмо со ссылкой.
// Анти-перечисление: если email уже занят — отвечаем тем же «успехом»,
// нового пользователя не создаём.

import { ok, fail } from "../../_lib/respond.js";
import { hashPassword, randomHex } from "../../_lib/auth.js";
import { sendVerificationEmail } from "../../_lib/email.js";
import { rateLimit, clientIp } from "../../_lib/ratelimit.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[A-Za-zА-Яа-яЁё0-9_]{3,20}$/;

export async function onRequestPost({ request, env }) {
  let data;
  try { data = await request.json(); } catch { return fail("Некорректный запрос."); }

  const email = String(data.email || "").trim().toLowerCase();
  const username = String(data.username || "").trim();
  const password = String(data.password || "");

  if (!EMAIL_RE.test(email)) return fail("Введите корректный email.");
  if (!USERNAME_RE.test(username)) return fail("Имя: 3–20 символов, буквы/цифры/подчёркивание.");
  if (password.length < 8) return fail("Пароль должен быть не короче 8 символов.");
  if (password.length > 200) return fail("Слишком длинный пароль.");

  // Лимит регистраций с одного IP: 5 в час.
  const allowed = await rateLimit(env, `register:${clientIp(request)}`, 5, 60 * 60 * 1000);
  if (!allowed) return fail("Слишком много попыток. Попробуйте позже.", 429);

  const usernameLc = username.toLowerCase();

  // Имя занято — об этом сообщаем (нужно для UX).
  const nameTaken = await env.DB.prepare("SELECT 1 FROM users WHERE username_lc = ?")
    .bind(usernameLc).first();
  if (nameTaken) return fail("Это имя уже занято.");

  const existing = await env.DB.prepare("SELECT id, email_verified FROM users WHERE email = ?")
    .bind(email).first();

  const genericOk = ok({ message: "Письмо с подтверждением отправлено. Проверьте почту." });

  if (existing) {
    // Email уже есть. Не раскрываем это. Если не подтверждён — тихо
    // перевыпускаем письмо, чтобы человек мог завершить регистрацию.
    if (!existing.email_verified) {
      await issueAndSend(env, existing.id, email);
    }
    return genericOk;
  }

  const { hash, salt } = await hashPassword(password);
  const now = Date.now();
  const res = await env.DB.prepare(
    `INSERT INTO users (email, username, username_lc, password_hash, password_salt, created_at)
     VALUES (?,?,?,?,?,?)`
  ).bind(email, username, usernameLc, hash, salt, now).run();

  const userId = res.meta.last_row_id;
  await issueAndSend(env, userId, email);
  return genericOk;
}

async function issueAndSend(env, userId, email) {
  // удаляем старые токены подтверждения этого юзера
  await env.DB.prepare("DELETE FROM email_tokens WHERE user_id = ? AND purpose = 'verify'")
    .bind(userId).run();
  const token = randomHex(32);
  const expires = Date.now() + 24 * 60 * 60 * 1000;
  await env.DB.prepare(
    "INSERT INTO email_tokens (token, user_id, purpose, expires_at) VALUES (?,?,?,?)"
  ).bind(token, userId, "verify", expires).run();

  const base = (env.SITE_URL || "").replace(/\/+$/, "");
  const verifyUrl = `${base}/api/auth/verify?token=${token}`;
  await sendVerificationEmail(env, email, verifyUrl);
}

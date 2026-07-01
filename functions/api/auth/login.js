// POST /api/auth/login  { email, password }
// Проверяет пароль, требует подтверждённую почту, выдаёт сессию-куку.

import { ok, fail } from "../../_lib/respond.js";
import { verifyPassword, createSession, publicUser, isBanned } from "../../_lib/auth.js";
import { rateLimit, clientIp } from "../../_lib/ratelimit.js";

export async function onRequestPost({ request, env }) {
  let data;
  try { data = await request.json(); } catch { return fail("Некорректный запрос."); }

  const email = String(data.email || "").trim().toLowerCase();
  const password = String(data.password || "");
  if (!email || !password) return fail("Введите email и пароль.");

  // Лимит попыток входа: 10 за 10 минут на IP+email.
  const allowed = await rateLimit(env, `login:${clientIp(request)}:${email}`, 10, 10 * 60 * 1000);
  if (!allowed) return fail("Слишком много попыток входа. Попробуйте позже.", 429);

  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();

  // Единое сообщение, чтобы не раскрывать, существует ли аккаунт.
  const badCreds = fail("Неверный email или пароль.", 401);
  if (!user) return badCreds;

  const okPass = await verifyPassword(password, user.password_salt, user.password_hash);
  if (!okPass) return badCreds;

  if (isBanned(user)) {
    return fail(banMessage(user), 403);
  }
  if (!user.email_verified) {
    return fail("Почта не подтверждена. Перейдите по ссылке из письма или запросите его повторно.", 403, {
      needVerify: true,
    });
  }

  const { cookie } = await createSession(env, user.id);
  return ok({ user: publicUser(user) }, { "Set-Cookie": cookie });
}

function banMessage(user) {
  const until = new Date(Number(user.banned_until)).toLocaleString("ru-RU");
  const reason = user.mod_reason ? ` Причина: ${user.mod_reason}.` : "";
  return `Аккаунт заблокирован до ${until}.${reason}`;
}

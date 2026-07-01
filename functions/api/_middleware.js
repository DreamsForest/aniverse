// Общий слой для всех /api/* запросов:
//  - защита от CSRF (Origin-проверка на изменяющих методах),
//  - перехват ошибок → аккуратный JSON-500.

import { fail, sameOrigin } from "../_lib/respond.js";

export async function onRequest(context) {
  const { request, env, next } = context;
  const method = request.method.toUpperCase();

  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    if (!sameOrigin(request, env)) {
      return fail("Запрос отклонён (недопустимый источник).", 403);
    }
  }

  try {
    return await next();
  } catch (err) {
    console.log("[api] необработанная ошибка:", err && err.stack ? err.stack : err);
    return fail("Внутренняя ошибка сервера.", 500);
  }
}

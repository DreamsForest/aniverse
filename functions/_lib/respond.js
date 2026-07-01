// Унифицированные JSON-ответы + заголовки безопасности.

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      ...extraHeaders,
    },
  });
}

export function ok(data = {}, extraHeaders = {}) {
  return json({ ok: true, ...data }, 200, extraHeaders);
}

export function fail(message, status = 400, extra = {}) {
  return json({ ok: false, error: message, ...extra }, status);
}

// Проверка, что запрос пришёл с нашего же origin (защита от CSRF).
// SameSite=Lax уже не отдаёт куку на межсайтовый POST, но Origin-проверка —
// второй рубеж на случай нестандартных клиентов.
export function sameOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return true; // нативные навигации/одинаковый источник иногда без Origin
  let allowed = [];
  try {
    allowed.push(new URL(request.url).origin);
  } catch {}
  if (env && env.SITE_URL) {
    try {
      allowed.push(new URL(env.SITE_URL).origin);
    } catch {}
  }
  return allowed.includes(origin);
}

// Простой ограничитель частоты на таблице rate_events.
// Не идеален под высокую нагрузку, но защищает от примитивного спама
// (перебор регистраций, флуд комментариями) без внешних сервисов.

export function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "0.0.0.0";
}

// Возвращает true, если действие РАЗРЕШЕНО (лимит не превышен).
export async function rateLimit(env, bucket, maxCount, windowMs) {
  const now = Date.now();
  const since = now - windowMs;
  // чистим старые записи этого бакета
  await env.DB.prepare("DELETE FROM rate_events WHERE bucket = ? AND created_at < ?")
    .bind(bucket, since).run();
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM rate_events WHERE bucket = ? AND created_at >= ?"
  ).bind(bucket, since).first();
  if ((row?.c || 0) >= maxCount) return false;
  await env.DB.prepare("INSERT INTO rate_events (bucket, created_at) VALUES (?,?)")
    .bind(bucket, now).run();
  return true;
}

// GET /api/auth/verify?token=...
// Подтверждает почту по токену из письма и редиректит на сайт.

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const base = (env.SITE_URL || url.origin).replace(/\/+$/, "");

  const redirect = (status) =>
    new Response(null, { status: 302, headers: { Location: `${base}/?verify=${status}` } });

  if (!token) return redirect("bad");

  const row = await env.DB.prepare(
    "SELECT user_id, expires_at FROM email_tokens WHERE token = ? AND purpose = 'verify'"
  ).bind(token).first();

  if (!row) return redirect("bad");
  if (Number(row.expires_at) < Date.now()) {
    await env.DB.prepare("DELETE FROM email_tokens WHERE token = ?").bind(token).run();
    return redirect("expired");
  }

  await env.DB.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").bind(row.user_id).run();
  await env.DB.prepare("DELETE FROM email_tokens WHERE token = ?").bind(token).run();
  return redirect("ok");
}

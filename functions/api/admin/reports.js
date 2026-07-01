// GET  /api/admin/reports          — открытые жалобы (только админ).
// POST /api/admin/reports {reportId} — пометить жалобу решённой.

import { ok, fail } from "../../_lib/respond.js";
import { getCurrentUser } from "../../_lib/auth.js";

async function requireAdmin(env, request) {
  const user = await getCurrentUser(env, request);
  if (!user || user.role !== "admin") return null;
  return user;
}

export async function onRequestGet({ request, env }) {
  const admin = await requireAdmin(env, request);
  if (!admin) return fail("Доступ только для администратора.", 403);

  const { results } = await env.DB.prepare(
    `SELECT r.id, r.kind, r.target_id, r.anime_id, r.reason, r.created_at,
            ru.username AS reporter_name,
            c.body AS comment_body, c.deleted AS comment_deleted,
            ca.id AS comment_author_id, ca.username AS comment_author,
            tu.id AS target_user_id, tu.username AS target_user,
            tu.banned_until AS t_ban, tu.muted_until AS t_mute
       FROM reports r
       JOIN users ru ON ru.id = r.reporter_id
       LEFT JOIN comments c ON r.kind = 'comment' AND c.id = r.target_id
       LEFT JOIN users ca   ON ca.id = c.user_id
       LEFT JOIN users tu   ON r.kind = 'user' AND tu.id = r.target_id
      WHERE r.status = 'open'
      ORDER BY r.created_at DESC
      LIMIT 200`
  ).all();

  const now = Date.now();
  const reports = results.map((r) => {
    const subjectUserId = r.kind === "comment" ? r.comment_author_id : r.target_user_id;
    const subjectName = r.kind === "comment" ? r.comment_author : r.target_user;
    const banUntil = r.kind === "comment" ? null : Number(r.t_ban) || 0;
    const muteUntil = r.kind === "comment" ? null : Number(r.t_mute) || 0;
    return {
      id: r.id,
      kind: r.kind,
      reason: r.reason,
      createdAt: r.created_at,
      reporter: r.reporter_name,
      animeId: r.anime_id || "",
      commentId: r.kind === "comment" ? r.target_id : null,
      commentBody: r.comment_body || null,
      commentDeleted: !!r.comment_deleted,
      subjectUserId,
      subjectName,
      subjectBanned: banUntil ? banUntil > now : false,
      subjectMuted: muteUntil ? muteUntil > now : false,
    };
  });

  return ok({ reports });
}

export async function onRequestPost({ request, env }) {
  const admin = await requireAdmin(env, request);
  if (!admin) return fail("Доступ только для администратора.", 403);

  let data;
  try { data = await request.json(); } catch { return fail("Некорректный запрос."); }
  const reportId = Number(data.reportId);
  if (!Number.isInteger(reportId)) return fail("Некорректная жалоба.");

  await env.DB.prepare("UPDATE reports SET status = 'resolved' WHERE id = ?").bind(reportId).run();
  return ok({});
}

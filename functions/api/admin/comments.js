// GET /api/admin/comments?offset=0&limit=50 — все комментарии со всех тайтлов
// по дате добавления (новые сверху), включая удалённые. Только админ.

import { ok, fail } from "../../_lib/respond.js";
import { getCurrentUser } from "../../_lib/auth.js";
import { levelInfo } from "../../_lib/levels.js";

export async function onRequestGet({ request, env }) {
  const admin = await getCurrentUser(env, request);
  if (!admin || admin.role !== "admin") return fail("Доступ только для администратора.", 403);

  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  // берём на 1 больше запрошенного, чтобы понять, есть ли ещё
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.anime_id, c.body, c.created_at, c.deleted, c.user_id,
            u.username, u.role, u.reputation,
            COALESCE(SUM(CASE WHEN v.value = 1  THEN 1 ELSE 0 END), 0) AS likes,
            COALESCE(SUM(CASE WHEN v.value = -1 THEN 1 ELSE 0 END), 0) AS dislikes
       FROM comments c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN comment_votes v ON v.comment_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?`
  ).bind(limit + 1, offset).all();

  const hasMore = results.length > limit;
  const page = results.slice(0, limit).map((r) => {
    const lvl = levelInfo(r.reputation);
    return {
      id: r.id,
      animeId: r.anime_id,
      body: r.body,
      createdAt: r.created_at,
      deleted: !!r.deleted,
      author: r.username,
      authorId: r.user_id,
      authorLevel: lvl.level,
      authorTier: lvl.tier,
      isAdmin: r.role === "admin",
      likes: r.likes,
      dislikes: r.dislikes,
    };
  });

  return ok({ comments: page, hasMore, offset, limit });
}

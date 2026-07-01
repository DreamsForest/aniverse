// GET /api/auth/me — текущий пользователь (или null).

import { ok } from "../../_lib/respond.js";
import { getCurrentUser, publicUser } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const user = await getCurrentUser(env, request);
  return ok({ user: publicUser(user) });
}

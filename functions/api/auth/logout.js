// POST /api/auth/logout — гасит текущую сессию.

import { ok } from "../../_lib/respond.js";
import { destroySession } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const clearCookie = await destroySession(env, request);
  return ok({}, { "Set-Cookie": clearCookie });
}

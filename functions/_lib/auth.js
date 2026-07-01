// Аутентификация: хеширование паролей (PBKDF2 через WebCrypto),
// сессии (в куке сырой токен, в БД — его SHA-256), извлечение текущего юзера.

import { levelInfo } from "./levels.js";

// Cloudflare Workers WebCrypto ограничивает PBKDF2 максимумом 100 000 итераций
// (запрос выше падает с NotSupportedError). 100k — потолок платформы.
const PBKDF2_ITERATIONS = 100000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней
const SESSION_COOKIE = "ani_session";

/* ---------- hex / random ---------- */
function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
export function randomHex(nBytes = 32) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(nBytes)));
}

/* ---------- пароли ---------- */
export async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial, 256
  );
  return { hash: bytesToHex(bits), salt: bytesToHex(salt) };
}

// Сравнение хешей за постоянное время (защита от тайминг-атак).
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password, saltHex, expectedHashHex) {
  const { hash } = await hashPassword(password, saltHex);
  return timingSafeEqual(hash, expectedHashHex);
}

/* ---------- сессии ---------- */
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return bytesToHex(buf);
}

// Создаёт сессию, возвращает { cookie } для заголовка Set-Cookie.
export async function createSession(env, userId) {
  const token = randomHex(32);
  const id = await sha256Hex(token);
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?,?,?,?)"
  ).bind(id, userId, now, now + SESSION_TTL_MS).run();
  return { cookie: serializeSessionCookie(token, SESSION_TTL_MS) };
}

export async function destroySession(env, request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) {
    const id = await sha256Hex(token);
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
  }
  return serializeSessionCookie("", 0); // кука-«гасилка»
}

// Удаляет все сессии пользователя (например, при бане).
export async function destroyAllSessions(env, userId) {
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
}

// Возвращает запись пользователя по куке сессии либо null.
export async function getCurrentUser(env, request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const id = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT s.expires_at AS sess_exp, u.*
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ?`
  ).bind(id).first();
  if (!row) return null;
  if (row.sess_exp < Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
    return null;
  }
  return row;
}

/* ---------- статусы модерации ---------- */
export function isBanned(user) {
  return user && Number(user.banned_until) > Date.now();
}
export function isMuted(user) {
  return user && Number(user.muted_until) > Date.now();
}

/* ---------- куки ---------- */
function serializeSessionCookie(token, ttlMs) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${Math.floor(ttlMs / 1000)}`,
  ];
  return parts.join("; ");
}

export function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

// Безопасное представление пользователя для отдачи клиенту
// (без хеша пароля и соли).
export function publicUser(user) {
  if (!user) return null;
  const now = Date.now();
  const lvl = levelInfo(user.reputation);
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    emailVerified: !!user.email_verified,
    banned: Number(user.banned_until) > now,
    bannedUntil: Number(user.banned_until) || 0,
    muted: Number(user.muted_until) > now,
    mutedUntil: Number(user.muted_until) || 0,
    modReason: user.mod_reason || "",
    reputation: lvl.rep,
    level: lvl.level,
    tier: lvl.tier,
  };
}

export { SESSION_COOKIE };

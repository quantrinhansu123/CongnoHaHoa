import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";

const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const DEVICE_CODE_URL = "https://auth.openai.com/api/accounts/deviceauth/usercode";
const DEVICE_TOKEN_URL = "https://auth.openai.com/api/accounts/deviceauth/token";
const OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token";
const DEVICE_VERIFICATION_URL = "https://auth.openai.com/codex/device";
const DEVICE_REDIRECT_URI = "https://auth.openai.com/deviceauth/callback";
const OAUTH_SCOPE = "openid profile email offline_access";
const CODEX_COOKIE = "hahoa_codex_session";

interface DeviceLoginState {
  kind: "device";
  user_id: string;
  device_auth_id: string;
  user_code: string;
  expires_at: number;
}

export interface CodexSession {
  kind: "session";
  user_id: string;
  access_token: string;
  refresh_token: string;
  account_id: string;
  expires_at: number;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  expires_at?: number;
  error?: string | { message?: string; code?: string };
  message?: string;
}

interface DeviceCodeResponse {
  device_auth_id?: string;
  user_code?: string;
  usercode?: string;
  interval?: number;
  expires_in?: number;
}

interface DeviceAuthorizationResponse {
  code_verifier?: string;
  code_challenge?: string;
  authorization_code?: string;
}

export class CodexOAuthError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

export function codexConfigured() {
  return Boolean(encryptionSecret());
}

export async function startCodexDeviceLogin(userId: string) {
  requireConfigured();
  const response = await codexJson<DeviceCodeResponse>(DEVICE_CODE_URL, {
    method: "POST",
    body: { client_id: CODEX_CLIENT_ID },
  });
  const deviceAuthId = String(response.device_auth_id || "");
  const userCode = String(response.user_code || response.usercode || "");
  if (!deviceAuthId || !userCode) throw new CodexOAuthError("OpenAI không trả về mã đăng nhập thiết bị.");
  const interval = clamp(Number(response.interval) || 5, 2, 15);
  const expiresIn = clamp(Number(response.expires_in) || 900, 60, 1800);
  const state: DeviceLoginState = {
    kind: "device",
    user_id: userId,
    device_auth_id: deviceAuthId,
    user_code: userCode,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
  };
  return {
    login_token: seal(state),
    user_code: userCode,
    verification_url: DEVICE_VERIFICATION_URL,
    interval,
    expires_in: expiresIn,
  };
}

export async function pollCodexDeviceLogin(loginToken: string, userId: string) {
  const state = unseal<DeviceLoginState>(loginToken);
  if (!state || state.kind !== "device" || state.user_id !== userId) throw new CodexOAuthError("Phiên đăng nhập Codex không hợp lệ.", 400);
  if (state.expires_at <= Math.floor(Date.now() / 1000)) throw new CodexOAuthError("Mã đăng nhập Codex đã hết hạn.", 410);

  let authorization: DeviceAuthorizationResponse;
  try {
    authorization = await codexJson<DeviceAuthorizationResponse>(DEVICE_TOKEN_URL, {
      method: "POST",
      body: { device_auth_id: state.device_auth_id, user_code: state.user_code },
    });
  } catch (error) {
    if (error instanceof CodexOAuthError && (error.status === 403 || error.status === 404)) return { pending: true as const };
    throw error;
  }

  const verifier = String(authorization.code_verifier || "");
  const challenge = String(authorization.code_challenge || "");
  const authorizationCode = String(authorization.authorization_code || "");
  if (!verifier || !challenge || !authorizationCode) throw new CodexOAuthError("OpenAI trả về xác nhận PKCE không hợp lệ.");
  const expected = createHash("sha256").update(verifier, "ascii").digest("base64url");
  if (!safeEqual(expected, challenge)) throw new CodexOAuthError("Xác nhận PKCE không khớp; đã huỷ đăng nhập.", 400);

  const tokens = await codexJson<TokenResponse>(OAUTH_TOKEN_URL, {
    method: "POST",
    body: {
      grant_type: "authorization_code",
      code: authorizationCode,
      redirect_uri: DEVICE_REDIRECT_URI,
      client_id: CODEX_CLIENT_ID,
      code_verifier: verifier,
    },
  });
  const session = tokenSession(tokens, userId);
  return { pending: false as const, session };
}

export async function codexAccess(request: Request, userId: string) {
  const raw = requestCookie(request, CODEX_COOKIE);
  const session = raw ? unseal<CodexSession>(raw) : null;
  if (!session || session.kind !== "session" || session.user_id !== userId || !session.access_token || !session.account_id) return null;
  if (!session.expires_at || session.expires_at > Math.floor(Date.now() / 1000) + 60) {
    return { accessToken: session.access_token, accountId: session.account_id, session, refreshed: false };
  }
  if (!session.refresh_token) return null;
  const refreshedTokens = await codexJson<TokenResponse>(OAUTH_TOKEN_URL, {
    method: "POST",
    body: {
      grant_type: "refresh_token",
      refresh_token: session.refresh_token,
      client_id: CODEX_CLIENT_ID,
      scope: OAUTH_SCOPE,
    },
  });
  if (!refreshedTokens.refresh_token) refreshedTokens.refresh_token = session.refresh_token;
  const refreshedSession = tokenSession(refreshedTokens, userId, session.account_id);
  return { accessToken: refreshedSession.access_token, accountId: refreshedSession.account_id, session: refreshedSession, refreshed: true };
}

export function codexStatus(request: Request, userId: string) {
  const raw = requestCookie(request, CODEX_COOKIE);
  const session = raw ? unseal<CodexSession>(raw) : null;
  const valid = Boolean(session && session.kind === "session" && session.user_id === userId && session.access_token && session.account_id);
  const expired = Boolean(valid && session && session.expires_at && session.expires_at <= Math.floor(Date.now() / 1000) + 30);
  return {
    configured: codexConfigured(),
    authenticated: valid && (!expired || Boolean(session?.refresh_token)),
    expired,
    message: valid ? "Codex đã đăng nhập bằng ChatGPT" : "Codex chưa đăng nhập bằng ChatGPT",
  };
}

export function setCodexCookie(response: NextResponse, session: CodexSession) {
  const encrypted = seal(session);
  if (encrypted.length > 3800) throw new CodexOAuthError("Token Codex quá lớn để lưu an toàn trong phiên trình duyệt.");
  response.cookies.set(CODEX_COOKIE, encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearCodexCookie(response: NextResponse) {
  response.cookies.set(CODEX_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

function tokenSession(tokens: TokenResponse, userId: string, fallbackAccountId = ""): CodexSession {
  const accessToken = String(tokens.access_token || "");
  if (!accessToken) throw new CodexOAuthError("OpenAI không trả về access token.");
  const accountId = accountIdFromTokens(tokens) || fallbackAccountId;
  if (!accountId) throw new CodexOAuthError("Không tìm thấy ChatGPT account ID trong token.");
  const accessClaims = jwtClaims(accessToken);
  const expiresAt = Number(accessClaims.exp || tokens.expires_at || 0)
    || Math.floor(Date.now() / 1000) + Math.max(60, Number(tokens.expires_in) || 3600);
  return {
    kind: "session",
    user_id: userId,
    access_token: accessToken,
    refresh_token: String(tokens.refresh_token || ""),
    account_id: accountId,
    expires_at: expiresAt,
  };
}

function accountIdFromTokens(tokens: TokenResponse) {
  for (const raw of [tokens.id_token, tokens.access_token]) {
    const claims = jwtClaims(String(raw || ""));
    const auth = claims["https://api.openai.com/auth"];
    if (auth && typeof auth === "object" && "chatgpt_account_id" in auth) return String(auth.chatgpt_account_id || "");
    if (claims.chatgpt_account_id) return String(claims.chatgpt_account_id);
  }
  return "";
}

function jwtClaims(token: string): Record<string, unknown> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return {};
    const parsed = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function codexJson<T>(url: string, options: { method: "POST"; body: Record<string, unknown> }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method,
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "codex_cli_rs/0.147.0" },
      body: JSON.stringify(options.body),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
  } catch (error) {
    throw new CodexOAuthError(error instanceof Error ? `Không kết nối được máy chủ Codex: ${error.message}` : "Không kết nối được máy chủ Codex.", 502);
  }
  const text = await response.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { data = {}; }
  if (!response.ok) {
    const error = data.error;
    const message = typeof error === "object" && error && "message" in error
      ? String(error.message || "")
      : String(data.message || (typeof error === "string" ? error : "") || `Codex HTTP ${response.status}`);
    throw new CodexOAuthError(message.slice(0, 500), response.status);
  }
  return data as T;
}

function seal(value: object) {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

function unseal<T>(value: string): T | null {
  try {
    const packed = Buffer.from(value, "base64url");
    if (packed.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), packed.subarray(0, 12));
    decipher.setAuthTag(packed.subarray(12, 28));
    const decrypted = Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(decrypted);
    return parsed && typeof parsed === "object" ? parsed as T : null;
  } catch {
    return null;
  }
}

function encryptionKey() {
  const secret = encryptionSecret();
  if (!secret) throw new CodexOAuthError("Chưa cấu hình CODEX_TOKEN_ENCRYPTION_KEY trên máy chủ.", 503);
  return createHash("sha256").update(secret).digest();
}

function encryptionSecret() {
  const secret = process.env.CODEX_TOKEN_ENCRYPTION_KEY?.trim() || "";
  return secret.length >= 32 ? secret : "";
}

function requireConfigured() {
  if (!codexConfigured()) throw new CodexOAuthError("Chưa cấu hình kho token Codex trên máy chủ.", 503);
}

function requestCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(value, maximum));
}

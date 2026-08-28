import { NextResponse } from "next/server";
import { CodexOAuthError, pollCodexDeviceLogin, setCodexCookie } from "@/lib/server/codex-oauth";
import { authenticateSupabaseRequest, isAdmin } from "@/lib/server/supabase-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  const auth = await authenticateSupabaseRequest(request);
  if (!auth) return NextResponse.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401 });
  if (!await isAdmin(auth)) return NextResponse.json({ error: "Chỉ quản trị viên được kết nối tài khoản Codex." }, { status: 403 });
  try {
    const body = await request.json() as { login_token?: unknown };
    const loginToken = typeof body.login_token === "string" ? body.login_token : "";
    if (!loginToken) return NextResponse.json({ error: "Thiếu phiên đăng nhập Codex." }, { status: 400 });
    const result = await pollCodexDeviceLogin(loginToken, auth.user.id);
    if (result.pending) return NextResponse.json({ pending: true, authenticated: false, message: "Đang chờ xác nhận từ OpenAI." });
    const response = NextResponse.json({ pending: false, authenticated: true, message: "Đăng nhập ChatGPT/Codex thành công." });
    setCodexCookie(response, result.session);
    return response;
  } catch (error) {
    const status = error instanceof CodexOAuthError ? error.status : 500;
    return NextResponse.json({ error: errorMessage(error) }, { status });
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Không thể xác nhận đăng nhập Codex.";
}

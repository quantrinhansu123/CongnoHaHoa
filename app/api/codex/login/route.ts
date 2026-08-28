import { NextResponse } from "next/server";
import { CodexOAuthError, startCodexDeviceLogin } from "@/lib/server/codex-oauth";
import { authenticateSupabaseRequest, isAdmin } from "@/lib/server/supabase-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  const auth = await authenticateSupabaseRequest(request);
  if (!auth) return NextResponse.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401 });
  if (!await isAdmin(auth)) return NextResponse.json({ error: "Chỉ quản trị viên được kết nối tài khoản Codex." }, { status: 403 });
  try {
    const result = await startCodexDeviceLogin(auth.user.id);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof CodexOAuthError ? error.status : 500;
    return NextResponse.json({ error: errorMessage(error) }, { status });
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Không thể bắt đầu đăng nhập Codex.";
}

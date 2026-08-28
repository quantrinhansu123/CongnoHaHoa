import { NextResponse } from "next/server";
import { clearCodexCookie, codexStatus } from "@/lib/server/codex-oauth";
import { authenticateSupabaseRequest } from "@/lib/server/supabase-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateSupabaseRequest(request);
  if (!auth) return NextResponse.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401 });
  return NextResponse.json({
    ...codexStatus(request, auth.user.id),
    fallback_available: Boolean(process.env.OPENAI_API_KEY?.trim()),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(request: Request) {
  const auth = await authenticateSupabaseRequest(request);
  if (!auth) return NextResponse.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401 });
  const response = NextResponse.json({ authenticated: false, message: "Đã ngắt kết nối ChatGPT/Codex." });
  clearCodexCookie(response);
  return response;
}

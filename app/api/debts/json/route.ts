import { NextResponse } from "next/server";
import { exportDebtJson } from "@/lib/server/debt-data";
import { authenticateSupabaseRequest } from "@/lib/server/supabase-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateSupabaseRequest(request);
  if (!auth) return NextResponse.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401 });

  try {
    const data = await exportDebtJson(auth.supabase);
    const body = JSON.stringify({
      generated_at: new Date().toISOString(),
      total_records: data.length,
      fields: ["KH", "Công", "Tổng công nợ", "Ngày nợ", "Ngày trả"],
      data,
    }, null, 2);
    const filename = `cong-no-ha-hoa-${new Date().toISOString().slice(0, 10)}.json`;
    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Không thể xuất dữ liệu công nợ.") }, { status: 500 });
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

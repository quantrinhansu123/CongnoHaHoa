import { NextRequest, NextResponse } from "next/server";

const LEGACY_HOST = "congno-ha-hoa.vercel.app";
const CANONICAL_HOST = "cong-no-ha-hoa-jade.vercel.app";

export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  if (host !== LEGACY_HOST) return NextResponse.next();

  const destination = request.nextUrl.clone();
  destination.protocol = "https:";
  destination.host = CANONICAL_HOST;
  destination.port = "";
  return NextResponse.redirect(destination, 308);
}

export const config = {
  matcher: "/:path*",
};

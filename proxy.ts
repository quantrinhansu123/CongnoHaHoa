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
  // The Jade deployment is the canonical production domain.
  // Use a temporary redirect so browsers do not cache it permanently.
  return NextResponse.redirect(destination, 307);
}

export const config = {
  matcher: "/:path*",
};

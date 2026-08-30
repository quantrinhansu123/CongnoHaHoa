import type { Metadata } from "next";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "Quản lý công nợ | NPP Hà Hoà",
  description: "Hệ thống quản lý công nợ khách hàng Nhà phân phối Hà Hoà",
  icons: {
    icon: "/logo-ha-hoa.jpg",
    shortcut: "/logo-ha-hoa.jpg",
    apple: "/logo-ha-hoa.jpg",
  },
  alternates: {
    canonical: "/",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}

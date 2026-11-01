import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

const latin = Geist({
  subsets: ["latin"],
  variable: "--font-latin",
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"],
});

const thai = Noto_Sans_Thai({
  subsets: ["thai"],
  variable: "--font-thai",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Prox Now",
  description: "Prox Now makes your street wonder-full",
  applicationName: "Prox Now",
  appleWebApp: {
    capable: true,
    title: "Prox Now",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icons/icon-180.png",
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#0B0B12",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const fontClass = [latin.variable, thai.variable].join(" ");
  return (
    <html lang="en" className={fontClass}>
      <body className="min-h-dvh bg-bg font-normal text-fg">{children}</body>
    </html>
  );
}

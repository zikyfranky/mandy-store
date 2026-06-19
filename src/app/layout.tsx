import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/layout/SiteHeader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mandy Store",
  description: "Electronics, Watches & Phones — best prices in Nigeria",
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? "https://mandy-store.vercel.app"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Announcement / promo bar */}
        <div className="brand-gradient text-white text-center text-xs sm:text-sm font-medium px-4 py-2">
          <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
            <span>🚚 Free delivery on orders over ₦50,000</span>
            <span aria-hidden="true" className="opacity-50">•</span>
            <span>Pay with Stripe, PayPal or bank transfer</span>
          </span>
        </div>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}

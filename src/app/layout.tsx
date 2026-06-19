import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { CartProvider } from "@/components/cart/CartProvider";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { getCartCount, getCart } from "@/lib/cart/queries";

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

/**
 * Server component that reads cart count + full cart and provides them to CartProvider.
 * Isolated here (instead of in RootLayout) so the Suspense boundary in RootLayout
 * can prerender the static shell while getCart() reads cookies/DB (Research Pitfall 6).
 */
async function CartShell({ children }: { children: React.ReactNode }) {
  const [count, initialCart] = await Promise.all([
    getCartCount(),
    getCart(),
  ]);
  return (
    <CartProvider initialCount={count} initialCart={initialCart}>
      {children}
      <CartDrawer />
    </CartProvider>
  );
}

/**
 * Root layout — async to accommodate the async CartShell child.
 * getCartCount() and getCart() are called inside <CartShell> which is wrapped in <Suspense>,
 * satisfying cacheComponents (PPR) requirements for dynamic cookie-based reads.
 * (Research Pitfall 6: layout becoming dynamic is expected; use Suspense for PPR compat.)
 */
export default async function RootLayout({
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
        {/*
          CartShell reads cookies via getCart() + getCartCount() — wrap in Suspense for PPR compatibility.
          The static shell (promo bar above) renders immediately; CartShell fills in
          the cart when the dynamic cookie/DB read resolves (Research Pitfall 6).
        */}
        <Suspense
          fallback={
            <CartProvider
              initialCount={0}
              initialCart={{ items: [], subtotalKobo: 0, totalQty: 0, hasOOS: false }}
            >
              <SiteHeader />
              {children}
            </CartProvider>
          }
        >
          <CartShell>
            <SiteHeader />
            {children}
          </CartShell>
        </Suspense>
      </body>
    </html>
  );
}

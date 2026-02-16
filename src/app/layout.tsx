import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { Merriweather, Source_Sans_3 } from "next/font/google";
import HeaderNav from "@/components/header-nav";
import { CATEGORY_TAXONOMY } from "@/lib/category-taxonomy";
import "./globals.css";

const heading = Merriweather({
  subsets: ["latin"],
  variable: "--font-heading",
});

const body = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://smartreviewinsights.com"),
  title: {
    default: "SmartReviewInsights",
    template: "%s | SmartReviewInsights",
  },
  description: "Structured product reviews and price-aware buying guides.",
};

const GA_MEASUREMENT_ID = "G-3REMRYBD57";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${heading.variable} ${body.variable}`}>
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
        <header className="site-header">
          <div className="shell site-header-inner">
            <Link href="/" className="brand">
              <span className="brand-mark">
                <Image src="/smartreviewinsights-logo.png" alt="SmartReviewInsights" width={170} height={44} className="brand-logo" priority />
                <span className="brand-fallback">SRI</span>
              </span>
            </Link>
            <HeaderNav items={CATEGORY_TAXONOMY} />
          </div>
        </header>

        {children}

        <footer className="site-footer">
          <div className="shell site-footer-inner">
            <p>© {new Date().getFullYear()} SmartReviewInsights</p>
            <p>We may earn commissions from affiliate links.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}

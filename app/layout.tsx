import type { Metadata, Viewport } from "next";
import { Anton, Oswald, Roboto_Mono } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  display: "swap",
});

const robotoMono = Roboto_Mono({
  variable: "--font-mono-meta",
  subsets: ["latin"],
  display: "swap",
});

const description =
  "One code on the table puts the whole card on every phone in the building: every bout with a tale of the tape, every fighter with a story, every sponsor seen.";

export const metadata: Metadata = {
  // Absolute in the built output, so shared links and og:image resolve wherever
  // this is deployed rather than only on localhost.
  metadataBase: new URL(SITE_URL),
  title: "EventIQ — digital fight programmes",
  description,
  applicationName: "EventIQ",
  openGraph: {
    type: "website",
    siteName: "EventIQ",
    title: "EventIQ — digital fight programmes",
    description,
    url: "/",
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: "EventIQ — digital fight programmes",
    description,
  },
};

export const viewport: Viewport = {
  themeColor: "#07080a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${anton.variable} ${oswald.variable} ${robotoMono.variable} h-full antialiased`}
    >
      <body className="bg-ink text-chalk min-h-full flex flex-col overflow-x-hidden">
        {/* The first thing in the tab order on every page, and out of sight
            until it has focus. A running order is fifteen bouts of headings,
            portraits and sponsor lockups before the part somebody came for, and
            the questionnaire puts a preview card ahead of the first question.
            Every route's own `<main>` carries the id this points at. */}
        <a
          href="#main"
          className="label focus:bg-chalk focus:text-ink sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:px-4 focus:py-3"
        >
          Skip to the content
        </a>
        {/* Mounted here rather than per page so that the rule about which routes
            carry EventIQ's name is written down once. It renders nothing at all
            on the programme, the questionnaire and the render stage. */}
        <SiteHeader />
        {children}
        <div className="grain" aria-hidden />
      </body>
    </html>
  );
}

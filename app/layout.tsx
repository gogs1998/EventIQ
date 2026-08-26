import type { Metadata, Viewport } from "next";
import { Anton, Oswald, Roboto_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "EventIQ — digital fight programmes",
  description:
    "Scan the code, get the whole card. Every bout with a tale of the tape, every fighter with a story, every sponsor in the room.",
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
        {children}
        <div className="grain" aria-hidden />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { ProductPageView } from "@/components/ProductPage";
import { AWARDS } from "@/lib/products";

export const metadata: Metadata = {
  title: AWARDS.meta.title,
  description: AWARDS.meta.description,
  alternates: { canonical: AWARDS.path },
  // The whole object, because a page's openGraph replaces the layout's rather
  // than merging with it. The image is opengraph-image.jpg beside this file.
  openGraph: {
    type: "website",
    siteName: "EventIQ",
    locale: "en_GB",
    title: AWARDS.meta.title,
    description: AWARDS.meta.description,
    url: AWARDS.path,
  },
  twitter: {
    card: "summary_large_image",
    title: AWARDS.meta.title,
    description: AWARDS.meta.description,
  },
};

export default function Page() {
  return <ProductPageView page={AWARDS} />;
}

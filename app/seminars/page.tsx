import type { Metadata } from "next";
import { ProductPageView } from "@/components/ProductPage";
import { SEMINARS } from "@/lib/products";

export const metadata: Metadata = {
  title: SEMINARS.meta.title,
  description: SEMINARS.meta.description,
  alternates: { canonical: SEMINARS.path },
  // The whole object, because a page's openGraph replaces the layout's rather
  // than merging with it. The image is opengraph-image.jpg beside this file.
  openGraph: {
    type: "website",
    siteName: "EventIQ",
    locale: "en_GB",
    title: SEMINARS.meta.title,
    description: SEMINARS.meta.description,
    url: SEMINARS.path,
  },
  twitter: {
    card: "summary_large_image",
    title: SEMINARS.meta.title,
    description: SEMINARS.meta.description,
  },
};

export default function Page() {
  return <ProductPageView page={SEMINARS} />;
}

"use client";

import { SPONSOR_REPORT } from "@/lib/copy";

/**
 * The browser's own print dialog, which is also its "save as PDF". The report is
 * a page with a print stylesheet rather than a PDF built in the Worker, so this
 * is the whole of the export: HANDOVER section 9a.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="border-gold/50 text-gold hover:border-gold label border px-3 py-2 transition-colors"
    >
      {SPONSOR_REPORT.print}
    </button>
  );
}

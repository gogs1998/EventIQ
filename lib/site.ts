/**
 * Canonical public address. Used for anything that has to be a real link when
 * it leaves the app — nudge messages pasted into WhatsApp, share text, and
 * printed material.
 *
 * The QR code deliberately does not use this: it reads the current origin so it
 * still works off a laptop screen in a meeting.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://eventiq.win";

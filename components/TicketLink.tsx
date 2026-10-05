"use client";

import { track } from "@/lib/analytics";
import { TICKET_LINK } from "@/lib/copy";
import type { TicketLink as Link } from "@/lib/ticket-link";

/**
 * The show's ticket link on the programme, counted when it is tapped.
 *
 * A plain line beside the date and the venue rather than a button: the page is
 * the promoter's programme, and the box office is one fact about the show among
 * several. It names the site the tap goes to, so nobody pays a stranger by
 * surprise. The count goes by beacon for the reason SponsorLink's does — the
 * tap leaves the page, and a fetch would be cancelled with it.
 */
export function TicketLink({ slug, link }: { slug: string; link: Link }) {
  return (
    <>
      <a
        href={link.href}
        target="_blank"
        rel="noreferrer"
        className="text-chalk decoration-gold/60 hover:decoration-gold underline underline-offset-4 transition-colors"
        onClick={() => track({ slug, kind: "ticket_tap" })}
      >
        {TICKET_LINK.action}
      </a>{" "}
      <span className="text-ash-dim">{TICKET_LINK.via(link.host)}</span>
    </>
  );
}

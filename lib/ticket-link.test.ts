import { describe, expect, it } from "vitest";
import { ACTION_ERRORS } from "@/lib/copy";
import { MAX_TICKET_URL, parseTicketUrl, ticketLinkFor } from "@/lib/ticket-link";

describe("parseTicketUrl", () => {
  it("keeps an https address, as the browser will read it", () => {
    expect(parseTicketUrl("https://www.skiddle.com/e/12345/")).toEqual({
      ok: true,
      url: "https://www.skiddle.com/e/12345/",
    });
    expect(parseTicketUrl(" https://Tickets.Example.COM ")).toEqual({
      ok: true,
      url: "https://tickets.example.com/",
    });
  });

  it("reads an empty box, or none at all, as taking the link off", () => {
    expect(parseTicketUrl("")).toEqual({ ok: true, url: null });
    expect(parseTicketUrl("   ")).toEqual({ ok: true, url: null });
    expect(parseTicketUrl(null)).toEqual({ ok: true, url: null });
  });

  it("asks for https from anything with another scheme, or none", () => {
    for (const typed of [
      "http://tickets.example.com/",
      "tickets.example.com/cc12",
      "javascript:alert(1)",
      "data:text/html,hello",
      "ftp://tickets.example.com/",
    ]) {
      expect(parseTicketUrl(typed)).toEqual({ ok: false, error: ACTION_ERRORS.ticketLinkNotHttps });
    }
  });

  it("refuses an address that is not somewhere a ticket is sold", () => {
    for (const typed of [
      "https://eventiq.win@phish.example/",
      "https://user:pass@tickets.example.com/",
      "https://localhost/",
      "https://10.0.0.1/",
      "https://[::1]/",
      "https://tickets/",
      "https://tickets.example.com/a b",
      "https://tickets.example.com/\tx",
      "not a link at all",
    ]) {
      expect(parseTicketUrl(typed)).toEqual({ ok: false, error: ACTION_ERRORS.ticketLinkUnreadable });
    }
    expect(parseTicketUrl(42)).toEqual({ ok: false, error: ACTION_ERRORS.ticketLinkUnreadable });
  });

  /**
   * Cut to a length, a long address is a different one, and still a valid one.
   * So the length is refused rather than trimmed.
   */
  it("refuses an address past the cap rather than cutting it short", () => {
    const base = "https://tickets.example.com/";
    const fits = base + "a".repeat(MAX_TICKET_URL - base.length);
    expect(parseTicketUrl(fits)).toEqual({ ok: true, url: fits });
    expect(parseTicketUrl(fits + "a")).toEqual({ ok: false, error: ACTION_ERRORS.ticketLinkTooLong });
  });
});

describe("ticketLinkFor", () => {
  const show = { ticketUrl: "https://www.skiddle.com/e/12345/", date: "2026-11-14" };

  it("names the site the tap goes to, without the www", () => {
    expect(ticketLinkFor(show, new Date("2026-11-01T12:00:00Z"))).toEqual({
      href: "https://www.skiddle.com/e/12345/",
      host: "skiddle.com",
    });
  });

  it("shows through the day of the show, and not the day after", () => {
    expect(ticketLinkFor(show, new Date("2026-11-14T22:30:00Z"))).not.toBeNull();
    expect(ticketLinkFor(show, new Date("2026-11-15T00:30:00Z"))).toBeNull();
  });

  it("shows nothing where no link was set", () => {
    expect(ticketLinkFor({ date: "2026-11-14" }, new Date("2026-11-01"))).toBeNull();
    expect(ticketLinkFor({ ...show, ticketUrl: null }, new Date("2026-11-01"))).toBeNull();
  });

  /** The row is checked on the way out too, so a value planted by hand is not drawn. */
  it("shows nothing for a stored value the action would have refused", () => {
    for (const ticketUrl of ["http://tickets.example.com/", "javascript:alert(1)", "https://localhost/"]) {
      expect(ticketLinkFor({ ...show, ticketUrl }, new Date("2026-11-01"))).toBeNull();
    }
  });
});

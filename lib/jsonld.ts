/**
 * The structured description of a show, for the machines that read it.
 *
 * A programme page already says the name, the date, the hall and whose show it
 * is; this says the same things in the vocabulary a search engine and a link
 * unfurler understand, so a card can turn up in an events listing rather than
 * only in a page of blue links. It is the same facts, off the same row — there
 * is nothing here a reader of the page cannot also see, which is the rule:
 * marked-up data that says more than the page is the thing search engines
 * penalise, and in this product it would also be a way of leaking a field.
 *
 * Pure, and takes the event rather than the card, so it can be tested without a
 * database and cannot start reading a clock or a session.
 *
 * **Published shows only.** The caller decides that, because it already holds a
 * card that has been through `loadVisibleCard` and knows whether it came back
 * published or as the promoter's own draft. A draft's name, venue and date in a
 * block a crawler reads is the show leaking whatever the visible page says —
 * the same failure as the two `generateMetadata` functions in section 6c.
 */

export type SportsEventInput = {
  name: string;
  /** Calendar day of the show, ISO `YYYY-MM-DD`. */
  date: string;
  /** `HH:MM` local to the venue. */
  firstBellTime: string;
  doorsTime: string;
  venue: string;
  city: string;
  /** The promotion putting the show on. */
  promoter: string;
  /** Absolute address of the programme. */
  url: string;
  tagline?: string;
};

/**
 * schema.org `SportsEvent` for one show.
 *
 * `startDate` is the first bell and `doorTime` the doors, both written without
 * an offset. That is deliberate and it is the honest thing: the database stores
 * a calendar day and a wall-clock time because that is what is printed on a
 * ticket, and inventing `+00:00` would be a claim about a timezone nobody has
 * recorded — wrong for half the year in this country alone. A local date-time
 * is valid ISO 8601 and schema.org accepts one.
 *
 * `eventAttendanceMode` is stated because the alternative is a consumer
 * guessing, and every show here is a room somebody walks into.
 */
export function sportsEventJsonLd(event: SportsEventInput): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: event.name,
    ...(event.tagline ? { description: event.tagline } : {}),
    startDate: `${event.date}T${event.firstBellTime}`,
    doorTime: `${event.date}T${event.doorsTime}`,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: event.url,
    location: {
      "@type": "Place",
      name: event.venue,
      address: { "@type": "PostalAddress", addressLocality: event.city },
    },
    organizer: { "@type": "Organization", name: event.promoter },
  };
}

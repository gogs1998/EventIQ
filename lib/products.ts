/**
 * The two product pages, /awards and /seminars: every sentence on them and
 * every picture they show, in one place where lib/products.test.ts can hold the
 * copy to the tone rules and the media to the files on disk.
 *
 * Each product was built as an app of its own (AwardsIQ and SeminarIQ, forked
 * from this one) and they are pitched here under one name: **EventIQ Awards**
 * and **EventIQ Seminars**. The app names appear once, as a subtitle, because
 * they are what the organiser's own screens in the screenshots say.
 *
 * **The examples are invented, and that is a hard rule.** The apps were built
 * for real prospective clients and seeded with their real events; nothing from
 * those may appear on a public page. The clips and screenshots here were
 * captured from each app running locally on an invented awards night and an
 * invented seminar, with EventIQ's own generated portraits of invented people.
 * Mouthguards.pro is the one real name, as everywhere else on the site: the
 * owner's business and a real sponsor, carried exactly as EventIQ carries it.
 * The test refuses the real clients' names outright, so a later edit cannot
 * put one back by accident.
 *
 * **Nothing here claims more than the apps do.** Every feature was read off
 * each app's README and roadmap; where something is planned rather than built
 * it is left out, or it says it is coming.
 *
 * The videos go through /clips/[name] like every other video on the site, so
 * an iPhone gets the byte ranges it insists on (bug 47). Each one is a name in
 * lib/clips.ts; the posters and screenshots are plain files under public/.
 */

export type ProductClip = {
  /** The name it is served under: `/clips/<clip>`. Must be in lib/clips.ts. */
  clip: string;
  poster: string;
  /** What the clip shows, as a caption and as the video's accessible name. */
  caption: string;
  title: string;
};

export type ProductScreen = {
  src: string;
  alt: string;
  title: string;
  body: string;
};

export type ProductStep = { title: string; body: string };

export type ProductPage = {
  path: "/awards" | "/seminars";
  name: string;
  /** The app it was built as, shown once as a subtitle. */
  builtAs: string;
  meta: { title: string; description: string; ogAlt: string };
  /** The invented example, running for real on the product's own site. */
  demo: { href: string; label: string };
  hero: {
    badge: string;
    headline: string;
    line: string;
    clip: ProductClip;
  };
  /** The clips beyond the hero's, each with a line of its own. */
  clips: { heading: string; body: string; items: ProductClip[] };
  organiser: { heading: string; steps: ProductStep[] };
  participant: { heading: string; who: string; steps: ProductStep[] };
  features: { heading: string; body: string; screens: ProductScreen[] };
  sponsors: { label: string; heading: string; body: string[]; screen?: ProductScreen };
  example: { heading: string; body: string };
};

/** The way in, said the way the homepage says it: no form, no invented address. */
export const PRODUCT_CTA = {
  label: "Setting one up",
  heading: "Ask the person who showed you this",
  body:
    "Both are built and set up by hand for each organiser, so there is no sign-up form. " +
    "Ask whoever showed you EventIQ and they will set yours up.",
  back: "EventIQ for fight nights",
} as const;

/** The homepage's pointer to the two pages. */
export const ALSO_FOR = {
  heading: "Also for awards nights and seminars",
  body: "The same machinery, built for two other kinds of evening.",
  awards: {
    title: "EventIQ Awards",
    body: "A programme on every table, a Nominated clip for every nominee, and winners shown as they are announced.",
  },
  seminars: {
    title: "EventIQ Seminars",
    body: "A seminar page, a private link per ticket with the waiver on it, a door list on a phone, and the photos delivered afterwards.",
  },
} as const;

export const AWARDS: ProductPage = {
  demo: {
    href: "https://awards.eventiq.win/e/north-coast-combat-awards-2027",
    label: "See the live demo",
  },
  path: "/awards",
  name: "EventIQ Awards",
  builtAs: "AwardsIQ",
  meta: {
    title: "EventIQ Awards — a digital programme for an awards night",
    description:
      "A programme behind a QR code on every table, a Nominated clip for every nominee to post before the night, and winners shown as they are announced.",
    ogAlt: "EventIQ Awards: a Nominated clip, a Winner clip and a Fight of the Year face-off from an invented awards night.",
  },
  hero: {
    badge: "For awards nights",
    headline: "Every nominee announced, with a clip of their own.",
    line:
      "One code on the table puts the running order, the host and every shortlist on every " +
      "phone in the room. Each nominee gets a Nominated clip to post before the night, and " +
      "the winners appear as they are read out.",
    clip: {
      clip: "awards-nominated.mp4",
      poster: "/products/awards/nominated.jpg",
      title: "Nominated",
      caption: "A Nominated clip in the stamp look, made from the nominee's own photograph",
    },
  },
  clips: {
    heading: "Three looks, and a clip for the winner",
    body:
      "Poster, stamp and broadcast: the organiser picks one look for the night and every clip " +
      "follows it. Each carries the nominee, the category, the event, a code to the programme " +
      "and the category sponsor's emblem. A Winner clip is made in advance and kept sealed " +
      "until that category is announced, so it can go out the moment the name is read.",
    items: [
      {
        clip: "awards-winner.mp4",
        poster: "/products/awards/winner.jpg",
        title: "Winner",
        caption: "A Winner clip in the broadcast look, with the category sponsor on the closing card",
      },
      {
        clip: "awards-fight-of-the-year.mp4",
        poster: "/products/awards/fight-of-the-year.jpg",
        title: "Fight of the Year",
        caption: "A Fight of the Year face-off in the poster look, with both fighters' photographs",
      },
    ],
  },
  organiser: {
    heading: "For the organiser",
    steps: [
      {
        title: "Put the shortlists in",
        body:
          "Categories, nominees and sponsors. A shortlist pastes in one go, with a preview first. " +
          "A nominee can be a person, a gym or a federation, and Fight of the Year takes fights " +
          "rather than people.",
      },
      {
        title: "Send every nominee one link",
        body:
          "The dashboard writes the WhatsApp message with the link in it. The chase list then shows, " +
          "category by category, who has sent their details, who has opened the link and who has " +
          "not been sent one.",
      },
      {
        title: "Pick the look",
        body:
          "One of three for the whole night. A clip is queued for every nominee who sends their " +
          "details in, made from their own photograph, never from a profile somebody else typed.",
      },
      {
        title: "Announce from your phone",
        body:
          "Record each winner whenever the judges hand it over. Nothing is public until you press " +
          "Announce, and one button announces every recorded winner if the evening runs away " +
          "from you.",
      },
      {
        title: "Hand the sponsors a report",
        body:
          "A printable page per category sponsor, from real counts. The winners go into an archive " +
          "by year and by category, with a Hall of Fame page for every inductee.",
      },
    ],
  },
  participant: {
    heading: "For the nominee",
    who: "No app, no account and no password: a private link that opens on their phone.",
    steps: [
      {
        title: "Consent comes first",
        body:
          "The notice, their age and a tick before anything else. Nothing is stored before the box " +
          "is ticked, and nothing at all for anybody under eighteen.",
      },
      {
        title: "Their profile, in their words",
        body:
          "A photograph or a club logo, their socials and a line about their year. The preview shows " +
          "exactly what the clip will show.",
      },
      {
        title: "A clip to post",
        body:
          "Their Nominated clip plays and downloads on their own page, ready for their own following " +
          "before the night. A winner gets a Winner clip once the name has been read out.",
      },
      {
        title: "A way to take it back",
        body: "A Remove my details control on their own link clears what they sent and takes the photograph down.",
      },
    ],
  },
  features: {
    heading: "What it looks like",
    body:
      "Captured from AwardsIQ running on the invented example, at phone width. The organiser's " +
      "screens say AwardsIQ because that is the app they come from.",
    screens: [
      {
        src: "/products/awards/screen-programme.webp",
        title: "The programme",
        body: "Date, venue, host and the running order, with doors and dinner between the awards.",
        alt: "The North Coast Combat Awards 2027 programme on a phone, with the date, venue, host and the start of the running order",
      },
      {
        src: "/products/awards/screen-category.webp",
        title: "A category",
        body: "Every nominee with a photograph, a citation and their own line, under the category sponsor.",
        alt: "Knockout of the Year on a phone, sponsored by Mouthguards.pro, with the announced winner and the other nominees",
      },
      {
        src: "/products/awards/screen-nominee-link.webp",
        title: "The nominee's link",
        body: "What the nominee opens. The notice and the consent come before a single field.",
        alt: "A nominee's private link on a phone, shortlisted for Breakthrough Fighter, opening with the notice before the form",
      },
      {
        src: "/products/awards/screen-chase-list.webp",
        title: "The chase list",
        body: "Category by category: who has sent their details, who opened the link, who is still to be sent one.",
        alt: "The organiser's chase list on a phone, showing which nominees have sent their details and a button to send a link on WhatsApp",
      },
      {
        src: "/products/awards/screen-winners.webp",
        title: "Winners on the night",
        body: "A recorded winner stays private until it is announced. Only the organiser can see it before then.",
        alt: "The winners screen on a phone, with one winner recorded and not yet announced, an Announce button, and two categories already announced",
      },
      {
        src: "/products/awards/screen-archive.webp",
        title: "The archive",
        body: "Winners by year and by category, building from one ceremony to the next.",
        alt: "The winners archive on a phone, listing the 2027 winners of Knockout of the Year and Fight of the Year",
      },
    ],
  },
  sponsors: {
    label: "The part that pays for it",
    heading: "A category sponsor gets the category",
    body: [
      "Their name sits on that category in the programme, and their emblem closes every Nominated " +
        "and Winner clip in it: the clips the nominees post to their own following in the weeks " +
        "before the night.",
      "Afterwards each category sponsor gets a printable page: opens of their category, plays and " +
        "shares of its clips, taps on their emblem and profile opens across the shortlist. Every " +
        "figure is a count or a nought, and the page says nothing on it is estimated. Ceremony " +
        "sponsors sit on the programme itself, in front of every guest who scans the code.",
    ],
    screen: {
      src: "/products/awards/screen-sponsor-report.webp",
      title: "The sponsor report",
      body: "One page per category sponsor, ready to print or save as a PDF.",
      alt: "The sponsor report for Knockout of the Year, sponsored by Mouthguards.pro, with counts that start at nought",
    },
  },
  example: {
    heading: "About the example",
    body:
      "North Coast Combat Awards 2027, The Northern Assembly Rooms, the host Rhona Gilchrist and " +
      "every nominee, gym, federation and fight night on this page are invented. Mouthguards.pro " +
      "is a real sponsor. The code on each clip points back to this page.",
  },
};

export const SEMINARS: ProductPage = {
  demo: {
    href: "https://seminars.eventiq.win/s/wolf-wolski-dundee",
    label: "See the live demo",
  },
  path: "/seminars",
  name: "EventIQ Seminars",
  builtAs: "SeminarIQ",
  meta: {
    title: "EventIQ Seminars — a seminar page and an attendee companion",
    description:
      "A seminar page behind a QR code, a private link for every ticket with the waiver on it, a door list on a phone, and the meet-and-greet photos delivered afterwards.",
    ogAlt: "EventIQ Seminars: an announcement clip and a countdown for an invented grappling seminar.",
  },
  hero: {
    badge: "For seminars",
    headline: "Every ticket gets a link. Every link carries the waiver.",
    line:
      "A page for the seminar behind a QR code, a private link for every ticket, a door list " +
      "on a phone, and the meet-and-greet photographs delivered to the people in them.",
    clip: {
      clip: "seminars-announcement.mp4",
      poster: "/products/seminars/announcement.jpg",
      title: "Announcement",
      caption: "An announcement clip in the poster look, built from the seminar's own details",
    },
  },
  clips: {
    heading: "Hype clips from the seminar's own details",
    body:
      "The headline coach announced in three looks, stamp, poster and broadcast, and a countdown " +
      "to the day. Vertical, for stories and reels, built from the seminar page: change a detail " +
      "and the clips change with it. They are previewed on the dashboard and rendered to video " +
      "for the organiser's own feeds; rendering straight from the dashboard is coming.",
    items: [
      {
        clip: "seminars-countdown.mp4",
        poster: "/products/seminars/countdown.jpg",
        title: "Countdown",
        caption: "A countdown clip: the days to go, the date, then the coach and the venue",
      },
    ],
  },
  organiser: {
    heading: "For the organiser",
    steps: [
      {
        title: "Build the seminar page",
        body:
          "The coach, the date, the venue, the timetable, each ticket tier and exactly what it " +
          "includes, the rules for the day, the sponsors, and a link back to your own shop.",
      },
      {
        title: "Import the orders from Shopify",
        body:
          "Export the orders as a CSV and drop it in. One attendee per ticket, so an order for three " +
          "is three links. Importing the same file again changes nothing, and every row not used is " +
          "listed with the reason.",
      },
      {
        title: "Chase the waivers",
        body:
          "Tickets per tier and who has signed, with a message to copy or an email to open for " +
          "everybody still to sign. The meet-and-greet queue is worked out from the tickets, top tier first.",
      },
      {
        title: "Check them in on the door",
        body:
          "Search by name or order number on a phone and mark them arrived. Waiver status and priority " +
          "access show at a glance, with the health note there for the desk.",
      },
      {
        title: "Send the photos afterwards",
        body:
          "Upload the meet-and-greet photographs. One named after an order number is assigned to " +
          "the tickets on that order by itself; the rest are assigned by search.",
      },
    ],
  },
  participant: {
    heading: "For the attendee",
    who: "No app and no account: one private link per ticket, from the order they already placed.",
    steps: [
      {
        title: "What their ticket includes",
        body: "Their tier and everything that comes with it, the timetable, and the rules for the day.",
      },
      {
        title: "The waiver, before the day",
        body:
          "Only what the session needs. Somebody training is asked about injuries and an emergency " +
          "contact; a spectator is asked nothing about health. The filming choice has no default.",
      },
      {
        title: "Their place in the queue",
        body: "Where they are in the meet-and-greet and roughly when, clearly marked as an estimate.",
      },
      {
        title: "Their photographs",
        body:
          "The meet-and-greet photographs arrive on the same link afterwards. Only the people " +
          "assigned to a photograph can download it.",
      },
    ],
  },
  features: {
    heading: "What it looks like",
    body:
      "Captured from SeminarIQ running on the invented example, at phone width. The organiser's " +
      "screens say SeminarIQ because that is the app they come from.",
    screens: [
      {
        src: "/products/seminars/screen-seminar-page.webp",
        title: "The seminar page",
        body: "Behind the QR code: the coach, the date, the venue and a link to the tickets.",
        alt: "The Wolf Wolski Grappling Seminar page on a phone, with the date, venue, a days-to-go count and the coach's photograph",
      },
      {
        src: "/products/seminars/screen-tickets.webp",
        title: "What each ticket includes",
        body: "Every tier and everything in it, so nobody has to ask.",
        alt: "The ticket tiers on the seminar page, from VIP+ with limited places down to Spectator and meet-and-greet",
      },
      {
        src: "/products/seminars/screen-attendee-link.webp",
        title: "The attendee's link",
        body: "The waiver and health declaration, asked once, on their phone.",
        alt: "An attendee's private link on a phone, asking about injuries, an emergency contact, the risk of training and a filming choice",
      },
      {
        src: "/products/seminars/screen-shopify-import.webp",
        title: "The Shopify import",
        body: "The same file twice changes nothing; what was not used is listed with the reason.",
        alt: "The Shopify import screen after the same file was imported again, saying every ticket was already imported and listing rows not used",
      },
      {
        src: "/products/seminars/screen-chase-list.webp",
        title: "The waiver chase list",
        body: "Who has opened their link and who has not, with a message to send to each.",
        alt: "The waiver chase list on a phone, with each ticket still to sign and buttons to copy a message, email or open the link",
      },
      {
        src: "/products/seminars/screen-door.webp",
        title: "The door",
        body: "Search, tap Arrived, and see whose waiver is still to come.",
        alt: "Door check-in on a phone, with a search box and an Arrived button beside each ticket",
      },
    ],
  },
  sponsors: {
    label: "The part that pays for it",
    heading: "A sponsor on the page and on every clip",
    body: [
      "Seminar sponsors sit on the seminar page in front of everybody who scans the code or opens " +
        "the page, and on the closing card of every hype clip the organiser posts.",
      "Afterwards the organiser prints a one-page report from real counts: page views, distinct " +
        "visits and taps on each sponsor. With nothing counted yet it says so rather than printing " +
        "noughts as though they were results.",
    ],
  },
  example: {
    heading: "About the example",
    body:
      "Northbank Seminars, the Wolf Wolski Grappling Seminar, Harbourgate Sports Hall and every " +
      "attendee on this page are invented, and Tomasz Wolski is one of the invented fighters from " +
      "the EventIQ demo card. Mouthguards.pro is a real sponsor. The code on each clip points back " +
      "to this page.",
  },
};

export const PRODUCTS = [AWARDS, SEMINARS] as const;

/** Every sentence a reader sees on one product page, for the tone tests. */
export function productStrings(page: ProductPage): string[] {
  const clips = [page.hero.clip, ...page.clips.items];
  const screens = [...page.features.screens, ...(page.sponsors.screen ? [page.sponsors.screen] : [])];
  return [
    page.name,
    page.meta.title,
    page.meta.description,
    page.meta.ogAlt,
    page.hero.badge,
    page.hero.headline,
    page.hero.line,
    page.clips.heading,
    page.clips.body,
    page.organiser.heading,
    page.participant.heading,
    page.participant.who,
    page.features.heading,
    page.features.body,
    page.sponsors.label,
    page.sponsors.heading,
    ...page.sponsors.body,
    page.example.heading,
    page.example.body,
    ...[...page.organiser.steps, ...page.participant.steps].flatMap((s) => [s.title, s.body]),
    ...clips.flatMap((c) => [c.title, c.caption]),
    ...screens.flatMap((s) => [s.title, s.body, s.alt]),
  ];
}

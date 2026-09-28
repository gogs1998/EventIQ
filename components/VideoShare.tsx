"use client";

import { useSyncExternalStore } from "react";
import { track } from "@/lib/analytics";
import { VIDEO_SHARE } from "@/lib/copy";

/**
 * The two ways a video leaves the page, and the only place either is counted.
 *
 * The download has existed since there were videos and nothing ever measured
 * it, so nobody could say whether a single fighter had posted one — which is
 * half of why the share loop was never deliberate (HANDOVER section 19 item 6).
 * Both controls now post a `video_share` through the ordinary beacon.
 *
 * **What is counted is the tap, not the post.** Nothing on this page can see
 * what happens after the file leaves the browser, and the dashboard says
 * "shared N times" about exactly this: how often somebody asked for it. A number
 * that implied a view count would be the invented engagement figure the product
 * already decided was the most dangerous thing in it.
 *
 * The share control is only drawn where the browser has `navigator.share`, which
 * is phones — where a fighter actually is. Rendering it and having it fail on a
 * desktop would be a control that does nothing, and the download beside it is
 * the same errand by another route.
 */
/** Whether the browser can share never changes during a visit, so nothing subscribes. */
const NOTHING_CHANGES = () => () => {};

export function VideoShare({
  slug,
  mp4,
  boutNumber,
  fighterId,
  title,
}: {
  slug: string;
  mp4: string;
  boutNumber: number;
  /** Set on a fighter's own page, so a promoter can see whose video went where. */
  fighterId?: string;
  /** What the sharing sheet calls it. Never a claim, just the name of the thing. */
  title: string;
}) {
  // Read from the browser rather than from state, because the server has no
  // navigator and a component that guessed at one would hydrate into a
  // different tree. The server snapshot is false, so the first paint everywhere
  // is the download on its own and the share appears where there is one.
  const canShare = useSyncExternalStore(
    NOTHING_CHANGES,
    () => typeof navigator.share === "function",
    () => false,
  );

  const counted = () =>
    track({ slug, kind: "video_share", boutNumber, ...(fighterId ? { fighterId } : {}) });

  const control =
    "border-hairline hover:border-chalk/40 label flex items-center justify-center gap-2 border py-2.5 transition-colors";

  return (
    <div className={canShare ? "grid grid-cols-2 gap-2" : "grid"}>
      <a href={mp4} download onClick={counted} className={control}>
        {VIDEO_SHARE.download}
      </a>
      {canShare ? (
        <button
          type="button"
          className={control}
          onClick={() => {
            counted();
            // The address rather than the file: a video attached to a share
            // sheet is a copy that says nothing about where it came from, and
            // the page it came from is the thing worth passing on.
            void navigator
              .share({ title, url: new URL(mp4, window.location.origin).toString() })
              .catch(() => {
                // Dismissing the sheet rejects. That is a person changing their
                // mind, not a failure to tell them about.
              });
          }}
        >
          {VIDEO_SHARE.share}
        </button>
      ) : null}
    </div>
  );
}

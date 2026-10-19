import { afterEach, describe, expect, it } from "vitest";
import { VIDEO_ROUTES, withStatedLength } from "@/lib/fixed-length";

const video = (status: number, headers: Record<string, string>) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([7, 8]));
        controller.close();
      },
    }),
    { status, headers },
  );

describe("withStatedLength", () => {
  const global = globalThis as { FixedLengthStream?: unknown };
  const lengths: number[] = [];
  const fake = class extends TransformStream<Uint8Array, Uint8Array> {
    constructor(length: number) {
      super();
      lengths.push(length);
    }
  };
  afterEach(() => {
    delete global.FixedLengthStream;
    lengths.length = 0;
  });

  it("hands the response back untouched where there is no FixedLengthStream", () => {
    const response = video(206, { "content-length": "2" });
    expect(withStatedLength(response)).toBe(response);
  });

  /** On Workers: a ranged answer that would otherwise go out chunked. */
  it("promises the stated length to the runtime, and keeps the bytes and headers", async () => {
    global.FixedLengthStream = fake;
    const held = withStatedLength(
      video(206, { "content-length": "2", "content-range": "bytes 0-1/300000" }),
    );

    expect(lengths).toEqual([2]);
    expect(held.status).toBe(206);
    expect(held.headers.get("content-range")).toBe("bytes 0-1/300000");
    expect([...new Uint8Array(await held.arrayBuffer())]).toEqual([7, 8]);
  });

  it("leaves a response with no stated length, or that is not a video answer, alone", () => {
    global.FixedLengthStream = fake;
    const unstated = video(200, {});
    const missing = video(404, { "content-length": "2" });
    expect(withStatedLength(unstated)).toBe(unstated);
    expect(withStatedLength(missing)).toBe(missing);
    expect(lengths).toEqual([]);
  });

  it("is only for the two routes that serve video", () => {
    expect(VIDEO_ROUTES.test("/clips/hero-faceoff.mp4")).toBe(true);
    expect(VIDEO_ROUTES.test("/media/renders/x/bout-1-tape-abcdef01.mp4")).toBe(true);
    expect(VIDEO_ROUTES.test("/e/cage-county-12")).toBe(false);
  });
});

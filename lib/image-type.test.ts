import { describe, expect, it } from "vitest";
import { IMAGE_EXTENSION, SERVABLE_TYPES, sniffImageType } from "@/lib/image-type";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const webp = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
]);

const bytesOf = (text: string) => new TextEncoder().encode(text);

const svg = bytesOf(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("/promoter")</script></svg>',
);

describe("sniffImageType", () => {
  it("reads the three formats the programme displays", () => {
    expect(sniffImageType(jpeg)).toBe("image/jpeg");
    expect(sniffImageType(png)).toBe("image/png");
    expect(sniffImageType(webp)).toBe("image/webp");
  });

  /**
   * The one that matters. An SVG is a document, and one served back from our own
   * origin runs its script there, so it has to be refused on the way in — the
   * declared type never reaches this function precisely because the declared
   * type is whatever the caller felt like sending.
   */
  it("refuses an SVG, whatever it claims to be", () => {
    expect(sniffImageType(svg)).toBeNull();
    expect(sniffImageType(bytesOf('<?xml version="1.0"?><svg onload="alert(1)"/>'))).toBeNull();
  });

  it("refuses a document that has been given an image's name", () => {
    expect(sniffImageType(bytesOf("<!doctype html><script>alert(1)</script>"))).toBeNull();
    expect(sniffImageType(bytesOf("GIF89a"))).toBeNull();
    expect(sniffImageType(bytesOf("%PDF-1.7"))).toBeNull();
  });

  it("refuses something too short to identify rather than guessing", () => {
    expect(sniffImageType(new Uint8Array())).toBeNull();
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    // RIFF with no WEBP behind it is a wav file, not a photograph.
    expect(sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]))).toBeNull();
  });
});

describe("what the media route will serve", () => {
  it("covers every type an upload can be stored as", () => {
    for (const type of Object.keys(IMAGE_EXTENSION)) {
      expect(SERVABLE_TYPES).toContain(type);
    }
  });

  it("does not include anything a browser would run", () => {
    expect(SERVABLE_TYPES).not.toContain("image/svg+xml");
    expect(SERVABLE_TYPES).not.toContain("text/html");
  });
});

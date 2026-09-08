import { cookieJar, currentHeaders } from "./request";

/** Stands in for `next/headers`, over the request in ./request.ts. */

export async function cookies() {
  return cookieJar;
}

export async function headers() {
  return currentHeaders();
}

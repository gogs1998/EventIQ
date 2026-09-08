import type { Ai, R2Bucket } from "@cloudflare/workers-types";
import { inviteSecretFrom } from "@/lib/invite-token";
import { currentPlatform } from "./platform";

/**
 * Stands in for lib/db in the database suite, and for nothing else.
 *
 * lib/db is the one file here that cannot be tested, because every function in
 * it reads a binding out of the OpenNext request context — which exists inside a
 * deployed Worker and inside `next dev`, and nowhere a test runs. So the suite
 * aliases that module to this one (see vitest.config.mts) and hands the same
 * functions a real local D1 and a real local R2 opened by ./platform.
 *
 * What is swapped is the lookup of the bindings and nothing else: the queries,
 * the gate in lib/visibility.ts and the promoter's actions all run exactly as
 * written, against a database with the project's own migrations applied to it.
 *
 * `moduleShape` at the foot is the guard on that: it fails the typecheck if
 * lib/db grows an export this file does not have, so a binding added there
 * cannot quietly stop being covered.
 */

export type Db = ReturnType<typeof currentPlatform>["db"];

export type SecretName = "SESSION_SECRET" | "RENDER_KEY" | "INVITE_KEY";
export type VarName = "SHOWCASE_SLUG" | "STYLISED_PORTRAITS";

/**
 * The secrets and vars this run answers with. Set per test rather than read from
 * .dev.vars, because half of what the gate does depends on a secret being unset
 * — an instance with no `RENDER_KEY` has to refuse every caller holding one
 * rather than fall open.
 */
const values = new Map<string, string>();

export function setEnv(name: SecretName | VarName, value: string | undefined): void {
  if (value === undefined) values.delete(name);
  else values.set(name, value);
}

export function clearEnv(): void {
  values.clear();
}

export async function getDb(): Promise<Db> {
  return currentPlatform().db;
}

export async function getMedia(): Promise<R2Bucket> {
  return currentPlatform().media;
}

/** No AI binding, which is also what `next dev` has. */
export async function getAi(): Promise<Ai | undefined> {
  return undefined;
}

export async function readSecret(name: SecretName): Promise<string | undefined> {
  return values.get(name) || undefined;
}

export async function readVar(name: VarName): Promise<string | undefined> {
  return values.get(name) || undefined;
}

export async function requireSecret(name: SecretName): Promise<string> {
  const value = await readSecret(name);
  if (!value) throw new Error(`${name} is not set. See DEPLOY.md.`);
  return value;
}

export async function inviteSecret(): Promise<string> {
  return inviteSecretFrom(
    { INVITE_KEY: values.get("INVITE_KEY"), SESSION_SECRET: values.get("SESSION_SECRET") },
    true,
  );
}

/**
 * A compile-time check that this stand-in still covers everything lib/db
 * exports. It is a type-only reference to the real module, so it never loads it.
 */
export const moduleShape: typeof import("@/lib/db") = {
  getDb,
  getMedia,
  getAi,
  readSecret,
  readVar,
  requireSecret,
  inviteSecret,
};

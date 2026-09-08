import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cloudflare build output. Bundled third-party code, and linting it buries
    // anything we wrote in fifty thousand warnings about minified variables.
    ".open-next/**",
    ".wrangler/**",
  ]),
  {
    /**
     * A route may not load a card for itself.
     *
     * `loadCard` fetches a show and asks nobody whether the caller may see it.
     * Every route gets one through lib/visibility.ts instead — `loadVisibleCard`
     * on a public page, `loadRenderableCard` on the capture page,
     * `loadOwnedCard` on a promoter's, `loadInvitedCard` behind an invite token
     * — so that the check cannot be left out by omission when the next route is
     * added. That has already happened three times: HANDOVER section 14, bugs
     * 23 and 27, and the inline `card.promoterId !== promoter.id` this replaced.
     *
     * The branded return types are the other half. This rule stops the import;
     * the brand stops a card that came from somewhere else being passed off as
     * one that came through a gate.
     */
    files: ["app/**/*.ts", "app/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db/queries",
              importNames: ["loadCard", "loadCardById"],
              message:
                "Load a card through lib/visibility.ts: loadVisibleCard on a public page, " +
                "loadRenderableCard on the capture page, loadOwnedCard on a promoter's, " +
                "loadInvitedCard behind an invite token. See HANDOVER section 6c.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;

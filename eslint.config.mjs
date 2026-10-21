import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

/**
 * Type-aware linting on top of the Next.js defaults.
 *
 * The Next presets are syntax-only: they never load the type checker, so they
 * cannot see a promise nobody awaited or a `catch` that swallows an error. The
 * rules below can, and that is the whole reason for the extra ~15s a lint run
 * now takes. `projectService` is what hands them the program.
 */
/** What `packages/core` may never import, in source or in its tests. */
const CORE_BANNED = [
  {
    group: ["@/*"],
    message:
      "packages/core cannot use the app's `@/` alias — it has no app. Import relatively.",
  },
  {
    group: ["@prisma/*", "prisma", "**/generated/prisma/**"],
    message:
      "packages/core must not import Prisma: the generated client pulls node:process/path/url, which no browser or Metro bundle can take. Keep the database at the edge, in lib/queries.ts or lib/stock-service.ts.",
  },
  {
    group: ["next", "next/*", "react", "react-dom", "server-only"],
    message:
      "packages/core is framework-free by contract — the API and the React Native app import it too.",
  },
];

/** Source-only: tests run in Node and are allowed the builtins. */
const CORE_BANNED_NODE = {
  group: ["node:*", "!node:crypto"],
  message:
    "Node builtins do not exist on a phone. node:crypto is the one exception, and only because no mobile entry point reaches telegram-link.ts.",
};

/**
 * What no browser bundle may reach, whichever client it belongs to.
 *
 * Two of these are subtler than they look. `@supplies/core` exports every
 * module under one wildcard, so `claude` (the Anthropic SDK, holding an API
 * key) and `telegram-link` (`node:crypto`) are as importable as `stock` is —
 * the ban on core IMPORTING Node builtins says nothing about a consumer
 * REACHING the one module that has the exception. And `@supplies/db` opens
 * with the generated Prisma client, which pulls `node:module` and fails the
 * build in a way that names a file nobody wrote.
 */
const BROWSER_BANNED = [
  {
    group: ["@supplies/db", "@supplies/db/*", "@prisma/*", "prisma", "**/generated/prisma/**"],
    message:
      "The database layer is server-side. A client goes through the API — that is what apps/api is for.",
  },
  {
    group: ["@supplies/core/claude", "@supplies/core/telegram-link", "@supplies/core/*.test"],
    message:
      "packages/core exports every module under one wildcard, and these are the server-only ones. Reaching them from a client bundle ships an SDK, a Node builtin, or a test.",
  },
  {
    group: ["node:*"],
    message:
      "Node builtins exist in neither a browser nor a Metro bundle. Metro resolves them to nothing and the app crashes on a phone.",
  },
  {
    group: ["**/apps/web/**", "**/apps/api/**", "**/apps/spa/**", "**/apps/mobile/**"],
    message:
      "Nothing under apps/ may import from another app (CLAUDE.md). If two need it, it moves into a package.",
  },
];

/**
 * The contract that makes `packages/ui` shareable rather than merely shared.
 *
 * The owner's rule, and it is the right one: a shared component is acceptable
 * only while it costs NEITHER host its own idioms. The moment this package
 * imports `next/link`, the SPA gets a Next dependency it cannot use; the
 * moment it imports `react-router`, the Next app does. Both are the kind of
 * coupling that is invisible at the import site and obvious in the bug report.
 *
 * So navigation arrives through Base UI's `render` prop and refusals come back
 * as booleans from host-supplied callbacks. That is not a style preference —
 * it is the only shape that lets one component serve two routers and two ways
 * of reporting an error. `SettingsListPanel` is the proof it works.
 */
const UI_BANNED = [
  ...BROWSER_BANNED,
  {
    group: ["next", "next/*", "next-themes", "next-auth", "server-only"],
    message:
      "packages/ui renders in a Vite SPA too. Take what you need as a prop — a Link goes in through `render`, not through an import.",
  },
  {
    group: ["react-router", "react-router/*", "@tanstack/*", "sonner"],
    message:
      "packages/ui renders inside a Next app too. The host owns routing, caching and toasts; this package takes callbacks and returns booleans.",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    /**
     * Pinned rather than detected. `eslint-plugin-react` looks for `react` in
     * the directory it is run from, and since the Next app moved to
     * `apps/web` there is no React at the workspace root — only in the two
     * clients that render. Detection then warns on every lint run and guesses.
     */
    settings: { react: { version: "19.2" } },
    rules: {
      /**
       * A Pages Router rule, and there is no Pages Router here. It looks for
       * `pages/` or `src/pages/` next to the ESLint config; that was already
       * absent before the move and merely silent, because the config sat in
       * the same directory as an App Router app it recognised.
       */
      "@next/next/no-html-link-for-pages": "off",
      /**
       * `onClick={async () => …}` is how React is written, and forbidding it
       * would mean wrapping every handler in a `void` for no gain. The rest of
       * the rule stays on, and that is the half that catches real mistakes —
       * an async function passed where a boolean is expected, or awaited in a
       * condition that is always truthy.
       */
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      /**
       * `Prisma.Decimal` is the app's number type and its `toString` is the
       * whole point of it — quantities are Decimals everywhere and printing one
       * in a template is deliberate, not the accidental "[object Object]" this
       * rule exists to stop.
       */
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allow: [{ name: "Decimal", from: "package", package: "decimal.js" }] },
      ],
    },
  },
  {
    /**
     * The boundary that makes `packages/core` worth having.
     *
     * The package's contract is that a NestJS API, a Vite SPA and a Metro
     * bundle can all import it. Nothing in the type system enforces that: a
     * single `import { Prisma }` would typecheck, pass every test, and break
     * the mobile build weeks later, in a phase where the cause is no longer
     * obvious. docs/ARCHITECTURE.md §11 calls this out as the first friction, and a
     * convention that is not enforced is a convention that breaks.
     *
     * `node:crypto` is the one exception, for `telegram-link.ts`. It is safe
     * because the package has no barrel — a mobile app importing
     * `@supplies/core/stock` never pulls that module into its graph. See
     * packages/core/CLAUDE.md.
     */
    files: ["packages/core/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { patterns: [...CORE_BANNED, CORE_BANNED_NODE] },
      ],
    },
  },
  {
    /**
     * Core's own tests keep every ban above except the Node one: they run under
     * vitest, in Node, and never reach a bundle. `gepir.test.ts` reads its
     * fixtures off disk, which is the correct thing for a test to do and would
     * be the wrong thing for a rule to prevent.
     *
     * The Prisma ban still applies here, deliberately. A test that reached for
     * the generated client would mean core's tests could no longer run in a
     * checkout without a database — which is most of what makes them portable.
     */
    files: ["packages/core/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", { patterns: CORE_BANNED }],
    },
  },
  {
    /**
     * Plain JS — config at the root, and tooling under `scripts/`. None of it
     * is in a tsconfig, so the type-aware rules have no program for it and
     * error on the parse alone.
     *
     * The pattern is `**` rather than root-only because a flat-config `files`
     * entry of `"*.mjs"` matches only the top level: `scripts/*.mjs` fell
     * through it and failed the commit gate on a parse error.
     */
    files: ["**/*.mjs", "**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    /**
     * See UI_BANNED above. Nothing in the type system enforces a package's
     * host-neutrality, and `packages/ui` is imported by two applications that
     * agree on almost nothing below the component layer.
     */
    files: ["packages/ui/**/*.ts", "packages/ui/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", { patterns: UI_BANNED }],
    },
  },
  {
    /**
     * The SPA and the React Native app are bundles with no server half at all
     * — every write goes over HTTP to `apps/api`. Reaching for `@supplies/db`
     * from either would typecheck and then fail inside the generated Prisma
     * client, a long way from the import that caused it.
     *
     * For `apps/mobile` the Node-builtin ban is the load-bearing half. A
     * browser at least fails loudly; Metro resolves `node:crypto` to nothing
     * and the app crashes on a phone, which is the most expensive place this
     * project has to find anything out. Phase 3.1 checked the built bundle for
     * `@prisma/client`, `PrismaClient` and `node:crypto` and found none — this
     * rule is what keeps that true.
     */
    files: [
      "apps/spa/**/*.ts",
      "apps/spa/**/*.tsx",
      "apps/mobile/**/*.ts",
      "apps/mobile/**/*.tsx",
    ],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            ...BROWSER_BANNED,
            {
              group: ["next", "next/*", "next-themes", "next-auth", "server-only"],
              message:
                "There is no Next in apps/spa or apps/mobile. The SPA routes with react-router and the phone with expo-router; neither has a server half.",
            },
          ],
        },
      ],
    },
  },
  {
    /**
     * The Next app has a server half, so it may hold `@supplies/db` — what it
     * may not do is grow the SPA's client-side stack. Two routers or two
     * caches in one app is how a codebase stops having an answer to "where
     * does navigation happen".
     */
    files: ["apps/web/**/*.ts", "apps/web/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react-router", "react-router/*", "@tanstack/*"],
              message:
                "The Next app routes with `next/navigation` and caches with the framework. react-router and TanStack Query belong to apps/spa.",
            },
            {
              group: ["**/apps/api/**", "**/apps/spa/**", "**/apps/mobile/**"],
              message:
                "Nothing under apps/ may import from another app (CLAUDE.md). If two need it, it moves into a package.",
            },
          ],
        },
      ],
    },
  },
  {
    /**
     * Metro and Tailwind load their config with `require`, so these two files
     * are CommonJS by requirement rather than by preference — and
     * `metro.config.js` cannot be ESM at all, because Metro reads it before
     * any transform runs.
     */
    files: ["apps/mobile/metro.config.js", "apps/mobile/tailwind.config.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  globalIgnores([
    "**/.next/**",
    // `expo export` output — a 6 MB bundle of somebody else's JavaScript,
    // produced to prove Metro resolves the workspace and consumed by nothing.
    "apps/mobile/.expo-export/**",
    "apps/mobile/.expo/**",
    "out/**",
    "build/**",
    "**/next-env.d.ts",
    // Generated by `prisma generate` — not ours to lint, and enormous.
    "packages/db/src/generated/**",
    "apps/api/src/generated/**",
    // Compiler output. `nest build` emits the API *and* the core sources it
    // pulls in, so this is a lot of files that already passed lint as source.
    "**/dist/**",
  ]),
]);

export default eslintConfig;

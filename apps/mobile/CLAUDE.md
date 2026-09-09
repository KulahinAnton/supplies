# apps/mobile — React Native, on the same engine

Expo SDK 57 + Expo Router + NativeWind 4, against the API in
[`apps/api`](../api/CLAUDE.md). Plan and phases:
[SPA_API_PORT.md](../../SPA_API_PORT.md) Phase 3.

**Status: Phase 3.1.** The scaffold exists and `app/index.tsx` proves the two
things that had to be true before any screen was worth building — the engine
runs in a Metro bundle, and the phone can reach the API. Screens land in 3.3
onward.

## Running it

```bash
pnpm mobile:dev        # expo start — scan the QR with Expo Go
pnpm mobile:android    # straight to a connected device or emulator
pnpm mobile:bundle     # expo export --platform android, no device needed
```

`mobile:bundle` is the one to run in CI or after touching `metro.config.js`.
It resolves the entire module graph and writes a Hermes bundle without any
device, so a resolution mistake surfaces in seconds rather than on a phone.

## Running it on the emulator

Android Studio's SDK lives under `$LOCALAPPDATA/Android/Sdk` and neither `adb`
nor `emulator` is on `PATH`, so call them by full path. The AVD is
`supplies_pixel_7` — Pixel 7, API 36, `google_apis`, x86_64.

```bash
SDK="$LOCALAPPDATA/Android/Sdk"; ADB="$SDK/platform-tools/adb.exe"
"$SDK/emulator/emulator.exe" -avd supplies_pixel_7 -no-snapshot-save -no-boot-anim &
until [ "$("$ADB" shell getprop sys.boot_completed | tr -d '\r')" = 1 ]; do sleep 5; done
```

Then `expo start --android` installs Expo Go and opens the app; a later reopen
is a deep link:

```bash
"$ADB" shell am start -a android.intent.action.VIEW -d "exp://10.0.2.2:8081"
```

Two Git Bash traps, both of which cost time once:

- **Device paths get rewritten.** `adb shell screencap -p /sdcard/x.png` becomes
  a Windows path and `screencap` prints its usage instead. Prefix with
  `MSYS_NO_PATHCONV=1`, or skip device paths entirely — `"$ADB" exec-out
  screencap -p > shot.png` is binary-safe and needs no `pull`.
- **`adb logcat -c` before each run.** Otherwise the previous crash is still in
  the buffer and reads as the current one. That nearly had me chasing a fixed
  bug twice.

## `metro.config.js` is the whole of Phase 3.1

Metro was written for a single application directory. pnpm gives every package
a private `node_modules` of symlinks and puts `packages/core` outside this app
entirely. Three settings bridge that, and the third is the one where the
common advice is wrong:

- `watchFolders` — the workspace root, or an edit to `packages/core` never
  rebuilds and the app serves a stale copy of a rule you just changed.
- `nodeModulesPaths` — this app's store first, then the root's.
- **`disableHierarchicalLookup` stays `false`.** Every npm/yarn monorepo guide
  turns it on, because with a hoisted `node_modules` the upward walk finds
  packages the app never declared. pnpm does not hoist: each package's private
  `node_modules` holds exactly its own dependencies, so the upward walk is how
  correct resolution happens. Turning it on here broke the bundle on
  `expo-router` → `@expo/metro-runtime` → `whatwg-fetch`, none of which this
  app declares nor should.
- `unstable_enablePackageExports` — `packages/core` publishes subpaths only
  (`./stock`, `./validation/item`) and has no barrel, deliberately, so Metro
  has to honour `exports` or nothing resolves.

One dependency **is** declared here and looks odd: `react-native-css-interop`.
NativeWind's babel preset rewrites this app's own JSX to import its runtime, so
these source files genuinely depend on it, and the upward walk from `app/`
cannot see inside `nativewind`'s private store.

## Typed routes, and a watcher quirk worth recognising

`experiments.typedRoutes` generates `.expo/types/router.d.ts`, and it does
enforce — `router.push("/nope")` is a type error. Two things about it:

- **The types only exist while `expo start` has run.** `expo export` does not
  write them, so a clean checkout typechecks with a looser `Href` and a bad
  route slips through. `pnpm mobile:bundle` in CI proves the graph resolves; it
  does not prove the links are real.
- **A file created while Metro is running is added to the route union**, even
  outside `app/` — `components/ui/button.tsx` turning up as
  `/../components/ui/button`. It is a dev-server watcher artifact, not a
  configuration error: nothing appears in the runtime route table and no
  warning is logged, and a Metro restart clears it. Worth knowing before
  anyone spends an afternoon on it.

Dynamic routes take the **object form**, not a template string:

```tsx
<Link href={{ pathname: "/items/[id]", params: { id: item.id } }} />
```

`/items/${id}` does not typecheck, and that is the point — the id travels as a
param rather than being pasted into a path.

## Tokens: SecureStore, and why the client is not the SPA's

The refresh token lives in `expo-secure-store` — the Keychain on iOS, an
EncryptedSharedPrefs blob behind the Keystore on Android — and the access token
lives in memory, because it expires in fifteen minutes and a value on disk is a
value something else can read.

`lib/api/client.ts` is a **sibling** of `apps/spa/src/api/client.ts`, not a
copy, and the difference is the whole reason it is not shared: the SPA's
refresh token is an httpOnly cookie the browser attaches by itself, so it sends
`credentials: "include"` and never sees the value. There are no cookies here,
so the token comes out of SecureStore and goes back in the request body — which
is why `POST /auth/login` answers with it *both* ways. What IS shared is
everything above: `@supplies/core/contracts`, the message catalogue, the rules.

**Never post to `/auth/refresh` yourself — call `refreshSession()`.** Refresh
tokens rotate and a replay is treated as theft; the SPA shipped a bug where the
auth bootstrap posted directly and a double-invoked effect replayed what it had
just rotated. The server now also allows a ten-second grace window, but that is
for clients that cannot coordinate at all, like two browser tabs. Inside one
process, coordinating is free.

And **logout has to send the token.** `/auth/logout` finds it in a cookie or in
the body; posting nothing returns `{ ok: true }` — it is idempotent by design —
while leaving the row live on the server, so signing out would be a local
illusion.

## Hermes has a partial `Intl`

The first thing this app did on a real device was crash: `format.ts`
constructed `Intl.PluralRules` at module scope and **Hermes does not have it**,
though it does have `DateTimeFormat`, `NumberFormat` and `Collator`. The rule
was written out in `packages/core` instead of polyfilled here — see
[packages/core/CLAUDE.md](../../packages/core/CLAUDE.md) for why the fix
belongs to the package rather than to this client.

The lesson for anything added later: **the web preview cannot find this class
of bug.** `expo start --web` runs under react-native-web in a browser with the
full ICU, so it was perfectly green while the emulator was red. Check anything
platform-sensitive on the device.

## What is shared and what is not

`@supplies/core` — the rules, the Ukrainian catalogue, the formatting, the zod
schemas. Same functions the Next app, the SPA, the API and the Telegram bot
call.

**`@supplies/ui` is not, and that is a boundary rather than a failure to
reuse** (SPA_API_PORT.md §4.3). React Native has no DOM and no Tailwind class
strings in the web sense, so the primitives are rebuilt here. The colour tokens
in `tailwind.config.js` are transcribed from `packages/ui/src/theme.css` as
hex, because React Native's colour parser does not know `oklch` and a token the
runtime cannot read renders black.

The version matrix is Expo's, not the workspace's: React 19.2.3 and React
Native 0.86.3, because `expo install --check` says so. That means a second copy
of React in the store, which is correct — no runtime is shared between a phone
and a browser, and fighting an SDK's tested matrix costs a day later.

## The bans are enforced, not documented

`eslint.config.mjs` forbids `@supplies/db`, Prisma, any `node:*` builtin, the
two server-only `@supplies/core` modules, `next/*`, and imports from a sibling
app. A browser at least fails loudly on a Node builtin; **Metro resolves it to
nothing and the app crashes on a phone**, which is the most expensive place
this project has to find anything out.

Phase 3.1 checked the exported bundle and found no `@prisma/client`, no
`PrismaClient`, no `node:crypto`. Re-run `pnpm mobile:bundle` and grep if you
ever doubt it.

## `localhost` is a lie on a phone

On an Android emulator it is the emulator's own loopback; the host machine is
`10.0.2.2`. On the iOS simulator `localhost` works. On a real device neither
does — it needs the machine's LAN address. `lib/api.ts` resolves this and
`app/index.tsx` prints the answer on screen, because getting it wrong is
indistinguishable from a dead API.

## Not painting into Android

Phase 5 is iOS, and SPA_API_PORT.md names four things that are free now and
expensive to retrofit: `react-native-safe-area-context` on every screen even
though Android mostly does not need it, no Android-only libraries,
`expo-camera` rather than anything platform-specific, and keyboard handling
written against `KeyboardAvoidingView`. The first is already in `_layout.tsx`.

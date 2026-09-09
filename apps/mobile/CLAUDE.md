# apps/mobile — React Native, on the same engine

Expo SDK 57 + Expo Router + NativeWind 4, against the API in
[`apps/api`](../api/CLAUDE.md). Plan and phases:
[SPA_API_PORT.md](../../SPA_API_PORT.md) Phase 3.

**Status: Phase 3.6 — parity.** Every screen the SPA has, this has: four
native tabs (Огляд · Запаси · Покупки · Ще), the item list and detail, the
item form, the archive, the shared shopping list, Feature 26 sets, seven
settings screens, «Рецепти», the scanner, and the four public auth routes.
3.7 is push; 3.5's APK is built on EAS.

## Four decisions where this app is not the SPA

They are all the same decision in different clothes: a phone is not a small
browser, and copying an interaction that depends on a mouse or an address bar
produces something that works and feels borrowed.

- **Drag becomes a long press.** Feature 11's shopping rows and Feature 15's
  taxonomy order are drag-and-drop on the web. Here a row opens a sheet and a
  taxonomy row has two arrows. A drag competing with the vertical scroll of
  the screen it lives on is a gesture people fire by accident.
- **Selects become chips.** The item form's category, location, unit and set
  are horizontal chip rows, not `@expo/ui`'s `Picker`. Under ten options, a
  chip row is one tap where a picker is two and shows every option without
  opening anything. A picker earns itself when hiding the list costs less than
  showing it.
- **Settings becomes an index.** The web renders eight panels on one page.
  Here the tab is a list of rows and each panel is a screen — otherwise every
  visit to the bottom panel is eight swipes.
- **The list's view state is local, not in the URL.** There is no address bar
  to put it in and no link to share, so `useItemList` keeps it in `useState`
  and only turns the search STRING into a request. `itemListSearch` still
  builds that request, which is what keeps four clients asking the same
  questions.

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

## Scanning a barcode on the emulator

Feature 21 was written down for a year as "only provable on a real device".
It is not: the emulator can hold a barcode up to its own camera, and the whole
path — mount, decode, lookup, navigate — runs unattended. Four things have to
be true, and the first two are where the time goes.

**1. The AVD needs a rear camera that renders the 3D scene.** `hw.camera.back`
defaults to `emulated`, which is a moving green test pattern that no decoder
will ever read, and on this AVD there was no rear lens at all — CameraX failed
with *"No available camera can be found. Cams:1 Id:1 Lens:1"* and the app
showed a black screen politely captioned «Наведіть камеру на штрихкод». That
failure is why `scan.tsx` has an `unavailable` outcome at all. In
`~/.android/avd/<name>.avd/config.ini`:

    hw.camera.back=virtualscene

**2. The scene's poster is behind you.** `Toren1BD` has exactly two poster
surfaces, `wall` and `table`, and their poses live in
`$LOCALAPPDATA/Android/Sdk/emulator/resources/Toren1BD.posters`. The stock
`wall` sits at `z 5.316` rotated `-150°` — out of frame when the camera opens,
so nothing you hang on it is ever seen. Moved it in front of the opening view
(the original is beside it as `Toren1BD.posters.bak`):

    poster wall
    size 1.6 1.6
    position 0 0.2 -2.0
    rotation 0 0 0
    default poster.png

This edits the Android SDK, not the repo, so it does not travel with a
checkout and an SDK update will revert it. Restoring is `cp
Toren1BD.posters.bak Toren1BD.posters`.

**3. Hang the barcode and swap it at will.**

```bash
pnpm barcode 4820000431125 barcode.png     # the seeded «Вода негазована 1,5 л»
"$SDK/emulator/emulator.exe" -avd supplies_pixel_7 \
  -virtualscene-poster "wall=$(cygpath -w barcode.png)"
"$ADB" emu virtualscene-image wall "$(cygpath -w other.png)"   # no restart
```

`cygpath -w` is not optional — `emulator.exe` is not an MSYS binary and reads
`/c/...` as a relative path. And `virtualscene-image` accepts **only** `wall`
and `table`; custom names added to the `.posters` file work at launch and are
rejected at runtime, which is the reason the image has to live on `wall`.

**4. The bars have to survive the camera.** An EAN-13 is 95 modules wide plus
22 of quiet zone, so a 1.6 m poster two metres away is about 2 cm per module —
and a decoder wants two or three pixels of each. `pnpm barcode` trims the quiet
zone to the symbology's minimum for exactly this reason; bench-decoding its
output through ZXing at descending resolutions held to ~1.9 px per module and
failed below, and the emulator's frame gave several times that.

What this proved, rather than argued: the camera mounts and streams, a scan
decodes, `GET /api/barcode/:code/item` runs, a hit `replace`s to the item (so
Back returns to the list rather than to a camera that would scan it again) and
a miss renders the code it read. The miss is the load-bearing half of the
evidence — «Штрихкоду 4820000431132 ще немає серед ваших запасів» names the
digits that came off the wall, which a mis-tap could not have produced.

Still only provable on hardware: autofocus, a curved or crumpled label, and
glare. The emulator's poster is a flat, evenly lit, perfect render.

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

## Builds: `eas.json`, and the config that cannot be JSON

Three profiles. `development` is a dev client, `preview` is a release APK for
internal distribution — the one to sideload and carry around — and
`production` is an `app-bundle`, because Play will not take an APK.
`appVersionSource: "remote"` puts the version code on EAS's side so that
shipping a build does not produce a commit whose only content is a number.

**`app.config.ts` exists for one reason: cleartext HTTP.** Android 9 blocks
`http://` from a standalone build, and Expo Go hides this — Expo Go's own
manifest permits it — so the failure appears the first time the app is a real
APK, as every request failing in a way indistinguishable from a dead API. The
`expo-build-properties` plugin can allow it, but app-wide rather than per host,
so it is switched on `EAS_BUILD_PROFILE`: allowed everywhere except
`production`, which gets none and therefore cannot talk to a dev machine at
all. That is the right failure; production points at the deployed HTTPS API.

**The API address is not in this repo, deliberately** (SPA_API_PORT.md §4.2).
`EXPO_PUBLIC_API_URL` is read by `lib/api/url.ts` and inlined at build time,
and for a cloud build it comes from an EAS environment variable rather than
from `eas.json`, because the value is the LAN address of whoever is building:

```bash
pnpm exec eas env:set --environment preview \
  --name EXPO_PUBLIC_API_URL --value "http://<your-lan-ip>:3200" --type string --visibility plaintext
pnpm exec eas build --platform android --profile preview
```

Without it the APK falls back to `10.0.2.2`, which is the emulator's name for
its host and means nothing on a phone.

`pnpm exec eas`, not `eas` — `eas-cli` is a root devDependency rather than a
global install, so the bare name only works if you happen to have one. `pnpm
dlx eas-cli` is the trap: it resolves the package and then cannot find its bin
on Windows. Expo's CLI prints a recommendation against the local install on
every run, and it is being ignored on purpose: 9 MB buys a version pinned in
the lockfile and a command that works without a network fetch, on a machine
where "eas is not recognised" has already cost an afternoon once.

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

It happened a second time, quieter. `Intl.NumberFormat` *is* on Hermes, but
`format(BigInt(n))` throws, so `formatQuantity` returned the raw wire string
and every quantity on every screen had a decimal POINT — «0.8 кг» — where the
web showed «0,8 кг». Nothing crashed and nothing logged; it was found by
reading a screenshot. Both fixes live in `packages/core`, for the reason in
[packages/core/CLAUDE.md](../../packages/core/CLAUDE.md).

The lesson for anything added later: **the web preview cannot find this class
of bug.** `expo start --web` runs under react-native-web in a browser with the
full ICU, so it was perfectly green while the emulator was red — the same probe
printed `1 234,5` on web and `1234.5` on Android in the same second. Check
anything platform-sensitive on the device.

**Console output does not reach `adb logcat`.** Under the new architecture it
goes to the Metro terminal, which is where a `console.log` probe has to be read
from — `preview_logs`, or the `expo start` window. Half an hour went into
grepping logcat for a line that was never going to be there.

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

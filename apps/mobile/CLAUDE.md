# apps/mobile — React Native, on the same engine

Expo SDK 57 + Expo Router + NativeWind 4, against the API in
[`apps/api`](../api/CLAUDE.md). Where it sits:
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md). How it was built:
[docs/archive/SPA_API_PORT.md](../../docs/archive/SPA_API_PORT.md) Phase 3.

**Status: at parity with the SPA.** Four native tabs (Огляд · Запаси ·
Покупки · Ще), the item list and detail, the item form, the archive, the shared
shopping list, Feature 26 sets, seven settings screens, «Рецепти», the
scanner, the four public auth routes, and push registration (Feature 35). A
release APK builds on EAS and has been installed and signed into.

What it cannot do yet: **reach an API away from home**, because the API is not
deployed and a production build allows no cleartext HTTP; and **receive a
push**, which needs FCM credentials on the EAS project. iOS is parked. All
three are on [docs/ROADMAP.md](../../docs/ROADMAP.md).

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

**The API address is not in this repo, deliberately** (docs/ARCHITECTURE.md §5).
`EXPO_PUBLIC_API_URL` is read by `lib/api/url.ts` and inlined at build time,
and for a cloud build it comes from an EAS environment variable rather than
from `eas.json`, because the value is the LAN address of whoever is building:

```bash
pnpm exec eas env:set --environment preview \
  --name EXPO_PUBLIC_API_URL --value "http://<your-lan-ip>:3200" --type string --visibility plaintext
pnpm exec eas build --platform android --profile preview
```

Without it the APK falls back to `10.0.2.2`, which is the emulator's name for
its host and means nothing on a phone. (A build connected to Metro — Expo Go or
a development build — uses Metro's own host instead; see "`localhost` is a lie
on a phone" below.)

`pnpm exec eas`, not `eas` — `eas-cli` is a root devDependency rather than a
global install, so the bare name only works if you happen to have one. `pnpm
dlx eas-cli` is the trap: it resolves the package and then cannot find its bin
on Windows. Expo's CLI prints a recommendation against the local install on
every run, and it is being ignored on purpose: 9 MB buys a version pinned in
the lockfile and a command that works without a network fetch, on a machine
where "eas is not recognised" has already cost an afternoon once.

## Adding `expo-notifications` ends Expo Go on Android

Not "push stops working" — **the whole app stops working**. The module throws
while it is being evaluated:

    expo-notifications: Android Push notifications (remote notifications)
    functionality provided by expo-notifications was removed from Expo Go
    with the release of SDK 53. Use a development build instead.

and Expo Router imports every route file to build its route table, so one
throw turned all twenty-odd screens into «Route "./login.tsx" is missing the
required default export». Twenty minutes of reading that message before the
cause was obvious.

`lib/push/module.ts` is the answer, and **the thing that works is checking the
environment before importing, not catching the import.** Two attempts failed
first, and both are worth knowing:

- `.catch()` on the promise. The throw is not in the entry module —
  importing anything from the package pulls in
  `DevicePushTokenAutoRegistration.fx.js`, whose *module scope* registers a
  push-token listener, which throws. That happens inside Metro's
  `loadModuleImplementation`, several frames below the `import()`.
- a `try` around the `import()` call itself. Same reason.

Both still put a red box on screen the moment somebody signed in, because
`useNotificationRouting` is mounted on the authed layout. The read-the-stack
step is what settled it: the red box names the file, and it was not the one
being imported.

So the wrapper asks `Constants.executionEnvironment` first and never reaches
the import in Expo Go on Android. It also keeps a "did this resolve to
something usable" check, because **a resolved import is not a working
module** — an earlier version settled with a half-built namespace whose
functions were `undefined`, which left the settings screen spinning on an
unhandled «undefined is not a function».

The behaviour is right in production too: a device whose notification module
will not initialise should lose its reminders, not its inventory. What it does
NOT do is let the feature be tested here — remote push needs a development
build or the APK, and the emulator has no push service either way.

## Reading a failed EAS build without a browser

`eas build:view` prints a status and `EAS_BUILD_UNKNOWN_GRADLE_ERROR`, which
says nothing. `--no-wait` and streaming both end at the same sentence. Two
hours went into guessing before finding that the build record **carries a
signed URL to the full log**:

```bash
pnpm exec eas build:view <id> --json > build.json   # .logFiles[0] is a signed URL
curl -sL --raw "<that url>" -o log.br               # served Content-Encoding: br
node -e 'require("fs").writeFileSync("log.txt", require("zlib").brotliDecompressSync(require("fs").readFileSync("log.br")))'
```

`--raw` matters: without it curl decodes the transfer and hands back something
neither gzip nor text. The result is newline-delimited JSON, one object per log
line, with a `phase` field — `RUN_EXPO_DOCTOR`, `RUN_GRADLEW` and the rest.

**`expo doctor` runs on the builder**, and its output is in there. It is the
most useful thing in the file: on the first two builds it named a missing peer,
an invalid app config key and three out-of-date packages, none of which the
error message mentioned. Run `npx expo-doctor` locally before spending a build.

## pnpm will not resolve what you did not declare — three times now

The Metro bundle step failed on the builder with `Cannot find module
'babel-preset-expo'`. `babel.config.js` names it directly, so it was always a
direct dependency; it happened to resolve locally and did not on a release
bundle. The same shape had already appeared twice, and doctor found two more:

| Package | Named by | Found by |
|---|---|---|
| `react-native-css-interop` | NativeWind's babel output | Phase 3.1, Metro |
| `zod` | `useAuthForm`'s type import | Phase 3.6, tsc |
| `babel-preset-expo` | `babel.config.js` | an EAS build failing |
| `react-native-reanimated` | peer of `react-native-css-interop` | `expo doctor` |
| `react-native-worklets` | peer of `react-native-reanimated` | `expo doctor` |

The last two carry doctor's own warning, which is the point: *"Your app may
crash outside of Expo Go without this dependency. Native module peer
dependencies must be installed directly."* Expo Go bundles them, so the
emulator never complained.

`expo.install.exclude` holds `typescript`: the SDK wants 6.0 and this
workspace is on 5.9.3 across five projects, which is its own change rather
than something to slip into a build fix. Excluding it keeps doctor's output at
21/21, so the next failure is visible instead of being the sixth line of a
standing complaint.

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

**The browser preview keeps the token in memory.** `lib/auth/token-store.web.ts`
is what Metro bundles for `expo start --web`, because `expo-secure-store`'s web
build is an empty object: the native store threw on its first write, so sign-in
in the browser failed with «Щось пішло не так» while the Network tab showed a
201 and both tokens. Not `localStorage` — a thirty-day credential readable by
any script on the origin — and not the SPA's cookie, which belongs to the real
web client. A reload signs you out, which is the right amount of persistence for
a preview. Push is refused on web for the same kind of reason (`lib/push/module.ts`).

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
reuse** (docs/ARCHITECTURE.md §4). React Native has no DOM and no Tailwind class
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
does. `lib/api/url.ts` resolves the address in this order:

1. **`EXPO_PUBLIC_API_URL`**, when set — always wins. Release builds get it
   from EAS (see Builds above).
2. **The dev server's own host**, in development. `Constants.expoConfig.hostUri`
   is the address the device already used to reach Metro — `192.168.50.34:8081`
   on a phone over Wi-Fi, `10.0.2.2:8081` on an emulator opened that way,
   `localhost:8081` in a browser — and the API runs on the same machine, so the
   same host on port 3200 is right in every case. Tunnel hostnames are skipped.
3. `10.0.2.2` on Android, `localhost` elsewhere.

Step 2 exists because the fallback alone made **`pnpm mobile:dev` + Expo Go on
a real phone** fail in the worst possible way. With no `EXPO_PUBLIC_API_URL`,
the phone called `10.0.2.2`, which on a real network is routable-looking and
answered by nobody — and the sign-in button spun forever, because React
Native's `fetch` has no timeout of its own (it builds OkHttp with zero connect,
read and write timeouts). Now every request has one: 20 s by default,
`SLOW_TIMEOUT_MS` (45 s) for the barcode lookup and recipe suggestions, whose
servers wait on third parties, and `BEST_EFFORT_TIMEOUT_MS` (5 s) for sign-out's
two courtesy calls. A refused connection and an unanswered one fail with
different messages, and both name the address — the status screen («Ще» →
«Стан збірки») prints it too.

**The firewall is the other half.** A phone reaches the API only if Windows lets
it in. Metro and the API run as the same `node.exe`, so if the phone loaded the
bundle it can normally reach port 3200 as well; if it cannot, the error now says
«API не відповідає (http://…:3200)» instead of spinning.

**Rehearse a phone that cannot reach the API on the emulator**, which runs as
root on the Google APIs image:

```bash
adb root
adb shell iptables -A OUTPUT -p tcp --dport 3200 -j DROP   # packets vanish, like a wrong IP
adb shell iptables -D OUTPUT -p tcp --dport 3200 -j DROP   # and back
```

Sign-in under the rule shows «Заходимо…» for twenty seconds and then the error;
sign-out under it takes five seconds. Both used to take forever.

## Icons come from the web app's SVG, not from a second drawing

`assets/icon.png`, `adaptive-icon.png` and `splash-icon.png` are rendered from
the same `<svg>` that draws the web app's favicon —
`apps/web/app/icon.svg` — by a throwaway Playwright script rather than a design
tool. Playwright is already a dependency, so the mark has one definition and
cannot drift between the four clients.

The adaptive foreground is the glyph at two thirds scale and centred, because
Android masks it to the launcher's shape and crops about a quarter off each
side; an icon drawn edge to edge there loses its corners. Regenerate by
re-running the script from `apps/web`, which is where `@playwright/test`
resolves — pnpm does not hoist it to the root.

## Not painting into Android

iOS is parked (decision 11 in docs/ARCHITECTURE.md §12), not cancelled. Four
things are free now and expensive to retrofit, and all four hold:
`react-native-safe-area-context` on every screen even though Android mostly
does not need it, no Android-only libraries, `expo-camera` rather than
anything platform-specific, and keyboard handling written against
`KeyboardAvoidingView`. Safe areas and the keyboard both live in
`components/ui/screen.tsx`, so no screen can forget them. Haptics are the
part of the iOS platform pass that is not done.

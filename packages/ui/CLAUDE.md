# packages/ui — the design system, shared by both web clients

The tokens, the primitives, the domain badges and the few stateful pieces that
`apps/web` and `apps/spa` both render. Why it exists rather than each app
owning its own: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) §6, and the
rule that decides what may be added here: §4 of the same file.

**Web only.** React Native has no DOM and no Tailwind class strings, so
`apps/mobile` will share `packages/core` and the API client and write its own
components. That is a real boundary, not a failure to reuse.

## What is here

| | |
|---|---|
| `theme.css` | the oklch palette, `.dark`, the radius scale, `@theme inline`, and the base layer |
| `button` `card` `dialog` `dropdown-menu` `input` `label` `separator` `switch` `textarea` | shadcn/ui on **Base UI** (not Radix — `render` prop, never `asChild`), base-nova preset |
| `state-badges` | `StockBadge` and `ExpiryBadge` |
| `barcode-scan-button` | the camera dialog: `BarcodeDetector`, with `@zxing/browser` loaded lazily as the fallback (it is larger than the rest of a first paint) |
| `settings-list-panel` | Feature 15's list: drag to reorder (dnd-kit, touch included), star a default, add, rename, delete. Categories, locations and sets all use it |
| `id-set-store`, `use-collapsed-groups`, `use-shown-archived` | per-person, per-device sets of ids in localStorage (Features 11 and 14.2), read through `useSyncExternalStore` |
| `use-item-sort` | the remembered sort mode for the items list (Feature 12.2) |
| `utils` | `cn()` |

Imported by subpath, no barrel, the same as `@supplies/core`:
`import { Button } from "@supplies/ui/button"`.

`state-badges` is domain code in a UI package on purpose. The two state axes
are shown as two separate chips (§3.4/§3.5) because an item can be well stocked
and half-expired, and every client has to make that same choice the same way.
A second copy of these colours is a second answer to "what does SOON look
like".

## Adding a component

`shadcn` is a devDependency of `apps/web`, which also holds the
`components.json`. From `apps/web`:

```bash
pnpm exec shadcn add <name>
```

Then move the file from `apps/web/components/ui/` into `packages/ui/src/`,
and change its `@/lib/utils` import to `./utils` (`components.json` still
names an alias that no longer exists). **Not `pnpm dlx shadcn`**: under
pnpm's dlx sandbox it cannot resolve `zod` and dies.

Twelve primitives that `shadcn add` had installed and nothing ever imported
were deleted when this package was extracted — `alert`, `avatar`, `badge`,
`checkbox`, `field`, `popover`, `select`, `sheet`, `skeleton`, `table`, `tabs`,
`tooltip`. Re-add one when a screen needs it, rather than carrying a design
system that is mostly unused.

## `@import` needs a `style` condition

`exports` declares the stylesheet as:

```json
"./theme.css": { "style": "./src/theme.css", "default": "./src/theme.css" }
```

Tailwind resolves CSS `@import`s itself and looks for the **`style`**
condition. A plain string target — `"./theme.css": "./src/theme.css"` — does
not resolve, and the import fails with `Can't resolve '@supplies/ui/theme.css'`.

That failure is loud, and worth keeping loud. The version to be afraid of is
the quiet one: a stylesheet that compiles, produces valid CSS, and simply has
no tokens in it, so every `bg-card` and `text-muted-foreground` in both apps
renders as nothing.

## `@source` lives here, not in the apps

`theme.css` declares `@source "."`. Tailwind's content detection follows the
entry stylesheet's own directory and skips `node_modules`, where a linked
workspace package lives — so without it the primitives' classes exist in the
source and not in the generated CSS, which looks exactly like the components
being broken. Declaring it in the package means a new consumer gets it by
importing the theme, and cannot forget.

## What deliberately stayed in the apps

- **The toaster.** `apps/web/components/ui/sonner.tsx` reads `next-themes`.
- **The theme switch.** Next uses `next-themes` with `attribute="class"`; the
  SPA has its own small hook. Both end up toggling `.dark` on the root element,
  which is all `theme.css` knows about — the tokens are shared, the mechanism
  that flips them is not.
- **The font.** Each app maps `--font-sans` itself; see either app's entry
  stylesheet.

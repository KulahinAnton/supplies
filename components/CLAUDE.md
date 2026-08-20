# components/ — UI conventions

## shadcn/ui on Base UI, not Radix

`components.json` sets `"style": "base-nova"`. The installed primitives are **Base UI**, so:

- **Use the `render` prop, not `asChild`.** `<Button render={<Link href="…" />}>` and `<DropdownMenuTrigger render={<Button …/>} />`. `asChild` does not exist and fails silently in review, not at compile time.
- Add components with the local CLI: `pnpm exec shadcn add <name>`. **Do not use `pnpm dlx shadcn`** — under pnpm's dlx sandbox it cannot resolve `zod` and dies. That is why `shadcn` is a devDependency here, as in Kvartal and AquaBill.

Installed: alert, avatar, badge, button, card, checkbox, dialog, dropdown-menu, field, input, label, popover, select, separator, sheet, skeleton, sonner, switch, table, tabs, textarea, tooltip.

## Client/server boundary

- **`lib/format.ts` must stay Prisma-free.** Client components import it for unit labels and quantity formatting; importing the generated Prisma client into a browser bundle drags `node:module` in and the Turbopack build fails with *"the chunking context does not support external modules"*. It takes a `Numeric` (anything with `toString()`), so a `Prisma.Decimal` still works without the import.
- `lib/generated/prisma/enums.ts` has no imports of its own and **is** safe to import from client components (that is how `Unit` reaches them).
- **`Decimal` does not cross the server/client boundary.** Server pages format values into strings first — see `ItemRow` in `items-list.tsx`.

## Forms

- react-hook-form + `zodResolver`, schemas from `lib/validation/`.
- **Zod messages are message keys, not prose** (PROJECT_PROMPT.md §8). Each form has a small `messageFor(key)` helper that looks the key up in `MESSAGES`. Server-action failures render through `renderMessage(result.error)`.
- Server actions return `ActionResult`; they never throw at the client, so a rule violation renders inline instead of hitting an error boundary.

## Layout

- **Mobile-first.** `AppNav` is a fixed bottom bar under `sm:` and an ordinary tab row above it — the app is used standing in a shop.
- Attention counts (expiring / restock) ride in the nav badges, so the state is visible from every page.
- Two state axes, two chips: `StockBadge` (OUT/LOW/OK) and `ExpiryBadge` (EXPIRED/SOON). They are **never** merged — an item can be well stocked and half-expired, and collapsing that hides one of them.
- Colours come from tokens in `app/globals.css` (`--warning`, `--success`, `--destructive`); badges never hardcode a hex value. Dark mode is class-based (`.dark`) via next-themes.

## dnd-kit needs an explicit `id` under SSR

`<DndContext>` derives its `aria-describedby` values from a counter that starts fresh in each environment, so the server renders `DndDescribedBy-1` and the client `DndDescribedBy-0` — a hydration mismatch on every draggable. Pass a stable `id` (`<DndContext id="shopping-list">`) and the ids become deterministic.

Not to be confused with the *other* hydration warning you will see in dev: Grammarly adds `data-gr-ext-installed` to `<body>` after the server render. That one is a browser extension, harmless, and disappears in a private window.

## `render` with a non-button element needs `nativeButton={false}`

Base UI's `Button` assumes it renders a real `<button>`. Rendering something else — most often a `next/link` — strips native button semantics (form submission, Enter/Space handling, the implicit ARIA role), so it warns:

> A component that acts as a button expected a native `<button>` because the `nativeButton` prop is true.

Whenever a Button is rendered as a link, say so:

```tsx
<Button nativeButton={false} render={<Link href="/items/new" />}>
```

The reverse case — `<DropdownMenuTrigger render={<Button …/>} />` — needs nothing, because that *does* produce a native button.

## `DropdownMenuLabel` must live inside a `DropdownMenuGroup`

Base UI's `Menu.GroupLabel` labels a group and reads that group's context, so using it loose inside the content throws at runtime:

> MenuGroupContext is missing. Menu group parts must be used within `<Menu.Group>` or `<Menu.RadioGroup>`.

It compiles fine — nothing in the types requires the parent — so this only shows up when the menu is actually opened. Wrap the label together with the items it describes:

```tsx
<DropdownMenuContent>
  <DropdownMenuGroup>
    <DropdownMenuLabel>…</DropdownMenuLabel>
    <DropdownMenuSeparator />
    <DropdownMenuItem>…</DropdownMenuItem>
  </DropdownMenuGroup>
</DropdownMenuContent>
```

Grouping the label with its items is also the correct semantics, not merely a workaround for the error.

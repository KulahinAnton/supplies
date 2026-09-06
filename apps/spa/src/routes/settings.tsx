import { useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { ArrowUpRight, Check, Copy, ExternalLink, Send } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { findDuplicateGroups, type NamedItem } from "@supplies/core/duplicates";
import { UNIT_SHORT, formatQuantityWithUnit } from "@supplies/core/format";
import { Button } from "@supplies/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@supplies/ui/card";
import { Input } from "@supplies/ui/input";
import { Label } from "@supplies/ui/label";
import { SettingsListPanel } from "@supplies/ui/settings-list-panel";
import { Switch } from "@supplies/ui/switch";
import { api, ApiError } from "../api/client";
import { keys } from "../api/keys";
import type { GroupView, Household, Member, Taxonomy } from "../api/types";
import { ErrorNote, Spinner } from "../components/feedback";

/**
 * «Налаштування» — ported from `apps/web/app/(app)/settings/page.tsx` and its
 * six panels.
 *
 * §3.5/§7 — `expiryWarnDays` and `digestHour` are household DATA, not
 * constants. The engine takes them as input, so changing the warn window here
 * changes what «Скоро зіпсується» means everywhere at once: this page, the
 * dashboard, the Telegram digest and the phone.
 *
 * Deletes are expected to be refused sometimes, and that is the interesting
 * part rather than an inconvenience. A category with items in it cannot go,
 * because the items would silently lose it.
 */

/**
 * Every panel invalidates the same things, so the list is written once.
 *
 * `household` is in it because of Feature 13: each category's day field shows
 * the household window as its placeholder, meaning "inherit this". Saving a
 * new window without refetching left every one of those placeholders quoting
 * the old number — the setting had changed and the page still described the
 * previous one. The Next app never had the bug because `router.refresh()`
 * re-renders the whole server component; here it has to be said.
 */
const TAXONOMY_KEYS: QueryKey[] = [
  keys.taxonomy,
  keys.household,
  keys.groups,
  keys.items(),
  keys.dashboard,
  keys.attention,
];

export function SettingsRoute() {
  const household = useQuery({
    queryKey: keys.household,
    queryFn: () => api.get<Household>("/api/household"),
  });
  const taxonomy = useQuery({
    queryKey: keys.taxonomy,
    queryFn: () => api.get<Taxonomy>("/api/taxonomy"),
  });
  const groups = useQuery({
    queryKey: keys.groups,
    queryFn: () => api.get<GroupView[]>("/api/groups"),
  });
  const members = useQuery({
    queryKey: keys.members,
    queryFn: () => api.get<Member[]>("/api/household/members"),
  });
  const telegram = useQuery({
    queryKey: keys.telegram,
    queryFn: () => api.get<{ linked: boolean }>("/api/telegram/linked"),
  });
  const names = useQuery({
    queryKey: keys.itemNames,
    queryFn: () => api.get<NamedItem[]>("/api/items/names"),
  });

  if (household.isPending || taxonomy.isPending) return <Spinner />;
  if (household.isError) return <ErrorNote error={household.error} />;
  if (taxonomy.isError) return <ErrorNote error={taxonomy.error} />;
  if (!household.data || !taxonomy.data) return null;

  /**
   * Feature 16.3 — computed here rather than on the server.
   *
   * The Next page runs `findDuplicateGroups` in its server component because
   * it already holds the names; this one already holds them too, from the
   * endpoint the item form uses. Same pure function from `@supplies/core`,
   * so the two clients group names identically — which is the only part that
   * matters. Adding an endpoint to run a pure function over data the client
   * already has would be a round trip for nothing.
   */
  const duplicates = names.data ? findDuplicateGroups(names.data) : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Налаштування</h1>
        <p className="text-sm text-muted-foreground">Спільні для всієї родини.</p>
      </div>

      <HouseholdPanel household={household.data} />

      <div className="grid gap-5 sm:grid-cols-2">
        <CategoryPanel
          householdWarnDays={household.data.expiryWarnDays}
          categories={taxonomy.data.categories}
        />
        <LocationPanel locations={taxonomy.data.locations} />
      </div>

      {/* Feature 26 — full width: the rows carry a name and a threshold. */}
      <ItemGroupPanel groups={groups.data ?? []} />

      <DuplicatesPanel groups={duplicates} />

      <InvitePanel members={members.data ?? []} />

      <TelegramPanel linked={telegram.data?.linked ?? false} />

      <PasswordPanel />
    </div>
  );
}

/**
 * Runs a write and answers `true` if it worked — the shape
 * `SettingsListPanel` takes, and the SPA's counterpart to the Next app's
 * `useActionRunner`. Refusals arrive as `ApiError` carrying the Ukrainian the
 * API rendered from the shared catalogue, so both clients toast the same
 * sentence for the same rule.
 */
function useWrite(invalidates: QueryKey[] = TAXONOMY_KEYS) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (work: () => Promise<unknown>) => work(),
    onSuccess: () => {
      for (const key of invalidates) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });

  async function write(work: () => Promise<unknown>): Promise<boolean> {
    try {
      await mutation.mutateAsync(work);
      return true;
    } catch (cause) {
      toast.error(
        cause instanceof ApiError ? cause.message : "Щось пішло не так. Спробуйте ще раз.",
      );
      return false;
    }
  }

  return { write, pending: mutation.isPending };
}

function HouseholdPanel({ household }: { household: Household }) {
  const { write, pending } = useWrite();
  const [values, setValues] = useState(household);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Родина</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="space-y-2">
          <Label htmlFor="household-name">Назва</Label>
          <Input
            id="household-name"
            value={values.name}
            onChange={(event) => setValues({ ...values, name: event.target.value })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="warn-days">Попереджати за (днів)</Label>
            <Input
              id="warn-days"
              type="number"
              min={0}
              max={365}
              value={values.expiryWarnDays}
              onChange={(event) =>
                setValues({ ...values, expiryWarnDays: Number(event.target.value) })
              }
            />
            <p className="text-xs text-muted-foreground">
              Скільки днів до кінця терміну вважати «псується».
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="digest-hour">Година нагадування</Label>
            <Input
              id="digest-hour"
              type="number"
              min={0}
              max={23}
              value={values.digestHour}
              onChange={(event) =>
                setValues({ ...values, digestHour: Number(event.target.value) })
              }
            />
            <p className="text-xs text-muted-foreground">
              Використовується, лише якщо запускати розсилку вручну щогодини.
              На Vercel зведення приходить о 12:00 за київським часом.
            </p>
          </div>
        </div>

        {/* Feature 32.1 — off by default. Every press of the recipe button
            spends money at an external provider, so a household that never
            asked for that does not get a tab offering it. */}
        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div className="space-y-1">
            <Label htmlFor="ai-enabled">Помічник зі стравами (AI)</Label>
            <p className="text-xs text-muted-foreground">
              Вмикає вкладку «Рецепти». Пропозиції готує Claude — це платні
              запити до зовнішнього сервісу, по одному на кожне натискання.
            </p>
          </div>
          <Switch
            id="ai-enabled"
            checked={values.aiEnabled}
            onCheckedChange={(checked) =>
              setValues({ ...values, aiEnabled: checked === true })
            }
          />
        </div>

        <Button
          disabled={pending}
          onClick={() =>
            void write(async () => {
              await api.patch("/api/settings/household", {
                name: values.name,
                expiryWarnDays: values.expiryWarnDays,
                digestHour: values.digestHour,
                aiEnabled: values.aiEnabled,
              });
              toast.success("Збережено");
            })
          }
        >
          Зберегти
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Feature 13 + 15 — categories: drag to reorder, star a default, and the one
 * thing locations do not have, a per-category expiry window.
 */
function CategoryPanel({
  categories,
  householdWarnDays,
}: {
  categories: Taxonomy["categories"];
  householdWarnDays: number;
}) {
  const { write, pending } = useWrite();
  const [edited, setEdited] = useState<Record<string, string>>({});

  const stored = (id: string) => {
    const days = categories.find((c) => c.id === id)?.expiryWarnDays;
    return days === null || days === undefined ? "" : String(days);
  };

  return (
    <SettingsListPanel
      title="Категорії"
      dndId="settings-categories"
      rows={categories.map((category) => ({
        id: category.id,
        name: category.name,
        itemCount: category._count.items,
        isDefault: category.isDefault,
      }))}
      addPlaceholder="Нова категорія"
      defaultHint="Перетягніть, щоб змінити порядок. Зірочка — категорія за замовчуванням для нових товарів."
      onReorder={(ids) => write(() => api.post("/api/settings/categories/reorder", { ids }))}
      onSetDefault={(id) => write(() => api.post(`/api/settings/categories/${id}/default`))}
      onDelete={(id) => write(() => api.del(`/api/settings/categories/${id}`))}
      onAdd={(name) => write(() => api.post("/api/settings/categories", { name }))}
      renderExtra={(base) => {
        const value = edited[base.id] ?? stored(base.id);
        const dirty = edited[base.id] !== undefined && edited[base.id] !== stored(base.id);

        return (
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={0}
              max={365}
              inputMode="numeric"
              aria-label={`Попереджати за скільки днів: ${base.name}`}
              placeholder={String(householdWarnDays)}
              className="h-8 w-16"
              value={value}
              onChange={(event) => setEdited({ ...edited, [base.id]: event.target.value })}
            />
            <span className="text-xs text-muted-foreground">дн.</span>
            {dirty ? (
              <Button
                size="icon"
                className="size-8"
                aria-label={`Зберегти ${base.name}`}
                disabled={pending}
                onClick={() =>
                  void write(async () => {
                    await api.post("/api/settings/categories", {
                      id: base.id,
                      name: base.name,
                      expiryWarnDays: edited[base.id],
                    });
                    const next = { ...edited };
                    delete next[base.id];
                    setEdited(next);
                    toast.success("Збережено");
                  })
                }
              >
                <Check className="size-4" />
              </Button>
            ) : null}
          </div>
        );
      }}
    >
      <p className="text-xs text-muted-foreground">
        Порожнє поле днів — попереджати як усюди ({householdWarnDays} дн.).
        Вкажіть своє число, щоб, наприклад, про ліки нагадувало за два тижні.
      </p>
    </SettingsListPanel>
  );
}

/** Feature 15 — identical to categories minus the expiry window. */
function LocationPanel({ locations }: { locations: Taxonomy["locations"] }) {
  const { write } = useWrite();

  return (
    <SettingsListPanel
      title="Місця зберігання"
      dndId="settings-locations"
      rows={locations.map((location) => ({
        id: location.id,
        name: location.name,
        itemCount: location._count.items,
        isDefault: location.isDefault,
      }))}
      addPlaceholder="Нове місце"
      defaultHint="Перетягніть, щоб змінити порядок. Зірочка — місце за замовчуванням для нових товарів."
      onReorder={(ids) => write(() => api.post("/api/settings/locations/reorder", { ids }))}
      onSetDefault={(id) => write(() => api.post(`/api/settings/locations/${id}/default`))}
      onDelete={(id) => write(() => api.del(`/api/settings/locations/${id}`))}
      onAdd={(name) => write(() => api.post("/api/settings/locations", { name }))}
    />
  );
}

/**
 * Feature 26 — sets of interchangeable items. Same panel minus the default
 * star (a set has no "default" to be) and plus the threshold, which is the
 * whole point: one minimum for the set instead of one per brand.
 */
function ItemGroupPanel({ groups }: { groups: GroupView[] }) {
  const { write, pending } = useWrite();
  const [edited, setEdited] = useState<Record<string, string>>({});

  return (
    <SettingsListPanel
      title="Набори товарів"
      dndId="settings-item-groups"
      rows={groups.map((group) => ({
        id: group.id,
        name: group.name,
        itemCount: group.memberCount,
        isDefault: false,
        // Feature 26.4 — how much, not only how many. The minimum being typed
        // two fields away is chosen by comparing it against this number.
        subtitle:
          group.unit === null
            ? undefined
            : `товарів: ${group.memberCount} · разом ${formatQuantityWithUnit(group.quantity, group.unit)}`,
      }))}
      addPlaceholder="Новий набір"
      defaultHint="Один мінімум на кілька взаємозамінних товарів — наприклад, молоко різних марок. Перетягніть, щоб змінити порядок."
      onReorder={(ids) => write(() => api.post("/api/settings/groups/reorder", { ids }))}
      onDelete={(id) => write(() => api.del(`/api/settings/groups/${id}`))}
      onAdd={(name) =>
        write(() => api.post("/api/settings/groups", { name, minQty: "0" }))
      }
      renderExtra={(base) => {
        const group = groups.find((g) => g.id === base.id);
        if (!group) return null;

        const value = edited[group.id] ?? group.minQty;
        const dirty = edited[group.id] !== undefined && edited[group.id] !== group.minQty;

        return (
          <div className="flex items-center gap-1.5">
            {/* The threshold lives here; what is IN the set lives on its own
                page, which is where you add and remove members. */}
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Відкрити набір ${group.name}`}
              nativeButton={false}
              render={<Link to={`/groups/${group.id}`} />}
            >
              <ArrowUpRight className="size-4" />
            </Button>
            <Input
              className="h-8 w-20"
              inputMode="decimal"
              aria-label={`Мінімум для набору ${group.name}`}
              value={value}
              onChange={(event) => setEdited({ ...edited, [group.id]: event.target.value })}
            />
            <span className="w-8 text-xs text-muted-foreground">
              {/* No members yet means no unit to count in — say nothing rather
                  than guess one. */}
              {group.unit ? UNIT_SHORT[group.unit] : "—"}
            </span>
            {dirty ? (
              <Button
                size="icon"
                variant="ghost"
                aria-label="Зберегти мінімум"
                disabled={pending}
                onClick={() =>
                  void write(async () => {
                    await api.post("/api/settings/groups", {
                      id: group.id,
                      name: group.name,
                      minQty: edited[group.id],
                    });
                    const next = { ...edited };
                    delete next[group.id];
                    setEdited(next);
                    toast.success("Збережено");
                  })
                }
              >
                <Check className="size-4" />
              </Button>
            ) : null}
          </div>
        );
      }}
    />
  );
}

/**
 * Feature 16.3 — items whose names look like each other.
 *
 * Reports only. Merging batches and movements across two items is a separate,
 * larger job; the tool available today is archiving the emptier of a pair,
 * which keeps its history and is reversible.
 */
function DuplicatesPanel({ groups }: { groups: NamedItem[][] }) {
  // No duplicates is the normal state — an empty card would be noise.
  if (groups.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Copy className="size-4 text-warning" />
          Схожі товари
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <p className="text-xs text-muted-foreground">
          Назви цих товарів схожі — можливо, це одне й те саме, додане двічі.
          Якщо так, перенесіть зайвий в архів на його сторінці: запас і історія
          збережуться.
        </p>

        <ul className="space-y-2">
          {groups.map((group) => (
            <li key={group[0]?.id} className="rounded-md border px-3 py-2">
              <ul className="flex flex-wrap gap-x-2 gap-y-1">
                {group.map((item, index) => (
                  <li key={item.id} className="text-sm">
                    <Link
                      to={`/items/${item.id}`}
                      className="text-primary underline underline-offset-4"
                    >
                      {item.name}
                    </Link>
                    {index < group.length - 1 ? (
                      <span className="text-muted-foreground"> ·</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function InvitePanel({ members }: { members: Member[] }) {
  const [link, setLink] = useState<string | null>(null);
  const { write, pending } = useWrite([]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Учасники</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <ul className="divide-y">
          {members.map((member) => (
            <li key={member.id} className="py-2">
              <div className="text-sm font-medium">{member.name}</div>
              <div className="text-xs text-muted-foreground">{member.email}</div>
            </li>
          ))}
        </ul>

        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            void write(async () => {
              const result = await api.post<{ url: string }>("/api/account/invite");
              setLink(result.url);
            })
          }
        >
          Створити запрошення
        </Button>

        {link ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Одноразове посилання, дійсне 7 днів:
            </p>
            <div className="flex gap-2">
              <Input readOnly value={link} onFocus={(e) => e.target.select()} />
              <CopyButton value={link} label="Скопіювати" />
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TelegramPanel({ linked }: { linked: boolean }) {
  const [link, setLink] = useState<string | null>(null);
  const { write, pending } = useWrite([]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Telegram</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <p className="text-sm text-muted-foreground">
          {linked
            ? "Чат прив'язано. Команди: /low, /expiring, /list, /add, /took."
            : "Прив'яжіть чат, щоб додавати запаси й дивитися список просто з Telegram."}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              void write(async () => {
                const result = await api.post<{ url: string }>("/api/telegram/link");
                setLink(result.url);
              })
            }
          >
            {linked ? "Прив'язати інший чат" : "Прив'язати Telegram"}
          </Button>

          {/*
            Feature 19.1 — the same message the daily digest sends, on demand.
            It deliberately does not mark the day as done, so the automatic one
            still arrives: the two run in parallel rather than competing.
          */}
          {linked ? (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                void write(async () => {
                  const result = await api.post<{ messages: number; hadNews: boolean }>(
                    "/api/telegram/digest",
                  );
                  toast.success(
                    result.hadNews
                      ? `Надіслано (чатів: ${result.messages})`
                      : "Немає про що нагадувати — нічого не надіслано",
                  );
                })
              }
            >
              <Send className="size-4" />
              Надіслати зведення зараз
            </Button>
          ) : null}
        </div>

        {/*
          Feature 17.1 — a link you can tap. It used to render in a read-only
          text box, which made the obvious action impossible: on a phone you
          want to open Telegram, not select a URL.
        */}
        {link ? (
          <div className="space-y-2">
            <Button
              className="w-full"
              nativeButton={false}
              render={<a href={link} target="_blank" rel="noreferrer" />}
            >
              <ExternalLink className="size-4" />
              Відкрити бота в Telegram
            </Button>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Дійсне 15 хвилин.</p>
              {/* Secondary: for linking a chat on a different device. */}
              <CopyButton value={link} label="Скопіювати" small />
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PasswordPanel() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const { write, pending } = useWrite([]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Пароль</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="space-y-2">
          <Label htmlFor="current-password">Поточний</Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-password">Новий</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
        </div>
        <Button
          disabled={pending || !current || !next}
          onClick={() =>
            void write(async () => {
              await api.post("/api/account/password", {
                currentPassword: current,
                newPassword: next,
              });
              toast.success("Пароль змінено");
              setCurrent("");
              setNext("");
            })
          }
        >
          Змінити пароль
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * `navigator.clipboard` rejects outside a secure context, and the SPA is
 * served over plain http in development — so the failure is reported rather
 * than swallowed, which is how you find out the link is still selectable by
 * hand.
 */
function CopyButton({
  value,
  label,
  small,
}: {
  value: string;
  label: string;
  small?: boolean;
}) {
  return (
    <Button
      size={small ? "sm" : "icon"}
      variant={small ? "ghost" : "outline"}
      aria-label={label}
      onClick={() => {
        navigator.clipboard.writeText(value).then(
          () => toast.success("Скопійовано"),
          () => toast.error("Не вдалося скопіювати — виділіть посилання вручну."),
        );
      }}
    >
      <Copy className={small ? "size-3.5" : "size-4"} />
      {small ? label : null}
    </Button>
  );
}

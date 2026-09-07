import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@supplies/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@supplies/ui/card";
import { Input } from "@supplies/ui/input";
import { Label } from "@supplies/ui/label";
import { Switch } from "@supplies/ui/switch";
import { api } from "../../api/client";
import type { Household } from "../../api/types";
import { useWrite } from "../../hooks/use-settings-write";

export function HouseholdPanel({ household }: { household: Household }) {
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

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@supplies/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@supplies/ui/card";
import { Input } from "@supplies/ui/input";
import { Label } from "@supplies/ui/label";
import { api } from "../../api/client";
import { useWrite } from "../../hooks/use-settings-write";

export function PasswordPanel() {
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

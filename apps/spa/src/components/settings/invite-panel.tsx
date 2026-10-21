import { useState } from "react";
import { Button } from "@supplies/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@supplies/ui/card";
import { Input } from "@supplies/ui/input";
import { api } from "../../api/client";
import type { Member } from "../../api/types";
import { useWrite } from "../../hooks/use-settings-write";
import { CopyButton } from "./copy-button";

export function InvitePanel({ members }: { members: Member[] }) {
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

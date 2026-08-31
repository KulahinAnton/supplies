"use client";

import { signOut } from "next-auth/react";
import { clearOfflineCaches } from "@/components/service-worker";
import { LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({ name, email }: { name: string; email: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Акаунт">
            <User className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        {/*
          Base UI's GroupLabel labels a Group and reads its context, so it
          throws ("MenuGroupContext is missing") if used loose in the content.
          Grouping the label with the action it describes is also the right
          structure: this is <name>'s account, and here is what you can do
          with it.
        */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="text-sm font-medium">{name}</div>
            <div className="text-xs text-muted-foreground">{email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {/* Feature 31 — the cached pages are this household's data; they
              must not outlive the session on a shared device. */}
          <DropdownMenuItem
            onClick={async () => {
              await clearOfflineCaches();
              await signOut({ callbackUrl: "/login" });
            }}
          >
            <LogOut className="size-4" />
            Вийти
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

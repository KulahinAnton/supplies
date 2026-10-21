import { LogOut, User } from "lucide-react";
import { Button } from "@supplies/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@supplies/ui/dropdown-menu";

/**
 * Ported from `apps/web/components/user-menu.tsx`. Only the sign-out differs:
 * Auth.js `signOut()` there, the auth context's own here — which revokes the
 * refresh token server-side rather than only clearing a cookie.
 */
export function UserMenu({
  name,
  email,
  onSignOut,
}: {
  name: string;
  email: string;
  onSignOut: () => void;
}) {
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
        */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="text-sm font-medium">{name}</div>
            <div className="text-xs text-muted-foreground">{email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onSignOut}>
            <LogOut className="size-4" />
            Вийти
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

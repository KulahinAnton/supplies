import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@supplies/ui/button";

/**
 * `navigator.clipboard` rejects outside a secure context, and the SPA is
 * served over plain http in development — so the failure is reported rather
 * than swallowed, which is how you find out the link is still selectable by
 * hand.
 */
export function CopyButton({
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

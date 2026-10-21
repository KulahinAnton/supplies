import { Plus } from "lucide-react";
import { Button } from "@supplies/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@supplies/ui/card";
import type { Candidate } from "./types";

/**
 * Feature 6 — candidates are SUGGESTIONS.
 *
 * Nothing is inserted automatically, because a list that fills itself stops
 * being read: if the app decides what you need, the only way to know what is
 * actually on the list is to audit it, and nobody audits a shopping list in a
 * supermarket. Each row says why it is here, so the offer can be judged rather
 * than trusted.
 */
export function CandidatesCard({
  candidates,
  pending,
  onAdd,
}: {
  candidates: Candidate[];
  pending: boolean;
  onAdd: (candidate: Candidate) => void;
}) {
  if (candidates.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Схоже, треба купити</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y">
          {candidates.map((candidate) => (
            <li
              key={candidate.itemId ?? `group:${candidate.name}`}
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{candidate.name}</div>
                <div className="text-xs text-muted-foreground">{candidate.detail}</div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => onAdd(candidate)}
              >
                <Plus className="size-3.5" />
                Додати
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

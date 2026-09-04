import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSession } from "@/lib/auth-guard";
import { getItemGroupDetail } from "@/lib/queries";
import { formatQuantityWithUnit, UNIT_SHORT } from "@supplies/core/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StockBadge } from "@/components/state-badges";
import { GroupMembers } from "@/components/group-members";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const detail = await getItemGroupDetail(session.householdId, id);
  if (!detail) notFound();

  const { group, view, members, candidates } = detail;

  return (
    <div className="space-y-5">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        nativeButton={false}
        render={<Link href="/groups" />}
      >
        <ArrowLeft className="size-4" />
        Набори
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{group.name}</h1>
        <p className="text-sm text-muted-foreground">
          Взаємозамінні товари — рахуються разом.
        </p>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between gap-4 py-5">
          <div>
            <div className="text-3xl font-semibold tabular-nums">
              {/* No members means no unit to count in; do not invent one. */}
              {view.unit ? formatQuantityWithUnit(view.quantity, view.unit) : "—"}
            </div>
            <div className="text-xs text-muted-foreground">
              {view.minQty.greaterThan(0)
                ? `мінімум ${view.minQty.toString()}${view.unit ? ` ${UNIT_SHORT[view.unit]}` : ""} на весь набір`
                : "мінімум не задано — набір не нагадує про себе"}
            </div>
          </div>
          {/* An empty set has no meaningful state to show. */}
          {members.length > 0 ? <StockBadge state={view.state} /> : null}
        </CardContent>
      </Card>

      <GroupMembers
        groupId={group.id}
        members={members.map((member) => ({
          id: member.id,
          name: member.name,
          quantityLabel: formatQuantityWithUnit(member.quantity, member.unit),
        }))}
        candidates={candidates.map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          unitLabel: UNIT_SHORT[candidate.unit],
          barcode: candidate.barcode,
          currentGroupName: candidate.currentGroupName,
          compatible: candidate.compatible,
        }))}
      />
    </div>
  );
}

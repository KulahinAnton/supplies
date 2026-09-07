import { useState } from "react";
import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { DEFAULT_GROUP_ID } from "@supplies/core/shopping-groups";
import type { ListRow } from "../components/shopping/types";

/**
 * Feature 11 — dragging a row from one group to another.
 *
 * The sensor configuration is the part worth keeping in one place: touch needs
 * a hold-to-drag delay or every scroll of the list would start a drag; the
 * mouse gets a small distance threshold instead, so a click on the check
 * button is never swallowed; and the keyboard sensor is what makes the whole
 * feature reachable without a steady finger — Space picks a row up, arrows
 * move between groups, Space drops it.
 */
export function useRowDrag(rows: ListRow[], onMove: (rowId: string, groupId: string) => void) {
  const [dragging, setDragging] = useState<ListRow | null>(null);
  const [overGroup, setOverGroup] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  return {
    sensors,
    dragging,
    overGroup,
    onDragStart: (event: DragStartEvent) => {
      setDragging(rows.find((row) => row.id === event.active.id) ?? null);
    },
    onDragOver: (event: { over: { id: string | number } | null }) => {
      setOverGroup(event.over ? String(event.over.id) : null);
    },
    onDragCancel: () => {
      setDragging(null);
      setOverGroup(null);
    },
    onDragEnd: (event: DragEndEvent) => {
      setDragging(null);
      setOverGroup(null);

      const target = event.over?.id;
      if (!target) return;

      const rowId = String(event.active.id);
      const row = rows.find((r) => r.id === rowId);
      // Dropping a row back where it started is not a move, and sending one
      // would spend a request to change nothing.
      if (String(target) === (row?.groupId ?? DEFAULT_GROUP_ID)) return;

      onMove(rowId, String(target));
    },
  };
}

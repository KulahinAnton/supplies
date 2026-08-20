"use client";

import { createIdSetStore } from "@/hooks/use-id-set";

/**
 * Feature 14.2 — which shopping groups are currently showing their archived
 * rows. Per-person, per-device; archived rows are hidden by default.
 */
const store = createIdSetStore("supplies.shopping.showArchived");

export const useShownArchived = store.useIdSet;

"use client";

import { createIdSetStore } from "./id-set-store";

/**
 * Feature 14.2 — which shopping groups are currently showing their archived
 * rows. Per-person, per-device; archived rows are hidden by default.
 */
const store = createIdSetStore("supplies.shopping.showArchived");

export const useShownArchived = store.useIdSet;

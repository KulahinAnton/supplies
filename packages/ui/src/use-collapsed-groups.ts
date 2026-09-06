"use client";

import { createIdSetStore } from "./id-set-store";

/**
 * Feature 11 — which shopping groups this person has folded away.
 * Per-person, per-device; see hooks/use-id-set.ts for why.
 */
const store = createIdSetStore("supplies.shopping.collapsed");

export const useCollapsedGroups = store.useIdSet;

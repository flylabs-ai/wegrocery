"use client";

import { useLayoutEffect } from "react";

const pendingChanges = new Set<symbol>();

export function hasUnsavedChanges(): boolean {
  return pendingChanges.size > 0;
}

export function useUnsavedChanges(dirty: boolean): void {
  useLayoutEffect(() => {
    if (!dirty) return;
    const editor = Symbol();
    pendingChanges.add(editor);
    return () => { pendingChanges.delete(editor); };
  }, [dirty]);
}

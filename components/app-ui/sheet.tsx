"use client";

import { Sheet as KitSheet, type SheetProps as KitSheetProps } from "@/components/ui/sheet";
import { t } from "@/lib/i18n";
import { isConfirmOpen } from "./confirm";

export { SheetActions } from "@/components/ui/sheet";

export type SheetProps = Omit<KitSheetProps, "closeLabel" | "desktopFrom"> & { closeLabel?: string };

/**
 * The kit's Sheet (FlyLabs Kit ui 1.1) as WeGrocery uses it: from the bottom
 * on phones, centred from 640 px, the close label from the language pack,
 * and deaf to the Esc and taps of a confirm opened over it.
 */
export function Sheet({ closeLabel = t.common.close, onRequestClose, ...props }: SheetProps) {
  return (
    <KitSheet
      {...props}
      closeLabel={closeLabel}
      desktopFrom="sm"
      onRequestClose={() => {
        if (isConfirmOpen()) return;
        onRequestClose();
      }}
    />
  );
}

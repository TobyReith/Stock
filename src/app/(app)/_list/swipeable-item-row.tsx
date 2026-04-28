"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { CheckCircle2, MoreVertical, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { consumeItem, discardItem, unmarkItem } from "@/lib/actions/items";
import { addShoppingItem } from "@/lib/actions/shopping";
import { ItemRow } from "./item-row";
import type { ListItem } from "./items-list";
import type { StorageLocationDisplay } from "@/lib/schemas/storage-locations";

const THRESHOLD = 80;
const SPRING = { type: "spring" as const, stiffness: 400, damping: 30 };

export function SwipeableItemRow({
  item,
  daysLeft,
  storageLocations,
}: {
  item: ListItem;
  daysLeft: number;
  storageLocations: StorageLocationDisplay[];
}) {
  const x = useMotionValue(0);
  const wasDragged = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Icon opacity: green fades in when swiping right, red when swiping left
  const consumeOpacity = useTransform(x, [0, THRESHOLD], [0, 1]);
  const discardOpacity = useTransform(x, [-THRESHOLD, 0], [1, 0]);

  const displayName = item.customName ?? item.productName;

  function vibrate(pattern: number | number[]) {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }

  async function handleNachkaufen() {
    const result = await addShoppingItem({
      customName: displayName,
      quantity: item.quantity,
      unit: item.unit ?? undefined,
    });
    if (result.ok) {
      toast.success("Zur Einkaufsliste hinzugefügt");
    } else {
      toast.error(result.error);
    }
  }

  function showActionToast(label: string) {
    toast.success(label, {
      duration: 5000,
      action: {
        label: "Rückgängig",
        onClick: async () => {
          vibrate([30, 30, 30]);
          const result = await unmarkItem(item.id);
          if (!result.ok) toast.error(result.error);
        },
      },
      cancel: {
        label: "Nachkaufen",
        onClick: handleNachkaufen,
      },
    });
  }

  async function triggerConsume(): Promise<boolean> {
    vibrate(50);
    const result = await consumeItem(item.id);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    showActionToast(`${displayName} verbraucht`);
    return true;
  }

  async function triggerDiscard(): Promise<boolean> {
    vibrate(50);
    const result = await discardItem(item.id);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    showActionToast(`${displayName} entsorgt`);
    return true;
  }

  return (
    <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
      <div className="relative overflow-hidden">
        {/* Action indicator icons — sit behind the card */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-5">
          <motion.div
            style={{ opacity: consumeOpacity }}
            className="text-emerald-600 dark:text-emerald-500"
          >
            <CheckCircle2 className="size-6" aria-hidden />
          </motion.div>
          <motion.div style={{ opacity: discardOpacity }} className="text-destructive">
            <Trash2 className="size-6" aria-hidden />
          </motion.div>
        </div>

        {/* Coloured background tints */}
        <motion.div
          className="pointer-events-none absolute inset-0 bg-emerald-500/15"
          style={{ opacity: consumeOpacity }}
        />
        <motion.div
          className="pointer-events-none absolute inset-0 bg-destructive/15"
          style={{ opacity: discardOpacity }}
        />

        {/* Draggable card */}
        <motion.div
          style={{ x }}
          drag="x"
          dragConstraints={{ left: -250, right: 250 }}
          dragElastic={0.08}
          onDragStart={() => {
            wasDragged.current = false;
          }}
          onDrag={(_, info) => {
            if (Math.abs(info.offset.x) > 8) wasDragged.current = true;
          }}
          onDragEnd={(_, info) => {
            const ox = info.offset.x;
            if (ox > THRESHOLD) {
              animate(x, 300, { type: "tween", duration: 0.15 }).then(async () => {
                const ok = await triggerConsume();
                if (!ok) animate(x, 0, SPRING);
              });
            } else if (ox < -THRESHOLD) {
              animate(x, -300, { type: "tween", duration: 0.15 }).then(async () => {
                const ok = await triggerDiscard();
                if (!ok) animate(x, 0, SPRING);
              });
            } else {
              animate(x, 0, SPRING);
            }
          }}
        >
          <Link
            href={`/item/${item.id}`}
            className="block outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(e) => {
              if (wasDragged.current) {
                e.preventDefault();
                wasDragged.current = false;
              }
            }}
          >
            <ItemRow
              item={item}
              daysLeft={daysLeft}
              storageLocations={storageLocations}
              actions={<ActionMenuTrigger onOpen={() => setMenuOpen(true)} />}
            />
          </Link>
        </motion.div>
      </div>

      {/* Action sheet — controlled via menuOpen state, no SheetTrigger needed */}
      <SheetContent side="bottom" className="rounded-t-xl px-0 pb-8">
        <SheetHeader className="px-4 pb-0">
          <SheetTitle className="truncate text-left text-sm font-medium text-muted-foreground">
            {displayName}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-2 flex flex-col divide-y">
          <SheetClose
            render={
              <button
                type="button"
                onClick={() => void triggerConsume()}
                className="flex items-center gap-3 px-4 py-3.5 text-sm hover:bg-muted"
              >
                <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-500" aria-hidden />
                Verbraucht markieren
              </button>
            }
          />
          <SheetClose
            render={
              <button
                type="button"
                onClick={() => void triggerDiscard()}
                className="flex items-center gap-3 px-4 py-3.5 text-sm hover:bg-muted"
              >
                <Trash2 className="size-5 text-destructive" aria-hidden />
                Als entsorgt markieren
              </button>
            }
          />
          <SheetClose
            render={
              <button
                type="button"
                onClick={() => void handleNachkaufen()}
                className="flex items-center gap-3 px-4 py-3.5 text-sm hover:bg-muted"
              >
                <ShoppingCart className="size-5 text-primary" aria-hidden />
                Nachkaufen
              </button>
            }
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ActionMenuTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-label="Weitere Aktionen"
      onClick={(e) => {
        // Must stop propagation here directly — not via SheetTrigger's render
        // prop, which doesn't guarantee our handler runs before the Link's
        // default navigation fires.
        e.stopPropagation();
        e.preventDefault();
        onOpen();
      }}
      onPointerDown={(e) => {
        // Prevent framer-motion from starting a drag from this area.
        e.stopPropagation();
      }}
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <MoreVertical className="size-4" aria-hidden />
    </button>
  );
}

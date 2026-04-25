"use client";

import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { FeedbackSheet } from "@/components/feedback/feedback-sheet";

export function FeedbackButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3 w-full text-left transition-colors hover:bg-muted/50"
      >
        <div className="flex items-center gap-3">
          <MessageSquarePlus aria-hidden className="size-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Feedback oder Bug melden</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Ideen, Fehler oder Wünsche mitteilen.
            </p>
          </div>
        </div>
      </button>
      <FeedbackSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

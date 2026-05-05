"use client";

import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { FeedbackSheet } from "./feedback-sheet";
import { useTrack } from "@/lib/posthog/use-track";

export function FeedbackFab() {
  const [open, setOpen] = useState(false);
  const track = useTrack();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          track("feedback_opened", { type: "feedback" });
          setOpen(true);
        }}
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-4 z-40 flex size-11 items-center justify-center rounded-full bg-muted/80 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Feedback geben"
      >
        <MessageSquarePlus className="size-4" aria-hidden />
      </button>

      <FeedbackSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

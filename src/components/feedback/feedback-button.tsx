"use client";

import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { FeedbackSheet } from "./feedback-sheet";
import { useTrack } from "@/lib/posthog/use-track";

export function FeedbackButton() {
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
        aria-label="Feedback geben"
        className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
      >
        <MessageSquarePlus className="size-4" aria-hidden />
      </button>

      <FeedbackSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

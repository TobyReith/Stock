"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { submitFeedback, type FeedbackType } from "@/lib/posthog/feedback";
import { useTrack } from "@/lib/posthog/use-track";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function FeedbackSheet({ open, onClose }: Props) {
  const [type, setType] = useState<FeedbackType>("feedback");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const pathname = usePathname();
  const track = useTrack();

  function handleSubmit() {
    if (message.trim().length < 5) return;
    setLoading(true);
    try {
      submitFeedback({ type, message: message.trim(), currentScreen: pathname });
      track("feedback_submitted", { type });
      toast.success(type === "bug" ? "Bug gemeldet – danke!" : "Feedback gesendet – danke!");
      setMessage("");
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen: boolean) => {
        if (!isOpen) {
          track("feedback_dismissed", {});
          onClose();
        }
      }}
    >
      <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8 pt-0">
        <SheetHeader className="px-0 pb-4">
          <SheetTitle>Feedback geben</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4">
          {/* Type toggle */}
          <div className="flex rounded-lg bg-surface-raised p-1">
            {(["feedback", "bug"] as FeedbackType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  "flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors",
                  type === t
                    ? "bg-surface text-foreground"
                    : "text-muted hover:text-foreground",
                )}
              >
                {t === "feedback" ? "💡 Idee / Feedback" : "🐛 Bug melden"}
              </button>
            ))}
          </div>

          {/* Textarea */}
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              type === "bug"
                ? "Was ist passiert? Was hast du erwartet?"
                : "Was könnte besser sein? Was vermisst du?"
            }
            rows={5}
            maxLength={2000}
            className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted outline-none focus:border-border-strong"
          />

          {/* Counter + privacy note */}
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Wird anonym an das Entwicklerteam gesendet.</span>
            <span>{message.length}/2000</span>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Abbrechen
            </Button>
            <Button
              className="flex-1"
              disabled={message.trim().length < 5 || loading}
              onClick={handleSubmit}
            >
              {loading ? "Senden…" : "Senden"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

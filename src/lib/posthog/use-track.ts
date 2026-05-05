"use client";

import { useCallback } from "react";
import { posthog } from "./client";
import type { Recipe } from "@/lib/recipes/types";

export type AppEvent =
  | { name: "item_added";                    props: { method: "barcode" | "photo" | "manual"; hasExpiry: boolean } }
  | { name: "barcode_scan_success";          props: { source: "barcode_detector" | "zxing" } }
  | { name: "barcode_scan_failed";           props: Record<string, never> }
  | { name: "photo_identify_started";        props: Record<string, never> }
  | { name: "photo_identify_result";         props: { candidateCount: number; topSource: "vision" | "vision+off" | "off" } }
  | { name: "item_consumed";                 props: { trigger: "swipe" | "modal" | "recipe" } }
  | { name: "item_disposed";                 props: { trigger: "swipe" | "modal"; expired: boolean } }
  | { name: "item_undo";                     props: { action: "consumed" | "disposed" } }
  | { name: "recipe_suggestions_generated";  props: { count: number; fromCache: boolean; expiringItemCount: number } }
  | { name: "recipe_favorited";              props: Record<string, never> }
  | { name: "recipe_unfavorited";            props: Record<string, never> }
  | { name: "recipe_cooked";                 props: { fromFavorites: boolean; ingredientCount: number } }
  | { name: "recipe_missing_added_to_cart";  props: { ingredientCount: number } }
  | { name: "feedback_opened";               props: { type: "feedback" | "bug" } }
  | { name: "feedback_submitted";            props: { type: "feedback" | "bug" } }
  | { name: "feedback_dismissed";            props: Record<string, never> };

type EventMap = { [E in AppEvent as E["name"]]: E["props"] };

export function useTrack() {
  return useCallback(<N extends AppEvent["name"]>(event: N, props: EventMap[N]) => {
    posthog.capture(event, props as Record<string, unknown>);
  }, []);
}

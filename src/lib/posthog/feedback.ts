import { posthog } from "./client";

// Replace with the Survey ID after creating the survey in PostHog Dashboard
// Dashboard → Surveys → New Survey → Type: API → Name: in_app_feedback
const SURVEY_ID = process.env.NEXT_PUBLIC_POSTHOG_SURVEY_ID ?? "";

export type FeedbackType = "feedback" | "bug";

export function submitFeedback({
  type,
  message,
  currentScreen,
}: {
  type: FeedbackType;
  message: string;
  currentScreen: string;
}) {
  if (SURVEY_ID) {
    posthog.capture("survey sent", {
      $survey_id: SURVEY_ID,
      $survey_response: message,
      $survey_response_1: type === "bug" ? "Bug melden" : "Feedback",
      $survey_response_2: currentScreen,
    });
  }

  posthog.capture(type === "bug" ? "bug_reported" : "feedback_submitted", {
    message,
    screen: currentScreen,
  });
}

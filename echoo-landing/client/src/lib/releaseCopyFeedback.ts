export type ReleaseCopyFeedback = "success" | "error";

export const COPY_FEEDBACK = {
  success: {
    title: "Copied!",
    description: "The Echoo Studio v1.0.5 release link is ready to share.",
  },
  error: {
    title: "Copy unavailable",
    description: "Select the address in your browser to share this release.",
  },
} as const;

export function getReleaseCopyFeedback(status: ReleaseCopyFeedback) {
  return COPY_FEEDBACK[status];
}

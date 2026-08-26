import React from "react";
import { Spinner } from "@/components/ui/spinner";

type NewsletterSubmitButtonProps = {
  isSubmitting: boolean;
};

/** A labelled, disabled-safe submit control for the footer newsletter form. */
export function NewsletterSubmitButton({ isSubmitting }: NewsletterSubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={isSubmitting}
      aria-busy={isSubmitting}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#3B78FF] px-5 text-[.62rem] font-black tracking-[.12em] text-white transition duration-200 hover:bg-[#5B8EFF] disabled:cursor-not-allowed disabled:opacity-60 active:scale-[.97]"
    >
      {isSubmitting ? (
        <>
          <Spinner className="size-3.5" aria-label="Submitting newsletter subscription" />
          <span>SUBMITTING...</span>
        </>
      ) : (
        "NOTIFY ME"
      )}
    </button>
  );
}

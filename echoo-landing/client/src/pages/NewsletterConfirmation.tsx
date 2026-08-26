import React, { useEffect, useMemo } from "react";
import { CheckCircle2, Mail, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { getNewsletterConfirmationToken } from "@/lib/newsletterConfirmation";

export default function NewsletterConfirmation() {
  const token = useMemo(
    () => getNewsletterConfirmationToken(typeof window === "undefined" ? "" : window.location.search),
    [],
  );
  const confirmation = trpc.newsletter.confirm.useMutation();

  useEffect(() => {
    if (token) confirmation.mutate({ token });
  }, [token]);

  const isConfirmed = Boolean(token && confirmation.data?.confirmed);
  const isInvalid = !token || confirmation.isError || confirmation.data?.confirmed === false;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8FBFF] px-5 py-12 text-[#102E63]">
      <section className="w-full max-w-xl rounded-[2rem] border border-[#164F9D]/15 bg-white p-7 text-center shadow-[0_24px_70px_rgba(18,63,129,.14)] sm:p-10">
        {isConfirmed ? <CheckCircle2 className="mx-auto h-11 w-11 text-[#2E9C70]" aria-hidden="true" /> : isInvalid ? <XCircle className="mx-auto h-11 w-11 text-[#C84A5A]" aria-hidden="true" /> : <Mail className="mx-auto h-11 w-11 text-[#3B78FF]" aria-hidden="true" />}
        <p className="mt-6 text-[0.62rem] font-black tracking-[0.16em] text-[#3B78FF]">ECHOO RELEASE UPDATES</p>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.06em] text-[#102E63]">
          {isConfirmed ? "You’re confirmed." : isInvalid ? "This confirmation link is not valid." : "Confirming your subscription…"}
        </h1>
        <p className="mx-auto mt-5 max-w-md text-base leading-7 text-[#4A6695]">
          {isConfirmed ? "You can now receive Echoo release updates. You may unsubscribe from any newsletter email." : isInvalid ? "The link may have expired or already been used. Return to Echoo and request a new confirmation email." : "Please wait while we securely confirm your email address."}
        </p>
        <a href="/" className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-[#164F9D] px-5 text-[0.67rem] font-black tracking-[0.13em] text-white transition hover:bg-[#103E80] active:scale-[.97]">RETURN TO ECHOO</a>
      </section>
    </main>
  );
}

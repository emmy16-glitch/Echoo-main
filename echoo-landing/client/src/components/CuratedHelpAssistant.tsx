import React, { FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { CircleHelp, Mail, MessageCircleQuestion, Send, ShieldCheck, X } from "lucide-react";
import {
  CURATED_HELP_SUGGESTIONS,
  getCuratedHelpWelcome,
  HUMAN_SUPPORT_EMAIL_DRAFT,
  resolveCuratedHelpResponse,
  type CuratedHelpMode,
  type CuratedHelpResponse,
} from "@/lib/curatedHelp";

type CuratedHelpAssistantProps = {
  mode?: CuratedHelpMode;
};

const MODE_LABELS: Record<CuratedHelpMode, { title: string; trigger: string }> = {
  website: { title: "Echoo help", trigger: "Open Echoo product help" },
  listener: { title: "Listener support", trigger: "Open listener support" },
  creator: { title: "Creator copilot", trigger: "Open creator copilot" },
};

const RESPONSE_DELAY_MS = 260;

const getFocusableElements = (container: HTMLElement | null) => (
  container
    ? Array.from(container.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])'))
    : []
);

export function CuratedHelpAssistant({ mode = "website" }: CuratedHelpAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<CuratedHelpResponse[]>(() => [getCuratedHelpWelcome(mode)]);
  const [isSelectingGuidance, setIsSelectingGuidance] = useState(false);
  const [isEscalationOpen, setIsEscalationOpen] = useState(false);
  const [hasEscalationConsent, setHasEscalationConsent] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const responseTimerRef = useRef<number | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const escalationId = useId();
  const dialogId = useId();
  const labels = MODE_LABELS[mode];

  const clearResponseTimer = useCallback(() => {
    if (responseTimerRef.current !== null) {
      window.clearTimeout(responseTimerRef.current);
      responseTimerRef.current = null;
    }
  }, []);

  const closeAssistant = useCallback(() => {
    clearResponseTimer();
    setIsOpen(false);
    setInput("");
    setMessages([getCuratedHelpWelcome(mode)]);
    setIsSelectingGuidance(false);
    setIsEscalationOpen(false);
    setHasEscalationConsent(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, [clearResponseTimer, mode]);

  useEffect(() => () => clearResponseTimer(), [clearResponseTimer]);

  useEffect(() => {
    if (!isOpen) return;

    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAssistant();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = getFocusableElements(dialogRef.current);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeAssistant, isOpen]);

  const ask = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || isSelectingGuidance) return;

    setInput("");
    setIsSelectingGuidance(true);
    clearResponseTimer();
    responseTimerRef.current = window.setTimeout(() => {
      setMessages((current) => [...current, resolveCuratedHelpResponse(trimmed, mode)]);
      setIsSelectingGuidance(false);
      responseTimerRef.current = null;
    }, RESPONSE_DELAY_MS);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    ask(input);
  };

  const openHumanSupportDraft = () => {
    if (!hasEscalationConsent) return;
    window.location.href = HUMAN_SUPPORT_EMAIL_DRAFT;
    setIsEscalationOpen(false);
    setHasEscalationConsent(false);
  };

  return (
    <div className="curated-help-root">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={dialogId}
        aria-label={labels.trigger}
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 z-[60] inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-white/20 bg-[#164F9D] px-4 text-sm font-black text-white shadow-[0_14px_34px_rgba(5,25,65,.32)] outline-none transition duration-200 hover:-translate-y-0.5 hover:bg-[#103E80] focus-visible:ring-2 focus-visible:ring-[#91B3FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F8FBFF] active:scale-[.97] motion-reduce:transform-none sm:bottom-6 sm:right-6"
      >
        <MessageCircleQuestion className="h-5 w-5" aria-hidden="true" />
        <span className="hidden text-[.66rem] tracking-[.12em] sm:inline">HELP</span>
      </button>

      {isOpen && (
        <>
          <button
            type="button"
            aria-label="Close help"
            onClick={closeAssistant}
            className="fixed inset-0 z-[60] cursor-default bg-[#02102A]/45 backdrop-blur-[1px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
          />
          <section
            ref={dialogRef}
            id={dialogId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className="fixed bottom-5 right-5 z-[61] flex max-h-[min(640px,calc(100dvh-2.5rem))] w-[calc(100vw-2.5rem)] max-w-md flex-col overflow-hidden rounded-[1.55rem] border border-white/15 bg-[#071A3B] text-white shadow-[0_28px_80px_rgba(2,13,35,.46)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-200 sm:bottom-6 sm:right-6"
          >
            <header className="flex items-start justify-between gap-4 border-b border-white/10 bg-[#0B2A5B] px-5 py-4">
              <div>
                <p className="text-[.58rem] font-black tracking-[.16em] text-[#AFC8FF]">LOCAL, CURATED GUIDANCE</p>
                <h2 id={titleId} className="mt-1 text-xl font-black tracking-[-.04em]">{labels.title}</h2>
              </div>
              <button
                type="button"
                onClick={closeAssistant}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-[#D8E6FF] outline-none transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#91B3FF] active:scale-[.97] motion-reduce:transform-none"
                aria-label={`Close ${labels.title}`}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4" aria-live="polite" aria-busy={isSelectingGuidance}>
              {messages.map((message, index) => (
                <article key={`${message.topic}-${index}`} className="rounded-2xl border border-white/10 bg-white/[.06] px-4 py-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200">
                  <p className="text-[.58rem] font-black tracking-[.15em] text-[#AFC8FF]">{message.topic.toUpperCase()}</p>
                  <p className="mt-2 text-sm leading-6 text-[#EDF4FF]">{message.answer}</p>
                </article>
              ))}
              {isSelectingGuidance && (
                <div role="status" className="flex items-center gap-3 rounded-2xl border border-[#8CB7FF]/25 bg-[#0B2A5B] px-4 py-3 text-sm text-[#DCE8FF] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-150">
                  <span className="flex gap-1" aria-hidden="true">
                    <i className="h-1.5 w-1.5 rounded-full bg-[#9FC2FF] motion-safe:animate-bounce" />
                    <i className="h-1.5 w-1.5 rounded-full bg-[#9FC2FF] motion-safe:animate-bounce [animation-delay:90ms]" />
                    <i className="h-1.5 w-1.5 rounded-full bg-[#9FC2FF] motion-safe:animate-bounce [animation-delay:180ms]" />
                  </span>
                  Selecting the most relevant curated guidance…
                </div>
              )}
            </div>

            <div className="border-t border-white/10 bg-[#06152F] px-5 py-4">
              <p id={descriptionId} className="flex items-start gap-2 text-xs leading-5 text-[#B6C9EB]">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#83ADFF]" aria-hidden="true" />
                Guidance stays in this browser session. It is not sent to an AI service or stored by this assistant.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {CURATED_HELP_SUGGESTIONS[mode].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    disabled={isSelectingGuidance}
                    onClick={() => ask(suggestion)}
                    className="min-h-11 rounded-full border border-white/15 px-3 text-left text-[.61rem] font-bold leading-4 text-[#DCE8FF] outline-none transition hover:border-[#91B3FF] hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#91B3FF] disabled:cursor-not-allowed disabled:opacity-50 active:scale-[.97] motion-reduce:transform-none"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              <button
                type="button"
                aria-expanded={isEscalationOpen}
                aria-controls={escalationId}
                onClick={() => setIsEscalationOpen((current) => !current)}
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#7FAAFF]/50 px-3 text-left text-[.67rem] font-black tracking-[.04em] text-[#DCE8FF] outline-none transition hover:border-[#BFD3FF] hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#91B3FF] active:scale-[.97] motion-reduce:transform-none"
              >
                <CircleHelp className="h-4 w-4" aria-hidden="true" />
                Need human support?
              </button>
              {isEscalationOpen && (
                <section id={escalationId} className="mt-3 rounded-2xl border border-[#8CB7FF]/30 bg-[#0B2A5B] px-4 py-3 text-sm text-[#EAF2FF] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-150" aria-label="Human support consent">
                  <p className="leading-5">Echoo will not send your question. With your consent, this prepares an empty email draft in your mail app; you choose a verified Echoo support recipient, what to write, and whether to send it.</p>
                  <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-[#D2E1FF]">
                    <input type="checkbox" checked={hasEscalationConsent} onChange={(event) => setHasEscalationConsent(event.target.checked)} className="mt-1 h-4 w-4 accent-[#5B8EFF]" />
                    I understand that anything I add and send is handled by my email provider, not this assistant. I will not include passwords, codes, or private room details.
                  </label>
                  <button type="button" disabled={!hasEscalationConsent} onClick={openHumanSupportDraft} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#3B78FF] px-4 text-xs font-black text-white outline-none transition hover:bg-[#5B8EFF] focus-visible:ring-2 focus-visible:ring-[#BFD3FF] disabled:cursor-not-allowed disabled:opacity-50 active:scale-[.97] motion-reduce:transform-none">
                    <Mail className="h-4 w-4" aria-hidden="true" />
                    Prepare email draft
                  </button>
                </section>
              )}

              <form className="mt-3 flex gap-2" onSubmit={submit}>
                <label className="sr-only" htmlFor={`${titleId}-question`}>Ask a product-help question</label>
                <input
                  ref={inputRef}
                  id={`${titleId}-question`}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  maxLength={280}
                  placeholder="Ask about Echoo…"
                  className="min-h-11 min-w-0 flex-1 rounded-full border border-white/15 bg-white px-4 text-sm text-[#0A1C3F] outline-none placeholder:text-[#637BAA] focus:border-[#91B3FF] focus:ring-2 focus:ring-[#91B3FF]"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isSelectingGuidance}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[#3B78FF] text-white outline-none transition hover:bg-[#5B8EFF] focus-visible:ring-2 focus-visible:ring-[#BFD3FF] disabled:cursor-not-allowed disabled:opacity-45 active:scale-[.97] motion-reduce:transform-none"
                  aria-label="Ask Echoo help"
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                </button>
              </form>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

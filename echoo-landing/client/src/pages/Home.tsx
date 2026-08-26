/**
 * Echoo homepage: original premium audio direction informed by the supplied
 * visual references, while preserving Echoo's own brand, logo, and routes.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { trackEarlyAccess } from "@/lib/earlyAccessAnalytics";
import {
  NEWSLETTER_EMAIL_MESSAGE,
  NEWSLETTER_SUCCESS_MESSAGE,
  validateNewsletterEmail,
  validateNewsletterConsent,
} from "@/lib/newsletterSubscription";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BackToTop } from "@/components/BackToTop";
import { FooterSocialShare } from "@/components/FooterSocialShare";
import { MobilePublicMenu } from "@/components/MobilePublicMenu";
import { PublicNavShell } from "@/components/PublicNavShell";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Laptop,
  Mail,
  Radio,
  ShieldCheck,
  Sparkles,
  Users,
  Volume2,
  Waves,
} from "lucide-react";

const LOGO_URL = "/manus-storage/echoo-logo-blue-white_1f4c2e9c.jpeg";
const LIVE_APP_URL = "https://echoo.digi02.org";
const LISTEN_DASHBOARD_URL = "/manus-storage/echoo-listen-dashboard_c5338ee4.png";
const SIGN_IN_URL = "/manus-storage/echoo-sign-in_99d23819.png";
const CREATOR_STUDIO_URL = "/manus-storage/echoo-creator-studio_fdacc987.png";

const HOME_NAVIGATION_LINKS = [
  { href: "#experience", label: "EXPERIENCE" },
  { href: "#studio", label: "STUDIO" },
  { href: "#release", label: "RELEASE" },
  { href: "/release", label: "DOWNLOADS" },
] as const;

const EXPERIENCE_CARDS = [
  {
    icon: Radio,
    eyebrow: "LIVE, WITHOUT LATENCY",
    title: "A room that feels present.",
    body: "Go live with a purposeful creator path, then invite listeners into an audio space built for the moment.",
    span: "lg:col-span-7",
    tone: "signal-card-live",
  },
  {
    icon: Volume2,
    eyebrow: "LISTENER CONTROL",
    title: "Sound, on their terms.",
    body: "Clear playback, mute, and pause controls help each person settle into the session in their own way.",
    span: "lg:col-span-5",
    tone: "signal-card-control",
  },
  {
    icon: Laptop,
    eyebrow: "ECHOO STUDIO",
    title: "Keep the studio close.",
    body: "Bring a focused Echoo window to your desktop when your room deserves its own creative space.",
    span: "lg:col-span-5",
    tone: "signal-card-studio",
  },
  {
    icon: Users,
    eyebrow: "CREATIVE COMMUNITIES",
    title: "A signal worth gathering around.",
    body: "From listening rooms to broadcasts, Echoo puts closeness ahead of noise and gives communities a clearer way to connect.",
    span: "lg:col-span-7",
    tone: "signal-card-community",
  },
];

const RELEASE_FACTS = [
  ["01", "Your room stays available", "Desktop background controls keep an active live room within reach."],
  ["02", "Alerts stay private", "Native alerts are opt-in and never include room names or message content."],
  ["03", "Your platform, your choice", "Download options are available for Windows, macOS, and Ubuntu/Linux."],
];

function BrandMark({ className = "" }: { className?: string }) {
  return <img src={LOGO_URL} alt="Echoo logo" className={className} />;
}

function LiveIndicator() {
  return (
    <span className="live-indicator">
      <span className="live-indicator-dot" />
      LIVE AUDIO PLATFORM
    </span>
  );
}

export default function Home() {
  const [email, setEmail] = useState("");
  const [hasConsent, setHasConsent] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [earlyAccessComplete, setEarlyAccessComplete] = useState(false);
  const [formStarted, setFormStarted] = useState(false);
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterConsent, setNewsletterConsent] = useState(false);
  const [newsletterMessage, setNewsletterMessage] = useState("");
  const earlyAccess = trpc.earlyAccess.subscribe.useMutation();
  const newsletter = trpc.newsletter.subscribe.useMutation();

  useEffect(() => {
    trackEarlyAccess("early_access_form_viewed");
  }, []);

  useEffect(() => {
    const input = document.getElementById("early-access-email");
    if (!input || formStarted) return;
    const onStart = () => {
      trackEarlyAccess("early_access_form_started");
      setFormStarted(true);
    };
    input.addEventListener("focus", onStart, { once: true });
    return () => input.removeEventListener("focus", onStart);
  }, [formStarted]);

  useEffect(() => {
    const consent = document.querySelector<HTMLInputElement>("#early-access input[type=checkbox]");
    if (!consent) return;
    const onConsent = () => {
      if (consent.checked) trackEarlyAccess("early_access_consent_enabled");
    };
    consent.addEventListener("change", onConsent);
    return () => consent.removeEventListener("change", onConsent);
  }, []);

  const submitEarlyAccess = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasConsent) {
      trackEarlyAccess("early_access_validation_failed");
      setFormMessage("Please confirm that Echoo can email you about early access.");
      return;
    }
    setFormMessage("");
    earlyAccess.mutate(
      { email },
      {
        onSuccess: () => {
          setEmail("");
          setHasConsent(false);
          setEarlyAccessComplete(true);
          trackEarlyAccess("early_access_subscription_succeeded");
        },
        onError: error => {
          trackEarlyAccess("early_access_subscription_failed");
          setFormMessage(error.message || "We could not save your sign-up. Please try again.");
        },
      },
    );
  };

  const submitNewsletter = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const emailMessage = validateNewsletterEmail(newsletterEmail);
    if (emailMessage) {
      setNewsletterMessage(emailMessage);
      return;
    }
    const consentMessage = validateNewsletterConsent(newsletterConsent);
    if (consentMessage) {
      setNewsletterMessage(consentMessage);
      return;
    }

    setNewsletterMessage("");
    newsletter.mutate(
      { email: newsletterEmail },
      {
        onSuccess: () => {
          setNewsletterEmail("");
          setNewsletterConsent(false);
          setNewsletterMessage(NEWSLETTER_SUCCESS_MESSAGE);
        },
        onError: error => {
          setNewsletterMessage(error.message || "We could not save your subscription. Please try again.");
        },
      },
    );
  };

  return (
    <div className="home-page min-h-screen overflow-x-hidden bg-[#F8FBFF] text-[#102E63] selection:bg-[#BBD1FF] selection:text-[#06122B]">
      <PublicNavShell>
        <div className="mx-auto flex h-[76px] max-w-[1340px] items-center justify-between px-5 sm:px-8 lg:px-10">
          <a href="#top" className="flex items-center gap-3" aria-label="Echoo home">
            <span className="flex h-10 w-10 overflow-hidden rounded-[14px] bg-white shadow-[0_8px_24px_rgba(124,162,255,.2)]">
              <BrandMark className="h-full w-full object-cover" />
            </span>
            <span className="text-[0.7rem] font-black tracking-[0.24em] text-[#123F81]">ECHOO</span>
          </a>
          <nav className="hidden items-center gap-7 text-[0.64rem] font-bold tracking-[0.14em] text-[#56729F] md:flex" aria-label="Main navigation">
            {HOME_NAVIGATION_LINKS.map(link => <a key={link.href} href={link.href} className="transition-colors hover:text-[#123F81]">{link.label}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="md:hidden"><MobilePublicMenu navigationLabel="Main navigation" links={HOME_NAVIGATION_LINKS} action={{ href: "/release#downloads", label: "GET ECHOO" }} /></div>
            <a href="/release#downloads" className="hidden min-h-11 items-center gap-2 rounded-full bg-[#3B78FF] px-4 py-2 text-[0.64rem] font-black tracking-[0.12em] text-white shadow-[0_8px_25px_rgba(54,116,255,.34)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#5B8EFF] active:scale-[.97] md:inline-flex">
              GET ECHOO <ArrowDownRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </PublicNavShell>

      <main id="top">
        <section className="hero-signal-grid relative isolate overflow-hidden px-5 pb-16 pt-32 sm:px-8 sm:pt-36 lg:min-h-[770px] lg:px-10 lg:pb-20">
          <div className="hero-aurora hero-aurora-left" />
          <div className="hero-aurora hero-aurora-right" />
          <div className="hero-scanlines" aria-hidden="true" />
          <p className="editorial-rail hidden lg:block">LIVE AUDIO, WITHOUT THE DISTANCE</p>
          <div className="relative mx-auto grid max-w-[1340px] items-center gap-16 lg:grid-cols-[1.05fr_.95fr] lg:gap-12">
            <div className="relative z-10 max-w-3xl">
              <LiveIndicator />
              <h1 className="mt-7 max-w-4xl text-[clamp(3.6rem,7.3vw,7.5rem)] font-black leading-[.86] tracking-[-.075em] text-[#102E63]">
                Your voice, <span className="text-gradient-signal">in its element.</span>
              </h1>
              <p className="mt-8 max-w-xl font-serif text-xl leading-8 text-[#415F90] sm:text-2xl">
                Echoo gives creators and listeners a more focused live-audio space—built for rooms that deserve to feel close, clear, and alive.
              </p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <a href={LIVE_APP_URL} className="inline-flex min-h-13 items-center justify-center gap-3 rounded-full bg-[#3B78FF] px-6 py-4 text-[0.69rem] font-black tracking-[0.14em] text-white shadow-[0_14px_30px_rgba(59,120,255,.34)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#5B8EFF] active:scale-[.97]">
                  <Radio className="h-4 w-4" /> OPEN ECHOO <ArrowUpRight className="h-4 w-4" />
                </a>
                <a href="#experience" className="inline-flex min-h-13 items-center justify-center gap-3 rounded-full border border-[#164F9D]/20 bg-white px-6 py-4 text-[0.69rem] font-black tracking-[0.14em] text-[#164F9D] transition duration-200 hover:-translate-y-0.5 hover:border-[#164F9D]/50 hover:bg-[#EEF5FF] active:scale-[.97]">
                  DISCOVER THE EXPERIENCE <ArrowDownRight className="h-4 w-4" />
                </a>
              </div>
              <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3 text-[0.63rem] font-bold tracking-[0.1em] text-[#5B78A7]">
                <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#83B0FF]" /> LIVE CREATOR WORKSPACES</span>
                <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#83B0FF]" /> LISTENER-LED PLAYBACK</span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[560px] lg:justify-self-end">
              <div className="signal-orbit signal-orbit-one" />
              <div className="signal-orbit signal-orbit-two" />
              <div className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-[#0A1834]/85 p-3 shadow-[0_30px_90px_rgba(0,0,0,.42)] backdrop-blur-xl sm:p-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 overflow-hidden rounded-xl bg-white"><BrandMark className="h-full w-full object-cover" /></span>
                    <div>
                      <p className="text-[0.6rem] font-black tracking-[.17em] text-white">ECHOO STUDIO</p>
                      <p className="mt-1 text-[0.58rem] font-bold tracking-[.09em] text-[#8EA2C8]">CREATOR ROOM / LIVE PREVIEW</p>
                    </div>
                  </div>
                  <span className="flex items-center gap-2 rounded-full border border-[#86AFFF]/25 bg-[#3B78FF]/15 px-3 py-1.5 text-[0.56rem] font-black tracking-[.13em] text-[#C9D9FF]"><span className="h-1.5 w-1.5 rounded-full bg-[#75E0B2]" />ON AIR</span>
                </div>
                <figure className="mt-4 overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#061126]">
                  <img src={LISTEN_DASHBOARD_URL} alt="Echoo listener home screen with live audio, playback controls, and the Layers of Truth broadcast" className="aspect-video w-full object-cover object-top" />
                  <figcaption className="flex items-center justify-between gap-4 px-4 py-3 text-[0.57rem] font-black tracking-[.14em] text-[#BFD0F4]"><span>LISTENER HOME</span><span className="flex items-center gap-2 text-[#83ADFF]"><span className="h-1.5 w-1.5 rounded-full bg-[#75E0B2]" />LIVE NOW</span></figcaption>
                </figure>
              </div>
              <div className="absolute -bottom-8 -left-5 z-20 hidden max-w-[205px] rounded-2xl border border-white/15 bg-[#0B1B3A]/90 p-4 shadow-xl backdrop-blur-xl sm:block"><p className="flex items-center gap-2 text-[0.57rem] font-black tracking-[.12em] text-[#BFD0F4]"><Waves className="h-3.5 w-3.5 text-[#77A3FF]" /> LISTEN WITH CONTROL</p><p className="mt-2 text-sm font-bold leading-5 text-white">A steady way into the sound.</p></div>
            </div>
          </div>
        </section>

        <section id="experience" className="bg-[#F6F8FD] px-5 py-20 text-[#091837] sm:px-8 lg:px-10 lg:py-28">
          <div className="mx-auto max-w-[1340px]">
            <div className="grid gap-8 border-b border-[#0C2E73]/12 pb-12 lg:grid-cols-[.9fr_1.1fr] lg:items-end">
              <div><p className="section-kicker">THE ECHOO EXPERIENCE / 01</p><h2 className="mt-5 max-w-xl text-[clamp(3rem,5vw,5.4rem)] font-black leading-[.88] tracking-[-.07em]">Designed for the moment sound becomes shared.</h2></div>
              <p className="max-w-2xl text-lg leading-8 text-[#314D7C]">Take the calm, detailed confidence of a listening room and give it a working path for the people bringing it to life.</p>
            </div>
            <div className="mt-7 grid gap-5 lg:grid-cols-12">
              {EXPERIENCE_CARDS.map(({ icon: Icon, eyebrow, title, body, span, tone }) => (
                <article key={title} className={`signal-card ${tone} ${span}`}>
                  <div className="relative z-10 flex h-full flex-col">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-current/15 bg-white/10"><Icon className="h-5 w-5" /></span>
                    <div className="mt-auto pt-20"><p className="text-[0.58rem] font-black tracking-[.16em] opacity-70">{eyebrow}</p><h3 className="mt-4 max-w-md text-3xl font-black leading-[.92] tracking-[-.055em] sm:text-4xl">{title}</h3><p className="mt-4 max-w-md text-sm leading-6 opacity-75">{body}</p><span className="mt-6 inline-flex items-center gap-2 text-[0.62rem] font-black tracking-[.13em]">EXPLORE <ArrowUpRight className="h-3.5 w-3.5" /></span></div>
                  </div>
                </article>
              ))}
            </div>
            <figure className="product-screen-frame mt-10 overflow-hidden rounded-[1.75rem] border border-[#164F9D]/12 bg-white shadow-[0_24px_60px_rgba(18,63,129,.12)] lg:ml-auto lg:max-w-[700px]">
              <img src={SIGN_IN_URL} alt="Echoo sign-in screen with the Echoo microphone artwork and account form" className="aspect-video w-full object-cover object-top" loading="lazy" />
              <figcaption className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6"><span className="text-[0.61rem] font-black tracking-[.15em] text-[#164F9D]">WELCOME BACK TO ECHOO</span><span className="text-sm text-[#5872A0]">A calmer path from sign-in to the next room.</span></figcaption>
            </figure>
          </div>
        </section>

        <section id="studio" className="relative overflow-hidden bg-white px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
          <div className="studio-glow" />
          <div className="relative mx-auto grid max-w-[1340px] gap-12 lg:grid-cols-[.88fr_1.12fr] lg:items-center">
            <div><p className="section-kicker">A BETTER DESKTOP PRESENCE / 02</p><h2 className="mt-5 max-w-xl text-[clamp(3rem,5vw,5.5rem)] font-black leading-[.88] tracking-[-.07em] text-[#102E63]">The room doesn’t end at the browser.</h2><p className="mt-7 max-w-xl font-serif text-xl leading-8 text-[#415F90]">Echoo Studio keeps your live workspace near your creative tools, while careful native controls make it easy to return to the room.</p><a href="/release#downloads" className="mt-10 inline-flex min-h-12 items-center gap-3 rounded-full bg-[#164F9D] px-5 py-3.5 text-[0.67rem] font-black tracking-[.13em] text-white transition duration-200 hover:-translate-y-0.5 hover:bg-[#103E80] active:scale-[.97]">GET THE DESKTOP BUILD <ArrowDownRight className="h-4 w-4" /></a></div>
            <figure className="relative mx-auto w-full max-w-[670px] overflow-hidden rounded-[2rem] border border-[#164F9D]/15 bg-white p-3 shadow-[0_30px_90px_rgba(18,63,129,.2)] sm:p-4">
              <img src={CREATOR_STUDIO_URL} alt="Echoo Creator Studio showing a Layers of Truth station dashboard and broadcast controls" className="aspect-video w-full rounded-[1.35rem] object-cover object-top" loading="lazy" />
              <figcaption className="flex items-center justify-between gap-4 px-2 pt-4 sm:px-3"><span className="text-[0.58rem] font-black tracking-[.14em] text-[#164F9D]">CREATOR STUDIO</span><span className="text-xs text-[#55709E]">Station setup, audience context, and broadcast tools.</span></figcaption>
            </figure>
          </div>
        </section>

        <section id="release" className="bg-[#EAF0FC] px-5 py-20 text-[#091837] sm:px-8 lg:px-10 lg:py-28">
          <div className="mx-auto grid max-w-[1340px] gap-12 lg:grid-cols-[.86fr_1.14fr] lg:items-start">
            <div><p className="section-kicker">NOW SHIPPING / v1.0.5</p><h2 className="mt-5 max-w-xl text-[clamp(3rem,5vw,5.4rem)] font-black leading-[.88] tracking-[-.07em]">The signal gets better with every release.</h2><p className="mt-7 max-w-lg text-lg leading-8 text-[#314D7C]">Browse verified platform builds, choose the installer that suits your system, and keep Echoo close to the room.</p><div className="mt-9 flex flex-wrap gap-3"><a href="/release" className="inline-flex min-h-12 items-center gap-3 rounded-full bg-[#164F9D] px-5 py-3.5 text-[.67rem] font-black tracking-[.13em] text-white transition duration-200 hover:-translate-y-0.5 hover:bg-[#103E80] active:scale-[.97]">READ RELEASE NOTES <ArrowUpRight className="h-4 w-4" /></a><a href="/release#downloads" className="inline-flex min-h-12 items-center gap-3 rounded-full border border-[#164F9D]/20 bg-white px-5 py-3.5 text-[.67rem] font-black tracking-[.13em] text-[#164F9D] transition duration-200 hover:-translate-y-0.5 hover:border-[#164F9D] active:scale-[.97]">SEE DOWNLOADS <ArrowDownRight className="h-4 w-4" /></a></div></div>
            <div className="overflow-hidden rounded-[1.65rem] border border-[#164F9D]/12 bg-white shadow-[0_24px_60px_rgba(18,63,129,.12)]">{RELEASE_FACTS.map(([number, title, body], index) => <article key={number} className={`grid gap-4 px-6 py-6 sm:grid-cols-[58px_1fr_auto] sm:items-center sm:px-8 ${index < RELEASE_FACTS.length - 1 ? "border-b border-[#164F9D]/12" : ""}`}><span className="font-serif text-3xl italic text-[#3B78FF]">{number}</span><div><h3 className="text-xl font-black tracking-[-.035em] text-[#102E63]">{title}</h3><p className="mt-2 max-w-lg text-sm leading-6 text-[#4A6695]">{body}</p></div><ShieldCheck className="hidden h-5 w-5 text-[#3B78FF] sm:block" /></article>)}</div>
          </div>
        </section>

        <section id="early-access" className="relative overflow-hidden bg-[#030916] px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
          <div className="early-access-glow" />
          <div className="relative mx-auto grid max-w-[1340px] gap-12 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <div><LiveIndicator /><h2 className="mt-6 max-w-xl text-[clamp(3.1rem,5vw,5.5rem)] font-black leading-[.88] tracking-[-.07em] text-white">Get closer to the next room.</h2><p className="mt-7 max-w-xl text-lg leading-8 text-[#B5C4E4]">Join the early-access list for Echoo updates and invitations as new rooms and releases become available.</p><div className="mt-9 flex items-center gap-3 text-sm text-[#90A5CD]"><Sparkles className="h-4 w-4 text-[#83ADFF]" /> No third-party sharing. Unsubscribe anytime.</div></div>
            <div className="rounded-[1.75rem] border border-white/15 bg-white/[.055] p-5 shadow-[0_25px_80px_rgba(0,0,0,.25)] backdrop-blur-xl sm:p-8"><form onSubmit={submitEarlyAccess}><label htmlFor="early-access-email" className="text-[.62rem] font-black tracking-[.16em] text-[#B8C9EB]">YOUR EMAIL ADDRESS</label><div className="mt-3 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6882B4]" /><input id="early-access-email" name="email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" className="w-full rounded-full border border-white/10 bg-white px-4 py-3.5 pl-11 text-sm font-medium text-[#0A1C3F] outline-none transition focus:border-[#91B3FF] focus:ring-2 focus:ring-[#91B3FF]" /></div><button type="submit" disabled={earlyAccess.isPending} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#3B78FF] px-5 py-3.5 text-[.65rem] font-black tracking-[.12em] text-white transition duration-200 hover:-translate-y-0.5 hover:bg-[#5B8EFF] disabled:cursor-not-allowed disabled:opacity-60 active:scale-[.97]">{earlyAccess.isPending ? "JOINING..." : "JOIN EARLY ACCESS"}<ArrowDownRight className="h-4 w-4" /></button></div><label className="mt-5 flex cursor-pointer items-start gap-3 text-sm leading-6 text-[#B9C7E0]"><input type="checkbox" checked={hasConsent} onChange={event => setHasConsent(event.target.checked)} className="mt-1 h-4 w-4 rounded border-white/40 bg-transparent accent-[#83ADFF]" /><span>I agree that Echoo may email me about early access and product updates. No spam, and no third-party sharing.</span></label>{formMessage && <p role="status" className="mt-5 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm leading-6 text-white">{formMessage}</p>}<p className="mt-5 text-[.58rem] font-bold tracking-[.1em] text-[#7890B9]">YOU CAN UNSUBSCRIBE FROM ANY EMAIL.</p></form></div>
          </div>
        </section>
      </main>

      {earlyAccessComplete && <div role="dialog" aria-modal="true" aria-labelledby="early-access-confirmation" className="fixed inset-0 z-50 flex items-center justify-center bg-[#020917]/75 p-5 backdrop-blur-sm" onClick={() => setEarlyAccessComplete(false)}><div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#0A1B3C] p-7 text-white shadow-2xl sm:p-9" onClick={event => event.stopPropagation()}><CheckCircle2 className="h-10 w-10 text-[#82ACFF]" /><p className="mt-6 text-[.62rem] font-black tracking-[.16em] text-[#AEC4F6]">EARLY ACCESS CONFIRMED</p><h2 id="early-access-confirmation" className="mt-3 text-4xl font-black tracking-[-.06em]">You are closer to the room.</h2><p className="mt-5 leading-7 text-[#B5C4E4]">Thank you for joining Echoo early access. We will send product updates and invitations as new rooms open.</p><button type="button" onClick={() => setEarlyAccessComplete(false)} className="mt-8 inline-flex min-h-12 items-center rounded-full bg-white px-5 text-[.66rem] font-black tracking-[.13em] text-[#0A1B3C] active:scale-[.97]">CONTINUE</button></div></div>}

      <footer className="border-t border-white/10 bg-[#030916] px-5 py-12 text-[#94A6C8] sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-[1340px] gap-10 lg:grid-cols-[.7fr_.7fr_1.2fr] lg:items-start">
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 overflow-hidden rounded-xl bg-white"><BrandMark className="h-full w-full object-cover" /></span><span className="text-[.66rem] font-black tracking-[.2em] text-white">ECHOO</span></div>
          <div><p className="max-w-md text-sm leading-6">Live audio for creative communities—made to feel close, clear, and ready for the next room.</p><a href="/release" className="mt-4 inline-block text-[.62rem] font-black tracking-[.14em] text-[#C5D4F0] transition hover:text-white">VIEW RELEASE NOTES <ArrowUpRight className="ml-1 inline h-3.5 w-3.5" /></a></div>
          <div className="space-y-4">
            <form onSubmit={submitNewsletter} className="footer-newsletter rounded-2xl border border-white/12 bg-white/[.045] p-4 sm:p-5" aria-describedby="newsletter-privacy newsletter-message">
              <div className="flex items-start justify-between gap-4"><div><p className="text-[.62rem] font-black tracking-[.16em] text-[#C7D8F8]">FUTURE RELEASES</p><label htmlFor="footer-newsletter-email" className="mt-2 block text-sm leading-6 text-[#A8BCE3]">Get an email when Echoo ships something new.</label></div><Mail className="mt-1 h-4 w-4 shrink-0 text-[#83ADFF]" aria-hidden="true" /></div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row"><input id="footer-newsletter-email" name="newsletter-email" type="email" autoComplete="email" required aria-invalid={newsletterMessage === NEWSLETTER_EMAIL_MESSAGE ? true : undefined} value={newsletterEmail} onChange={event => { setNewsletterEmail(event.target.value); if (newsletterMessage === NEWSLETTER_EMAIL_MESSAGE) setNewsletterMessage(""); }} placeholder="you@example.com" className="min-h-11 flex-1 rounded-full border border-white/15 bg-[#071735] px-4 text-sm text-white outline-none placeholder:text-[#7890B9] focus:border-[#91B3FF] focus:ring-2 focus:ring-[#91B3FF]" /><button type="submit" disabled={newsletter.isPending} className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#3B78FF] px-5 text-[.62rem] font-black tracking-[.12em] text-white transition duration-200 hover:bg-[#5B8EFF] disabled:cursor-not-allowed disabled:opacity-60 active:scale-[.97]">{newsletter.isPending ? "JOINING..." : "NOTIFY ME"}</button></div>
              <label className="mt-4 flex cursor-pointer items-start gap-3 text-xs leading-5 text-[#A8BCE3]"><input type="checkbox" checked={newsletterConsent} onChange={event => setNewsletterConsent(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-white/40 bg-transparent accent-[#83ADFF]" /><span>I agree that Echoo may email me about future releases. No third-party sharing.</span></label>
              <p id="newsletter-privacy" className="mt-3 text-[.56rem] font-bold tracking-[.1em] text-[#7890B9]">UNSUBSCRIBE ANYTIME.</p>
              {newsletterMessage && <p id="newsletter-message" role={newsletterMessage === NEWSLETTER_SUCCESS_MESSAGE ? "status" : "alert"} className="mt-3 text-sm leading-6 text-[#E4EEFF]">{newsletterMessage}</p>}
            </form>
            <FooterSocialShare />
          </div>
        </div>
      </footer>
      <BackToTop />
    </div>
  );
}

/** Echoo Studio v1.0.5 release bulletin and privacy-safe download selector. */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CircleDot,
  Copy,
  Laptop,
  LoaderCircle,
  MonitorDown,
  Radio,
  ShieldCheck,
  TerminalSquare,
  Volume2,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MobilePublicMenu } from "@/components/MobilePublicMenu";
import { PublicNavShell } from "@/components/PublicNavShell";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { detectPlatform, type DetectedPlatform } from "@/lib/downloadSelector";
import {
  idleDownloadInteraction,
  isDownloadStarting,
  startDownloadInteraction,
} from "@/lib/downloadInteraction";
import { trackReleaseDownload } from "@/lib/releaseDownloadAnalytics";
import {
  DEFAULT_CHANGELOG_ITEM,
  resolveChangelogSelection,
} from "@/lib/releaseChangelogState";
import { buildReleaseShareLink } from "@/lib/releaseShareLink";
import { getReleaseCopyFeedback } from "@/lib/releaseCopyFeedback";

const LOGO_URL = "/manus-storage/echoo-logo-blue-white_1f4c2e9c.jpeg";
const RELEASE_NAVIGATION_LINKS = [
  { href: "#release", label: "RELEASE NOTES" },
  { href: "#changelog", label: "CHANGELOG" },
  { href: "#downloads", label: "DOWNLOADS" },
  { href: "#install", label: "INSTALLATION" },
] as const;

const DOWNLOADS = [
  {
    id: "windows",
    platform: "Windows",
    format: "Setup .exe",
    version: "v1.0.5 · unsigned",
    description: "Verified x64 NSIS installer. Windows SmartScreen may show a warning.",
    href: "/manus-storage/Echoo.Studio.Setup.1.0.5_ee7f4f09.exe",
    icon: MonitorDown,
  },
  {
    id: "macos",
    platform: "macOS",
    format: "Apple silicon .dmg",
    version: "v1.0.5 · unsigned",
    description: "Verified Apple-silicon DMG. Gatekeeper may show a warning because it is not notarized.",
    href: "/manus-storage/Echoo.Studio-1.0.5-arm64_684398f1.dmg",
    icon: Laptop,
  },
  {
    id: "linux-deb",
    platform: "Ubuntu / Debian",
    format: ".deb package",
    version: "v1.0.5 · unsigned",
    description: "Recommended Ubuntu installer with launcher integration. Install it with a package manager.",
    href: "/manus-storage/Echoo-Studio-1.0.5-amd64_a794c5a0.deb",
    icon: Laptop,
  },
  {
    id: "linux-appimage",
    platform: "Linux",
    format: "AppImage",
    version: "v1.0.5 · unsigned",
    description: "Freshly validated portable fallback for compatible Linux desktops.",
    href: "/manus-storage/Echoo-Studio-1.0.5-x86_64_1dc1f626.AppImage",
    icon: TerminalSquare,
  },
  {
    id: "linux-archive",
    platform: "Linux",
    format: "Compressed archive",
    version: "v1.0.5 · unsigned",
    description: "Freshly validated tar.gz alternative for manual Linux installation.",
    href: "/manus-storage/Echoo-Studio-1.0.5-x64.tar_3c07ff57.gz",
    icon: TerminalSquare,
  },
] as const;

type DownloadId = (typeof DOWNLOADS)[number]["id"];

const PLATFORM_COPY: Record<
  DetectedPlatform,
  { label: string; recommendedId?: DownloadId; unavailable?: string }
> = {
  windows: { label: "Windows", recommendedId: "windows" },
  linux: { label: "Linux", recommendedId: "linux-deb" },
  macos: { label: "macOS", recommendedId: "macos" },
  unknown: {
    label: "an unrecognized platform",
    unavailable: "Choose a verified installer from the options below.",
  },
};

const NOTES = [
  [
    "01",
    "LISTEN WITH INTENT",
    "A steadier live-audio experience.",
    "Listener play, pause, mute, and autoplay-unlock paths are more deliberate, so a live session is easier to join, hear, and control.",
    Volume2,
  ],
  [
    "02",
    "BROADCAST WITH CLARITY",
    "A more cohesive creator path.",
    "The creator mixer, LiveKit publisher, health checks, and live-room coordination work together as a cleaner broadcast chain.",
    Radio,
  ],
  [
    "03",
    "KEEP THE STUDIO CLOSE",
    "Desktop builds that travel well.",
    "Echoo Studio is packaged for Windows, macOS, and Linux, with an Ubuntu .deb package plus AppImage and archive alternatives.",
    Laptop,
  ],
] as const;

const DETAILED_CHANGELOG = [
  {
    value: "listener-controls",
    number: "01",
    title: "Listener controls are more deliberate",
    items: [
      "Play, pause, and mute controls are available in the listening path.",
      "Autoplay-unlock handling makes it clearer when a browser requires an intentional start.",
      "Room entry and playback status are presented with a calmer, more focused control flow.",
    ],
  },
  {
    value: "creator-broadcast",
    number: "02",
    title: "Creator broadcast flow is more cohesive",
    items: [
      "Creator mixing and LiveKit publishing follow one more consistent room flow.",
      "LiveKit health checks surface configuration readiness before a session starts.",
      "Live-room coordination keeps the creator and listener paths aligned around the same live signal.",
    ],
  },
  {
    value: "desktop-privacy",
    number: "03",
    title: "Desktop controls respect the room and privacy",
    items: [
      "A room can remain available in the background through desktop tray controls.",
      "Tray actions cover opening the app, muting, unmuting, and leaving an active room.",
      "Native alerts are off by default, configurable per event, and never reveal room names or message content.",
    ],
  },
  {
    value: "linux-delivery",
    number: "04",
    title: "Linux receives first-class distribution choices",
    items: [
      "Ubuntu and Debian users can install the recommended .deb package.",
      "A portable AppImage and a .tar.gz archive remain available for compatible manual workflows.",
      "The v1.0.5 Linux packages were built and packaged-shell validated on Ubuntu.",
    ],
  },
  {
    value: "release-delivery",
    number: "05",
    title: "Release delivery stays explicit",
    items: [
      "The selector recommends an installer from the browser platform without downloading anything automatically.",
      "Windows, macOS, and Linux assets are delivered publicly from the landing project while the source repository remains private.",
      "Every current installer is marked unsigned; SmartScreen and Gatekeeper warnings are disclosed before download.",
    ],
  },
] as const;

const CHANGELOG_VALUES = DETAILED_CHANGELOG.map(entry => entry.value);

function BrandMark({ className = "" }: { className?: string }) {
  return <img src={LOGO_URL} alt="Echoo logo" className={className} />;
}

function CopyReleaseButton({
  copied,
  onCopy,
  className = "",
}: {
  copied: boolean;
  onCopy: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      className={`copy-release-link inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-[.62rem] font-black tracking-[.12em] active:scale-[.97] ${
        copied ? "is-copied" : ""
      } ${className}`}
      aria-label={copied ? "Release link copied" : "Copy the Echoo Studio v1.0.5 release link"}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "COPIED" : "COPY LINK"}
    </button>
  );
}

export default function Release() {
  const [detectedPlatform, setDetectedPlatform] = useState<DetectedPlatform>("unknown");
  const [downloadInteraction, setDownloadInteraction] = useState(idleDownloadInteraction);
  const [copiedTarget, setCopiedTarget] = useState<string | null>(null);
  const [openChangelogItem, setOpenChangelogItem] = useState(DEFAULT_CHANGELOG_ITEM);

  useEffect(() => {
    setDetectedPlatform(detectPlatform(window.navigator));
  }, []);

  useEffect(() => {
    if (!downloadInteraction.isStarting) return;
    const resetId = window.setTimeout(() => setDownloadInteraction(idleDownloadInteraction), 1800);
    return () => window.clearTimeout(resetId);
  }, [downloadInteraction.isStarting]);

  useEffect(() => {
    if (!copiedTarget) return;
    const resetId = window.setTimeout(() => setCopiedTarget(null), 1800);
    return () => window.clearTimeout(resetId);
  }, [copiedTarget]);

  const platformCopy = PLATFORM_COPY[detectedPlatform];
  const recommendedDownload = DOWNLOADS.find(
    download => download.id === platformCopy.recommendedId
  );

  const beginDownload = (downloadId: DownloadId) => {
    trackReleaseDownload(downloadId);
    setDownloadInteraction(startDownloadInteraction(downloadId));
  };

  const copyReleaseLink = async (target: string) => {
    const releaseLink = buildReleaseShareLink(window.location.origin);
    let copied = false;

    try {
      await navigator.clipboard.writeText(releaseLink);
      copied = true;
    } catch {
      const temporaryInput = document.createElement("textarea");
      temporaryInput.value = releaseLink;
      temporaryInput.setAttribute("readonly", "");
      temporaryInput.style.position = "fixed";
      temporaryInput.style.opacity = "0";
      document.body.appendChild(temporaryInput);
      temporaryInput.select();
      copied = document.execCommand("copy");
      temporaryInput.remove();
    }

    const feedback = getReleaseCopyFeedback(copied ? "success" : "error");
    if (copied) {
      setCopiedTarget(target);
      toast.success(feedback.title, { description: feedback.description });
    } else {
      toast.error(feedback.title, { description: feedback.description });
    }
  };

  return (
    <div className="release-page min-h-screen bg-[#F8FBFF] text-[#123F81] selection:bg-[#164F9D] selection:text-white">
      <PublicNavShell>
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-4 sm:px-8 lg:px-12">
          <a href="/" className="flex items-center gap-3" aria-label="Echoo home">
            <span className="flex h-10 w-10 overflow-hidden rounded-full border border-[#164F9D]/15 bg-white">
              <BrandMark className="h-full w-full object-cover" />
            </span>
            <span className="text-[.76rem] font-black tracking-[.18em]">ECHOO STUDIO</span>
          </a>
          <nav className="hidden items-center gap-7 text-[.66rem] font-bold tracking-[.15em] text-[#164F9D]/65 md:flex" aria-label="Release navigation">
            {RELEASE_NAVIGATION_LINKS.map(link => <a key={link.href} href={link.href} className="hover:text-[#164F9D]">{link.label}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="md:hidden"><MobilePublicMenu navigationLabel="Release navigation" links={RELEASE_NAVIGATION_LINKS} action={{ href: "#downloads", label: "GET v1.0.5" }} /></div>
            <a href="#downloads" className="hidden min-h-11 items-center gap-2 rounded-full bg-[#164F9D] px-4 py-2 text-[.65rem] font-black tracking-[.12em] text-white transition hover:bg-[#0E3E82] active:scale-[.97] md:inline-flex">
              GET v1.0.5<ArrowDownRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </PublicNavShell>

      <main id="top">
        <section className="relative isolate overflow-hidden border-b border-[#164F9D]/15 bg-white">
          <div className="absolute -right-64 -top-52 -z-10 h-[48rem] w-[48rem] rounded-full bg-[#DCE8F7]" />
          <div className="absolute -bottom-56 left-1/4 -z-10 h-[36rem] w-[36rem] rounded-full border-[70px] border-[#EFF5FC]" />
          <div className="mx-auto grid min-h-[620px] max-w-[1440px] grid-cols-1 px-5 sm:px-8 lg:grid-cols-[142px_1fr_330px] lg:px-12">
            <div className="hidden border-r border-[#164F9D]/15 pt-10 lg:block"><p className="[writing-mode:vertical-rl] text-[.6rem] font-bold tracking-[.28em] text-[#164F9D]/45">PRODUCT RELEASE / v1.0.5</p></div>
            <div className="flex flex-col justify-end py-16 lg:px-12 lg:py-20">
              <div className="mb-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[.63rem] font-bold tracking-[.15em] text-[#164F9D]/60"><span className="flex items-center gap-2 text-[#164F9D]"><CircleDot className="h-3.5 w-3.5 fill-[#164F9D]" /> RELEASED · v1.0.5</span><span>LIVE-AUDIO BROADCASTING</span><span>DESKTOP + WEB</span></div>
              <p className="max-w-xl font-serif text-xl leading-tight text-[#164F9D]/75 sm:text-2xl">The signal gets clearer.</p>
              <h1 className="mt-2 max-w-4xl text-[clamp(3.5rem,8vw,8.8rem)] font-black leading-[.84] tracking-[-.075em] text-[#164F9D]">Echoo<br /><span className="text-[#1D5FB4]">Studio</span> 1.0.5</h1>
              <p className="mt-8 max-w-lg text-base leading-7 text-[#164F9D]/70 sm:text-lg">A focused release for creators and listeners: more deliberate audio controls, privacy-preserving alerts, and a studio that travels to your desktop.</p>
              <div className="mt-9 flex flex-wrap gap-3"><a href="#downloads" className="inline-flex min-h-12 items-center gap-3 rounded-full bg-[#164F9D] px-5 py-3.5 text-[.68rem] font-black tracking-[.13em] text-white transition hover:-translate-y-0.5 hover:bg-[#0E3E82] active:scale-[.97]">CHOOSE YOUR DOWNLOAD <ArrowDownRight className="h-4 w-4" /></a><a href="#changelog" className="inline-flex min-h-12 items-center gap-3 rounded-full border border-[#164F9D]/25 bg-white/75 px-5 py-3.5 text-[.68rem] font-black tracking-[.13em] text-[#164F9D] transition hover:border-[#164F9D] hover:bg-[#F0F6FD] active:scale-[.97]">READ WHAT CHANGED <ArrowDownRight className="h-4 w-4" /></a></div>
            </div>
            <aside className="relative hidden flex-col justify-end overflow-hidden border-l border-[#164F9D]/15 py-10 pl-7 lg:flex"><div className="absolute inset-x-7 top-16 h-[330px] overflow-hidden rounded-[45%] border border-[#164F9D]/10 bg-white shadow-[0_24px_70px_rgba(18,63,129,.12)]"><BrandMark className="h-full w-full object-cover" /></div><div className="border-t border-[#164F9D]/25 pt-4"><p className="text-[.6rem] font-bold tracking-[.15em] text-[#164F9D]/45">THIS RELEASE</p><p className="mt-2 text-sm leading-5 text-[#164F9D]/80">Listener controls, private desktop alerts, and verified public delivery for all supported desktop platforms.</p></div></aside>
          </div>
        </section>

        <section className="border-b border-[#164F9D]/15 bg-[#EDF4FC]"><div className="mx-auto grid max-w-[1440px] grid-cols-1 lg:grid-cols-[142px_1fr]"><div className="hidden border-r border-[#164F9D]/15 lg:block" /><div className="grid lg:grid-cols-[1.45fr_1fr]"><div className="px-5 py-14 sm:px-8 lg:px-12 lg:py-20"><p className="text-[.64rem] font-black tracking-[.17em] text-[#1D5FB4]">THE SHORT VERSION / 01</p><h2 className="mt-6 max-w-3xl text-[clamp(2.4rem,4.7vw,5.25rem)] font-black leading-[.9] tracking-[-.055em]">Your live room,<br />in sharper focus.</h2></div><div className="flex flex-col justify-end border-t border-[#164F9D]/15 px-5 py-10 sm:px-8 lg:border-l lg:border-t-0 lg:px-12 lg:py-20"><p className="max-w-md font-serif text-xl leading-8 text-[#164F9D]/75">v1.0.5 brings the app’s web and desktop work into one release story—so the path from creator mix to listener playback is clearer and more controllable.</p><div className="mt-8 flex items-center gap-3 text-[.63rem] font-black tracking-[.15em] text-[#164F9D]/55"><span className="h-px w-12 bg-[#1D5FB4]" /> RELEASE BULLETIN</div></div></div></div></section>

        <section id="release" className="scroll-mt-10 border-b border-[#164F9D]/15 bg-[#164F9D] text-white"><div className="mx-auto grid max-w-[1440px] lg:grid-cols-[142px_1fr]"><div className="hidden border-r border-white/15 pt-10 lg:block"><p className="[writing-mode:vertical-rl] text-[.6rem] font-bold tracking-[.28em] text-white/45">WHAT CHANGED</p></div><div><div className="flex flex-col justify-between gap-6 border-b border-white/15 px-5 py-10 sm:px-8 lg:flex-row lg:items-end lg:px-12 lg:py-14"><div><p className="text-[.64rem] font-black tracking-[.17em] text-[#C8DBF2]">RELEASE NOTES / v1.0.5</p><h2 className="mt-4 text-4xl font-black tracking-[-.055em] sm:text-5xl">More control. Less friction.</h2></div><p className="max-w-md text-sm leading-6 text-white/70">The most important changes are expressed as practical improvements for the people creating and listening in the room.</p></div><div className="grid lg:grid-cols-3">{NOTES.map(([number, eyebrow, title, copy, Icon]) => <article key={number} className="border-b border-white/15 px-5 py-10 last:border-b-0 sm:px-8 lg:border-b-0 lg:border-r lg:px-10 lg:last:border-r-0"><div className="flex items-start justify-between"><span className="text-sm font-black text-[#C8DBF2]">{number}</span><Icon className="h-5 w-5 text-white/50" /></div><p className="mt-12 text-[.6rem] font-black tracking-[.16em] text-[#C8DBF2]">{eyebrow}</p><h3 className="mt-3 max-w-xs text-2xl font-bold leading-[1.02] tracking-[-.035em]">{title}</h3><p className="mt-5 max-w-sm text-sm leading-6 text-white/70">{copy}</p></article>)}</div></div></div></section>

        <section id="changelog" className="scroll-mt-10 border-b border-[#164F9D]/15 bg-white"><div className="mx-auto grid max-w-[1440px] lg:grid-cols-[142px_1fr]"><div className="hidden border-r border-[#164F9D]/15 pt-10 lg:block"><p className="[writing-mode:vertical-rl] text-[.6rem] font-bold tracking-[.28em] text-[#164F9D]/45">DETAILED CHANGELOG</p></div><div><div className="grid border-b border-[#164F9D]/15 lg:grid-cols-[1.15fr_.85fr]"><div className="px-5 py-14 sm:px-8 lg:px-12 lg:py-20"><p className="text-[.64rem] font-black tracking-[.17em] text-[#1D5FB4]">THE DETAIL / v1.0.5</p><h2 className="mt-5 max-w-3xl text-[clamp(2.6rem,5vw,5.5rem)] font-black leading-[.9] tracking-[-.06em]">Exactly what<br />moved forward.</h2></div><div className="flex flex-col justify-end border-t border-[#164F9D]/15 bg-[#EDF4FC] px-5 py-10 sm:px-8 lg:border-l lg:border-t-0 lg:px-12 lg:py-20"><p className="font-serif text-xl leading-8 text-[#164F9D]/75">Five practical changes across listening, broadcasting, desktop control, Linux delivery, and release guidance. Open any entry for the full detail.</p></div></div><Accordion type="single" collapsible value={openChangelogItem} onValueChange={value => setOpenChangelogItem(resolveChangelogSelection(value, CHANGELOG_VALUES))} className="release-changelog-accordion px-5 sm:px-8 lg:px-12">{DETAILED_CHANGELOG.map(entry => <AccordionItem key={entry.value} value={entry.value} className="border-[#164F9D]/15"><AccordionTrigger className="changelog-trigger py-7 text-[#123F81] hover:no-underline"><span className="flex items-start gap-5 text-left"><span className="font-serif text-3xl italic text-[#3B78FF]">{entry.number}</span><span><span className="block text-[.6rem] font-black tracking-[.15em] text-[#1D5FB4]">v1.0.5 CHANGE</span><span className="mt-2 block text-xl font-black leading-[1.05] tracking-[-.035em] sm:text-2xl">{entry.title}</span></span></span></AccordionTrigger><AccordionContent className="pl-0 sm:pl-12"><ul className="space-y-3 pb-6"><li className="sr-only">Detailed changes for {entry.title}</li>{entry.items.map(item => <li key={item} className="flex max-w-3xl gap-3 text-sm leading-6 text-[#164F9D]/72"><Check className="mt-1 h-3.5 w-3.5 shrink-0 text-[#3B78FF]" />{item}</li>)}</ul></AccordionContent></AccordionItem>)}</Accordion></div></div></section>

        <section id="downloads" className="scroll-mt-10 bg-[#F8FBFF]"><div className="mx-auto grid max-w-[1440px] lg:grid-cols-[142px_1fr]"><div className="hidden border-r border-[#164F9D]/15 pt-10 lg:block"><p className="[writing-mode:vertical-rl] text-[.6rem] font-bold tracking-[.28em] text-[#164F9D]/45">GET THE RELEASE</p></div><div><div className="flex flex-col gap-6 border-b border-[#164F9D]/15 px-5 py-12 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:px-12 lg:py-16"><div><p className="text-[.64rem] font-black tracking-[.17em] text-[#1D5FB4]">DOWNLOAD ECHOO STUDIO / v1.0.5</p><h2 className="mt-4 text-[clamp(2.8rem,5.4vw,6.3rem)] font-black leading-[.87] tracking-[-.075em]">Find your platform.</h2></div><div className="flex max-w-sm items-start gap-3 border-l-2 border-[#1D5FB4] pl-4"><ShieldCheck className="mt-.5 h-4 w-4 shrink-0 text-[#1D5FB4]" /><p className="text-sm leading-5 text-[#164F9D]/65">Verified Windows, macOS, and Linux v1.0.5 downloads are delivered here. Every current installer is clearly labelled unsigned.</p></div></div><div className="grid border-b border-[#164F9D]/15 bg-white lg:grid-cols-[1.15fr_.85fr]"><div className="px-5 py-9 sm:px-8 lg:px-12"><p className="text-[.63rem] font-black tracking-[.16em] text-[#1D5FB4]">DETECTED PLATFORM</p><h3 className="mt-3 text-3xl font-black tracking-[-.045em]">{platformCopy.label}</h3>{recommendedDownload ? <><p className="mt-3 max-w-xl text-sm leading-6 text-[#164F9D]/70">We recommend the {recommendedDownload.platform} {recommendedDownload.format} ({recommendedDownload.version}). Nothing downloads automatically.</p><div className="mt-6 flex flex-wrap gap-3"><a href={recommendedDownload.href} target="_blank" rel="noreferrer" onClick={() => beginDownload(recommendedDownload.id)} className="download-action inline-flex min-h-11 items-center gap-2 rounded-full bg-[#164F9D] px-5 py-3 text-[.65rem] font-black tracking-[.13em] text-white active:scale-[.97]">{isDownloadStarting(downloadInteraction, recommendedDownload.id) ? <><LoaderCircle className="h-4 w-4 animate-spin" /> STARTING DOWNLOAD</> : <>DOWNLOAD RECOMMENDED <ArrowUpRight className="h-4 w-4" /></>}</a><CopyReleaseButton copied={copiedTarget === "recommended"} onCopy={() => copyReleaseLink("recommended")} /></div></> : <p className="mt-3 text-sm leading-6 text-[#164F9D]/70">{platformCopy.unavailable}</p>}</div><div className="border-t border-[#164F9D]/15 bg-[#EDF4FC] px-5 py-9 sm:px-8 lg:border-l lg:border-t-0 lg:px-10"><p className="text-[.63rem] font-black tracking-[.16em] text-[#1D5FB4]">SHARE THIS RELEASE</p><p className="mt-3 max-w-sm text-sm leading-6 text-[#164F9D]/70">Copy a clean link to this v1.0.5 bulletin before sharing. It points to the release choices, not a private source repository or an installer file.</p><p className="mt-6 text-[.61rem] font-bold tracking-[.12em] text-[#164F9D]/55" role="status" aria-live="polite">{copiedTarget ? "RELEASE LINK COPIED." : downloadInteraction.isStarting ? "PREPARING YOUR SELECTED DOWNLOAD…" : "DOWNLOADS OPEN IN A NEW TAB."}</p></div></div><div className="grid md:grid-cols-2 xl:grid-cols-5">{DOWNLOADS.map(({ id, platform, format, version, description, href, icon: Icon }) => { const isStarting = isDownloadStarting(downloadInteraction, id); return <article key={id} className={`download-card group flex min-h-[310px] flex-col border-b border-[#164F9D]/15 px-5 py-8 sm:px-8 xl:border-b-0 xl:border-r xl:px-7 xl:last:border-r-0 ${isStarting ? "is-starting" : ""}`}><div className="flex items-start justify-between"><Icon className="h-6 w-6 text-[#1D5FB4] group-hover:text-[#C8DBF2]" />{isStarting ? <LoaderCircle className="h-5 w-5 animate-spin text-[#1D5FB4] group-hover:text-[#C8DBF2]" /> : <ArrowUpRight className="h-5 w-5 text-[#164F9D]/45 group-hover:text-[#C8DBF2]" />}</div><div className="mt-auto"><p className="text-[.62rem] font-black tracking-[.15em] text-[#1D5FB4] group-hover:text-[#C8DBF2]">{platform}</p><h3 className="mt-2 text-2xl font-black tracking-[-.045em]">{format}</h3><p className="mt-2 text-[.6rem] font-bold tracking-[.12em] text-[#164F9D]/45 group-hover:text-white/55">{version}</p><p className="mt-3 max-w-xs text-sm leading-5 text-[#164F9D]/60 group-hover:text-white/70">{description}</p><div className="mt-6 flex flex-wrap gap-2"><a href={href} target="_blank" rel="noreferrer" onClick={() => beginDownload(id)} aria-label={`${isStarting ? "Starting" : "Download"} ${platform} ${format}`} className="download-card-action inline-flex min-h-11 items-center gap-2 text-[.63rem] font-black tracking-[.13em]">{isStarting ? "STARTING DOWNLOAD" : "DOWNLOAD"} <ArrowDownRight className="h-3.5 w-3.5" /></a><CopyReleaseButton copied={copiedTarget === id} onCopy={() => copyReleaseLink(id)} className="copy-release-link-card" /></div></div></article>})}</div><div className="border-t border-[#164F9D]/15 px-5 py-6 sm:px-8 lg:px-12"><p className="max-w-4xl text-xs leading-5 text-[#164F9D]/55">All current files are unsigned. Windows SmartScreen and macOS Gatekeeper may show a warning; the macOS DMG is not notarized. Linux `.deb` files are installer packages—install them with a package manager rather than running them directly.</p></div></div></div></section>

        <section id="install" className="border-t border-[#164F9D]/15 bg-[#DCE8F7]"><div className="mx-auto grid max-w-[1440px] lg:grid-cols-[142px_1fr]"><div className="hidden border-r border-[#164F9D]/15 lg:block" /><div className="grid lg:grid-cols-[1.08fr_.92fr]"><div className="px-5 py-14 sm:px-8 lg:px-12 lg:py-20"><p className="text-[.64rem] font-black tracking-[.17em] text-[#1D5FB4]">A NOTE ON THE DESKTOP APP / 03</p><h2 className="mt-5 max-w-2xl text-4xl font-black leading-[.94] tracking-[-.055em] sm:text-5xl">A desktop window for your Echoo workspace.</h2><p className="mt-7 max-w-xl font-serif text-xl leading-8 text-[#164F9D]/70">The desktop builds provide a dedicated Echoo Studio window, while the live experience continues to connect through Echoo’s web services.</p><a href="#downloads" className="mt-9 inline-flex min-h-11 items-center gap-2 text-[.66rem] font-black tracking-[.14em] text-[#164F9D] hover:text-[#0E3E82]">VIEW INSTALL OPTIONS <ArrowDownRight className="h-4 w-4" /></a></div><div className="flex items-end border-t border-[#164F9D]/15 p-5 sm:p-8 lg:border-l lg:border-t-0 lg:p-12"><div className="w-full rounded-2xl bg-[#164F9D] p-6 text-white shadow-[0_22px_60px_rgba(18,63,129,.2)] sm:p-8"><div className="flex items-center justify-between"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#164F9D]"><Radio className="h-3.5 w-3.5" /></span><span className="text-[.6rem] font-black tracking-[.15em] text-white/65">READY WHEN YOU ARE</span></div><div className="mt-12 flex h-14 items-end gap-1.5">{[20, 45, 30, 70, 42, 90, 55, 35, 76, 50, 66, 28].map((height, index) => <span key={index} className="flex-1 rounded-full bg-white/60" style={{ height: `${height}%` }} />)}</div><div className="mt-5 border-t border-white/20 pt-4"><p className="text-sm font-bold">Mix. Publish. Listen.</p><p className="mt-1 text-sm leading-5 text-white/70">The essential live path, arranged for a more reliable session.</p></div></div></div></div></div></section>
      </main>
      <footer className="border-t border-[#164F9D]/15 bg-white"><div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-5 py-9 sm:px-8 md:flex-row md:items-end md:justify-between lg:px-12"><div className="flex items-center gap-3"><span className="flex h-8 w-8 overflow-hidden rounded-full"><BrandMark className="h-full w-full object-cover" /></span><span className="text-[.72rem] font-black tracking-[.18em]">ECHOO STUDIO</span></div><div className="flex items-center gap-3 text-[.62rem] font-black tracking-[.14em] text-[#164F9D]/55"><span>v1.0.5</span><span className="h-1 w-1 rounded-full bg-[#1D5FB4]" /><span>RELEASE PAGE</span><span>PRIVATE SOURCE REPO</span></div></div></footer>
    </div>
  );
}

import { createHash, randomBytes } from "node:crypto";
import { ENV } from "./_core/env";

const CONFIRMATION_TOKEN_BYTES = 32;

export type NewsletterDeliveryConfig = {
  apiKey: string;
  fromEmail: string;
  confirmationOrigin: string;
};

export type NewsletterDeliveryEnvironment = {
  resendApiKey?: string;
  resendFromEmail?: string;
  newsletterConfirmationOrigin?: string;
  newsletterDeliveryEnabled?: boolean;
};

export function createNewsletterConfirmationToken() {
  return randomBytes(CONFIRMATION_TOKEN_BYTES).toString("hex");
}

export function hashNewsletterConfirmationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function buildNewsletterConfirmationUrl(confirmationOrigin: string, token: string) {
  const confirmationUrl = new URL("/newsletter/confirm", confirmationOrigin);
  confirmationUrl.searchParams.set("token", token);
  return confirmationUrl.toString();
}

export function isNewsletterConfirmationWindowOpen(expiresAt: Date | null, now = new Date()) {
  return Boolean(expiresAt && expiresAt.getTime() > now.getTime());
}

export function resolveNewsletterDeliveryConfig(environment: NewsletterDeliveryEnvironment): NewsletterDeliveryConfig {
  if (!environment.newsletterDeliveryEnabled) {
    throw new Error("Newsletter delivery is not active yet. Please try again later.");
  }

  const config = {
    apiKey: environment.resendApiKey ?? "",
    fromEmail: environment.resendFromEmail ?? "",
    confirmationOrigin: environment.newsletterConfirmationOrigin ?? "",
  };

  if (!config.apiKey || !config.fromEmail || !config.confirmationOrigin) {
    throw new Error("Newsletter confirmation is not configured yet. Please try again later.");
  }

  const origin = new URL(config.confirmationOrigin);
  if (origin.protocol !== "https:") {
    throw new Error("Newsletter confirmation requires a secure public HTTPS origin.");
  }

  return config;
}

export function getNewsletterDeliveryConfig(): NewsletterDeliveryConfig {
  return resolveNewsletterDeliveryConfig(ENV);
}

export async function sendNewsletterConfirmationEmail(email: string, token: string) {
  const config = getNewsletterDeliveryConfig();
  const confirmationUrl = buildNewsletterConfirmationUrl(config.confirmationOrigin, token);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.fromEmail,
      to: [email],
      subject: "Confirm your Echoo release updates",
      html: `<p>Confirm your email address to receive Echoo release updates.</p><p><a href="${confirmationUrl}">Confirm my subscription</a></p><p>If you did not request this, you can safely ignore this email.</p>`,
      text: `Confirm your email address to receive Echoo release updates: ${confirmationUrl}\n\nIf you did not request this, you can safely ignore this email.`,
    }),
  });

  if (!response.ok) {
    console.error("[Newsletter] Confirmation delivery failed", { status: response.status });
    throw new Error("We could not send your confirmation email. Please try again later.");
  }

  return { confirmationUrl };
}

function getSenderDomain(fromEmail: string) {
  const address = fromEmail.match(/<([^>]+)>/)?.[1] ?? fromEmail;
  const domain = address.trim().split("@")[1];
  if (!domain) throw new Error("Newsletter sender address is invalid.");
  return domain.toLowerCase();
}

export async function verifyNewsletterDeliveryCredentials() {
  const config = getNewsletterDeliveryConfig();
  const response = await fetch("https://api.resend.com/domains?limit=100", {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });

  if (!response.ok) {
    throw new Error(`Resend credential validation failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as { data?: Array<{ name?: string; status?: string }> };
  const senderDomain = getSenderDomain(config.fromEmail);
  const verified = payload.data?.some(
    domain => domain.name?.toLowerCase() === senderDomain && domain.status === "verified",
  );

  if (!verified) {
    throw new Error("The configured Resend sender domain is not verified.");
  }

  return { senderDomain };
}

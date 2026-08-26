import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { earlyAccessSubscribers, InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';
import {
  createNewsletterConfirmationToken,
  getNewsletterDeliveryConfig,
  hashNewsletterConfirmationToken,
  isNewsletterConfirmationWindowOpen,
  sendNewsletterConfirmationEmail,
} from "./newsletterDelivery";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function subscribeToEarlyAccess(email: string) {
  const db = await getDb();
  if (!db) {
    throw new Error("Early-access sign-up is temporarily unavailable.");
  }

  const normalizedEmail = email.trim().toLowerCase();
  await db
    .insert(earlyAccessSubscribers)
    .values({ email: normalizedEmail })
    .onDuplicateKeyUpdate({
      set: {
        consentVersion: "early-access-v1",
        source: "echoo-homepage",
      },
    });

  return { email: normalizedEmail };
}

export async function subscribeToNewsletter(email: string) {
  getNewsletterDeliveryConfig();
  const db = await getDb();
  if (!db) {
    throw new Error("Newsletter sign-up is temporarily unavailable.");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db.select().from(earlyAccessSubscribers).where(eq(earlyAccessSubscribers.email, normalizedEmail)).limit(1);
  if (existing[0]?.newsletterStatus === "confirmed") {
    return { confirmationSent: false };
  }

  const token = createNewsletterConfirmationToken();
  const confirmationExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  await db
    .insert(earlyAccessSubscribers)
    .values({
      email: normalizedEmail,
      consentVersion: "newsletter-v1",
      source: "echoo-footer-newsletter",
      newsletterStatus: "pending",
      confirmationTokenHash: hashNewsletterConfirmationToken(token),
      confirmationExpiresAt,
      confirmedAt: null,
    })
    .onDuplicateKeyUpdate({
      set: {
        consentVersion: "newsletter-v1",
        source: "echoo-footer-newsletter",
        newsletterStatus: "pending",
        confirmationTokenHash: hashNewsletterConfirmationToken(token),
        confirmationExpiresAt,
        confirmedAt: null,
      },
    });

  await sendNewsletterConfirmationEmail(normalizedEmail, token);
  return { confirmationSent: true };
}

export async function confirmNewsletterSubscription(token: string) {
  const db = await getDb();
  if (!db) {
    throw new Error("Newsletter confirmation is temporarily unavailable.");
  }

  const subscribers = await db
    .select()
    .from(earlyAccessSubscribers)
    .where(eq(earlyAccessSubscribers.confirmationTokenHash, hashNewsletterConfirmationToken(token)))
    .limit(1);
  const subscriber = subscribers[0];
  if (!subscriber) return false;
  if (subscriber.newsletterStatus === "confirmed") return true;
  if (subscriber.newsletterStatus !== "pending" || !isNewsletterConfirmationWindowOpen(subscriber.confirmationExpiresAt)) return false;

  await db
    .update(earlyAccessSubscribers)
    .set({
      newsletterStatus: "confirmed",
      confirmationTokenHash: null,
      confirmationExpiresAt: null,
      confirmedAt: new Date(),
    })
    .where(eq(earlyAccessSubscribers.id, subscriber.id));
  return true;
}

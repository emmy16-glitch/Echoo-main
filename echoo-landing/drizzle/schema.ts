import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Public early-access registrations. The table deliberately stores only the
 * email address and the consent version needed to honour the visitor's choice.
 */
export const earlyAccessSubscribers = mysqlTable("earlyAccessSubscribers", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  consentVersion: varchar("consentVersion", { length: 64 }).default("early-access-v1").notNull(),
  source: varchar("source", { length: 64 }).default("echoo-homepage").notNull(),
  newsletterStatus: mysqlEnum("newsletterStatus", ["not_requested", "pending", "confirmed", "unsubscribed"]).default("not_requested").notNull(),
  confirmationTokenHash: varchar("confirmationTokenHash", { length: 64 }),
  confirmationExpiresAt: timestamp("confirmationExpiresAt"),
  confirmedAt: timestamp("confirmedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EarlyAccessSubscriber = typeof earlyAccessSubscribers.$inferSelect;
export type InsertEarlyAccessSubscriber = typeof earlyAccessSubscribers.$inferInsert;

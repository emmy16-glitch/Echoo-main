import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { confirmNewsletterSubscription, subscribeToEarlyAccess, subscribeToNewsletter } from "./db";
import { z } from "zod";

export const earlyAccessInput = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(320),
});

export const newsletterConfirmationInput = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, "Invalid confirmation token."),
});

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  earlyAccess: router({
    subscribe: publicProcedure.input(earlyAccessInput).mutation(async ({ input }) => {
      await subscribeToEarlyAccess(input.email);
      return { success: true } as const;
    }),
  }),
  newsletter: router({
    subscribe: publicProcedure.input(earlyAccessInput).mutation(async ({ input }) => {
      await subscribeToNewsletter(input.email);
      return { success: true } as const;
    }),
    confirm: publicProcedure.input(newsletterConfirmationInput).mutation(async ({ input }) => ({
      confirmed: await confirmNewsletterSubscription(input.token),
    })),
  }),
});

export type AppRouter = typeof appRouter;

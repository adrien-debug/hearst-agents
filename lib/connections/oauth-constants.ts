import { z } from "zod";

export const AUTH_EXPIRING_DAYS_THRESHOLD = 7;
export const AUTH_CRITICAL_DAYS_THRESHOLD = 3;

export const ExpiringConnectionSchema = z.object({
  connectionId: z.string().min(1),
  appName: z.string().min(1),
  userId: z.string().min(1),
  tenantId: z.string().min(1),
  daysUntilExpiry: z.number().nullable(),
  status: z.enum(["expiring_soon", "expired"]),
});

export type ExpiringConnection = z.infer<typeof ExpiringConnectionSchema>;

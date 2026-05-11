import { z } from "zod";

export const LogEntrySchema = z.object({
  id: z.string(),
  scope: z.string(),
  level: z.enum(["info", "warn", "error"]),
  event: z.string(),
  data: z.record(z.string(), z.any()).optional(),
  timestamp: z.string().datetime({ offset: true }),
});

export type LogEntry = z.infer<typeof LogEntrySchema>;

export const PageInfoSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  active: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
});

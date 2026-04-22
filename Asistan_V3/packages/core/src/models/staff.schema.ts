import { z } from "zod";

export const StaffRoleSchema = z.enum(["boss", "coordinator", "staff", "guest"]);

export const StaffSchema = z.object({
  id: z.string().uuid().optional(),
  telegramId: z.string(),
  name: z.string().min(1),
  department: z.string(),
  role: StaffRoleSchema,
  phone: z.string().optional(),
  isMarina: z.boolean().optional(),
  createdAt: z.string().datetime({ offset: true }).optional(),
});

export type StaffRole = z.infer<typeof StaffRoleSchema>;
export type Staff = z.infer<typeof StaffSchema>;

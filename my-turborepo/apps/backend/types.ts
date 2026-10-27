import { z } from "zod";

export const SignupSchema = z.object({
  email: z.email().trim().max(254),
});

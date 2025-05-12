import { z, ZodTypeAny } from "zod";

export const listBodySchema = <T extends ZodTypeAny>(schema: T) =>
  z.object({
    data: z.array(schema),
    total: z.number(),
  });

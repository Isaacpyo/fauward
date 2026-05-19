import { z } from 'zod';
import { isDomainFormatValid, normalizeDomainInput } from './domain.validator.js';

export const setDomainBodySchema = z.object({
  domain: z
    .string()
    .min(4)
    .max(253)
    .transform(normalizeDomainInput)
    .refine(isDomainFormatValid, { message: 'Invalid domain format' })
});

export type SetDomainBody = z.infer<typeof setDomainBodySchema>;

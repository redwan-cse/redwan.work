import { z } from 'zod';

export const uuidSchema = z.string().trim().uuid('Invalid identifier format.');

export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.enum(['USD', 'BDT', 'EUR', 'GBP']));

export const positiveFiniteFxRateSchema = z
  .number()
  .refine((val) => Number.isFinite(val) && val > 0 && val <= 1_000_000, {
    message: 'FX rate must be a positive finite number.',
  });

export const optionalPositiveFiniteFxRateSchema = positiveFiniteFxRateSchema.nullable().optional();

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email('Please enter a valid email address.');

export const passwordBoundsSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters.')
  .max(128, 'Password must not exceed 128 characters.');

export const orderMessageBodySchema = z.object({
  body: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(1, 'Message body is required.')
        .max(10_000, 'Message body must not exceed 10,000 characters.')
    ),
  is_internal_note: z.boolean().optional().default(false),
});

export const contactPresignRequestSchema = z.object({
  files: z
    .array(
      z.object({
        filename: z.string().min(1).max(255),
        mime: z.string().min(1).max(128),
        size: z.number().int().min(1).max(10 * 1024 * 1024),
      })
    )
    .min(1)
    .max(5),
  turnstileToken: z.string().min(1).max(2048),
});

export const portalPresignRequestSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mime: z.string().trim().max(128).optional(),
  mimeType: z.string().trim().max(128).optional(),
  size: z.number().int().min(1).max(100 * 1024 * 1024),
  category: z
    .enum([
      'deliverable',
      'order_attachment',
      'requirement_attachment',
      'ticket_attachment',
      'payment_proof',
      'roe_document',
    ])
    .optional()
    .default('deliverable'),
  clientId: uuidSchema.optional(),
  orderId: uuidSchema.nullable().optional(),
});

export const blogsPreloadQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(50).default(1),
});

export const adminSearchQuerySchema = z.object({
  q: z.string().trim().max(64).default(''),
});

export const recoveryExportQuerySchema = z.object({
  order_id: uuidSchema,
});

export const revalidateQuerySchema = z.object({
  path: z.enum(['/blogs']).default('/blogs'),
});

export const logoutReasonSchema = z
  .enum(['deactivated', 'session_invalid'])
  .nullable()
  .optional();

export const resumeDownloadQuerySchema = z.object({
  download: z.enum(['1', 'true', '0', 'false']).nullable().optional(),
});

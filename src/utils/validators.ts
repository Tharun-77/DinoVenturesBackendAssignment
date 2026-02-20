import { z } from 'zod';

export const TopupSchema = z.object({
    userId: z.string().uuid('userId must be a valid UUID'),
    assetId: z.string().uuid('assetId must be a valid UUID'),
    amount: z.number().positive('amount must be positive'),
    metadata: z.record(z.unknown()).optional(),
});

export const BonusSchema = TopupSchema; // same shape

export const SpendSchema = z.object({
    userId: z.string().uuid('userId must be a valid UUID'),
    assetId: z.string().uuid('assetId must be a valid UUID'),
    amount: z.number().positive('amount must be positive'),
    metadata: z.record(z.unknown()).optional(),
});

export type TopupInput = z.infer<typeof TopupSchema>;
export type BonusInput = z.infer<typeof BonusSchema>;
export type SpendInput = z.infer<typeof SpendSchema>;

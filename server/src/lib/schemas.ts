import { z } from 'zod';

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters'),
  name: z.string().trim().min(1).max(80).optional(),
});

export const policySchema = z.object({
  maxBudgetCents: z.number().int().min(100).max(10_000_000),
  maxQuantity: z.number().int().min(1).max(20),
  allowedCategories: z.array(z.string()).max(10).default([]),
  blockedCategories: z.array(z.string()).max(10).default([]),
  requireApproval: z.boolean().default(true),
});

export const addCartItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(20).default(1),
});

export const quantitySchema = z.object({ quantity: z.number().int().min(0).max(20) });

export const chatSchema = z.object({
  message: z.string().trim().min(1, 'Type what you need').max(2000),
  sessionId: z.string().uuid().nullable().optional(),
});

export const createOrderSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export const paypalOrderSchema = z.object({ orderId: z.string().min(1) });

export const memorySchema = z.object({
  preferred_brands: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  notes: z.array(z.string().trim().min(1).max(240)).max(12).optional(),
});

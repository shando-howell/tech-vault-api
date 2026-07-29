import { z } from 'zod';

// Product Creation Schema
export const productSchema = z.object({
    body: z.object({
        sku: z.string().min(3, 'SKU must be at least 3 characters.'),
        name: z.string().min(1, 'Product name is required.'),
        description: z.string().optional(),
        price: z.number().positive('Price must be greater than 0.'),
        stock_quantity: z.number().int().nonnegative('Stock cannot be nagative.').default(0),
    }),
});

// Checkout Schema
export const checkoutSchema = z.object({
    body: z.object({
        user_id: z.number().int().positive('Valid user ID is required.'),
        items: z.array(
            z.object({
                product_id: z.number().int().positive(),
                quantity: z.number().int().positive('Quantity must be at least 1'),
            })
        ).min(1, 'Order must contain at least one item.'),
    }),
});

export const userHistorySchema = z.object({
    params: z.object({
        userId: z.coerce.number().int().positive('Valid User ID is required.'),
    }),
});
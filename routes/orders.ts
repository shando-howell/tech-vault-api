import { Router, Request, Response } from 'express';
import { clerkClient, getAuth } from '@clerk/express';
import { requireAuthAPI } from '../middleware/auth';

import { getClient, query } from '../db';
import { validate } from '../middleware/validate';
import { checkoutSchema, userHistorySchema } from '../schemas';

const router = Router();

// Helper function to get the PayPal Access Token
const generateAccessToken = async () => {
    const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_BASE_URL } = process.env;

    // PayPal requires the keys to be Base64 encoded for the initial auth
    const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");

    const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
        method: "POST",
        body: "grant_type=client_credentials",
        headers: {
            Authorization: `Basic ${auth}`,
        },
    });

    const data = await response.json();
    return data.access_token;
};

// The secure checkout route
router.post('/orders/create-paypal-order', async (req: Request, res: Response) => {
    const { userId } = req.body;

    try {
        // SECURITY CHECK: Calculate the real total straight from PostgreSQL
        const cartQuery = `
            SELECT ci.quantity, p.price
            FROM cart_items ci
            JOIN carts c ON ci.cart_id = c.id
            JOIN products p ON ci.product_id = p.id
            WHERE c.user_id = $1
        `;

        const cartResult = await query(cartQuery, [userId]);

        if (cartResult.rows.length === 0) {
            return res.status(400).json({ error: "Cart is empty." });
        }

        // Multiply quantities by prices and sum them up
        const total = cartResult.rows.reduce((sum, item) => {
            return sum + (Number(item.price) * item.quantity);
        }, 0);

        // Get the auth token
        const accessToken = await generateAccessToken();

        // Tell PayPal exactly how much to charge
        const url = `${process.env.PAYPAL_BASE_URL}/v2/checkout/orders`;
        const payload = {
            intent: "CAPTURE",
            purchase_units: [
                {
                    amount: {
                        currency_code: "USD",
                        value: total.toFixed(2),
                    },
                },
            ],
        };

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        console.log("SERVER ORDER ID CHECK:", data.id)
        // Send the secure PayPal order ID back to the client
        res.json({ id: data.id });
    } catch (error) {
        console.error("PAYPAL ORDER CRASH:", error);
        res.status(500).json({ error: "Failed to create PayPal order" });
    }
});

router.post('/checkout', requireAuthAPI, validate(checkoutSchema), async (req: Request, res: Response) => {
    const { items } = req.body;
    const auth = getAuth(req);
    const userId = auth.userId;

    console.log(`Processing secure checkout for user: ${userId}`);

    // Look up internal user ID using the Clerk ID
    const userRes = await query('SELECT id FROM users WHERE clerk_id = $1', [userId]);

    if (userRes.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found in local database.'});
    }

    const internalUserId = userRes.rows[0].id;

    if (userId) {
        // Fetch the user from Clerk to get their current email
        const user = await clerkClient.users.getUser(userId);

        // Find the primary email in Clerk's emails array
        const primaryEmail = user.emailAddresses.find(
            email => email.id === user.primaryEmailAddressId
        )?.emailAddress || 'no-email@provided.com';

        // Extract the status from the request
        const { status } = req.body;
    
        // Check out a dedicated connection from the pool
        const client = await getClient();
    
        try {
            // Begin the transaction 
            await client.query('BEGIN');
    
            let totalAmount = 0;
            const processedItems = [];
    
            // Process each item
            for (const item of items) {
                // Lock the specific row for update so no one else can buy it simultaneously
                const productRes = await client.query(
                    'SELECT price, stock_quantity FROM products WHERE id = $1 FOR UPDATE',
                    [item.product_id]
                );
    
                if (productRes.rows.length === 0) {
                    throw new Error(`Product ID ${item.product_id} not found.`)
                }
    
                const product = productRes.rows[0];
    
                if (product.stock_quantity < item.quantity) {
                    throw new Error(`Insufficient stock for Product ID ${item.product_id}`);
                }
    
                // Calculate total and prepare item for insertion
                const priceAtPurchase = parseFloat(product.price);
                totalAmount += priceAtPurchase * item.quantity;
                processedItems.push({ ...item, priceAtPurchase });
    
                // Deduct inventory
                await client.query(
                    'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
                    [item.quantity, item.product_id]
                );
            }
    
            // Create the main Order record
            const orderRes = await client.query(
                'INSERT INTO orders (user_id, customer_email, total_amount, status) VALUES ($1, $2, $3, $4) RETURNING id',
                [internalUserId, primaryEmail, totalAmount, status]
            );
            const orderId = orderRes.rows[0].id;
    
            // Insert all Order Items
            for (const item of processedItems) {
                await client.query(
                    'INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase) VALUES ($1, $2, $3, $4)',
                    [orderId, item.product_id, item.quantity, item.priceAtPurchase]
                );
            }
    
            // Commit the transaction
            await client.query('COMMIT');
    
            res.status(201).json({ success: true, message: 'Checkout successful.', orderId });
        } catch (error: any) {
            // Rollback if anything fails
            await client.query('ROLLBACK');
            console.error('Checkout transaction failed:', error.message);
            res.status(400).json({ success: false, message: error.message });
        } finally {
            // Always release the client back to the pool
            client.release();
        }
    }
});

// GET: Fetch user order history
router.get('/user/history', requireAuthAPI, validate(userHistorySchema), async (req: Request, res: Response) => {
    try {
        const auth = getAuth(req);
        const userId = auth.userId;

        // Look up our internal user ID using the Clerk ID
        const userRes = await query('SELECT id FROM users WHERE clerk_id = $1', [userId]);

        if (userRes.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found in local database'
            });
        }

        const internalUserId = userRes.rows[0].id;

        // Fetch the history using the internal ID
        const historyQuery = `
            SELECT
                o.id AS order_id,
                o.total_amount,
                o.status,
                o.created_at,
                json_agg(
                    json_build_object(
                        'product_id', oi.product_id,
                        'name', p.name,
                        'quantity', oi.quantity,
                        'price_at_purchase', oi.price_at_purchase
                    )
                ) AS items
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            JOIN products p ON oi.product_id = p.id
            WHERE o.user_id = $1
            GROUP BY o.id
            ORDER BY o.created_at DESC;
        `;

        const result = await query(historyQuery, [internalUserId]);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching order history:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

export default router;
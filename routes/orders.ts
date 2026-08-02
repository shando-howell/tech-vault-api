import { Router, Request, Response } from 'express';
import { getAuth } from '@clerk/express';
import { requireAuthAPI } from '../middleware/auth';

import { query } from '../db';
import { validate } from '../middleware/validate';
import { userHistorySchema } from '../schemas';

const router = Router();

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
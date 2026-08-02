import { Router } from 'express';

import { query } from '../db';

const router = Router();

// Simulate the order checkout
router.post('/checkout/simulate', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing user ID" });

    try {
        // Start the transaction
        await query('BEGIN');

        // 2. Fetch the cart items and lock in the math
        const cartQuery = `
            SELECT ci.quantity, p.price, c.id as cart_id
            FROM cart_items ci
            JOIN carts c ON ci.cart_id = c.id
            JOIN products p ON ci.product_id = p.id
            WHERE c.user_id = $1
        `;
        const { rows: items } = await query(cartQuery, [userId]);

        if (items.length === 0) {
            throw new Error("Cannot checkout an empty cart.");
        }

        let baseTotal = 0;
        items.forEach(item => {
            baseTotal += (parseFloat(item.price) * item.quantity);
        });

        const finalOrderTotal = (baseTotal + 15.00 + (baseTotal * 0.08)).toFixed(2);
        const cartId = items[0].cart_id;

        // 3. Create the order
        const insertOrderQuery = `
            INSERT INTO orders (user_id, total_amount)
            VALUES ($1, $2) RETURNING id
        `;
        const orderResult = await query(insertOrderQuery, [userId, finalOrderTotal]);
        const newOrderId = orderResult.rows[0].id;

        // 4. Clear the user's cart_items
        await query(`DELETE FROM cart_items WHERE cart_id = $1`, [cartId]);

        // Commit the transaction (save everything permanently)
        await query('COMMIT');

        // Generate a clean order number for the frontend UI
        const simulatedOrderNumber = `ORD-${newOrderId}-${Math.floor(Math.random() * 10000)}`;

        res.status(200).json({
            success: true,
            orderNumber: simulatedOrderNumber
        });
    } catch (error) {
        // If ANYTHING fails above, undo the whole process
        await query('ROLLBACK');
        console.error("Checkout Transaction Failed:", error);
        res.status(500).json({ error: "Checkout failed, cart was not cleared." });
    }
});

export default router;
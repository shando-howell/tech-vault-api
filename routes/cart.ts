import { Router, Request, Response } from 'express';

import { query } from '../db';

const router = Router();

router.post('/cart', async (req: Request, res: Response) => {
    console.log("INCOMING Add to cart payload: ", req.body);

    // Grab the data sent form the client
    const { userId, productId, quantity = 1 } = req.body;

    if (!userId || !productId) {
        return res.status(400).json({ success: false, message: "Missing userId or product Id." });
    }

    try {
        // Find the user's cart. If they don't have one, create it.
        let cartResult = await query('SELECT id FROM carts WHERE user_id = $1', [userId]);
        let cartId;

        if (cartResult.rows.length === 0) {
            const newCart = await query(
                'INSERT INTO carts (user_id) VALUES ($1) RETURNING id',
                [userId]
            );
            cartId = newCart.rows[0].id;
        } else {
            cartId = cartResult.rows[0].id;
        }

        // Add the item to the cart, or increase quantity if it's already there
        await query(
            `INSERT INTO cart_items (cart_id, product_id, quantity)
            VALUES ($1, $2, $3)
            ON CONFLICT (cart_id, product_id)
            DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity`,
            [cartId, productId, quantity]
        );

        res.json({ success: true, message: "Cart updated successfully!"});
    } catch (error) {
        console.error("POSTGRES INSERT ERROR:", error);
        res.status(500).json({ success: false, message: "Failed to update cart." });
    }
});

router.get('/cart/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        // This JOIN statement bridges all three tables together
        const results = await query(`
            SELECT
                ci.quantity,
                p.id AS product_id,
                p.name,
                p.price,
                p.image_url
            FROM cart_items ci
            JOIN carts c ON ci.cart_id = c.id
            JOIN products p ON ci.product_id = p.id
            WHERE c.user_id = $1
            ORDER BY ci.created_at ASC
        `, [userId]);

        // Return the array of cart items
        res.json({ success: true, items: results.rows });
    } catch (error) {
        console.error("FETCH CART CRASH:", error);
        res.status(500).json({ success: false, message: "Failed to fetch cart" });
    }
});

// Remove items from cart
router.delete('/cart/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        await query('DELETE FROM carts WHERE user_id = $1', [userId]);
        res.json({ success: true, message: "Cart cleared." });
    } catch (error) {
        console.error("Failed to clear the cart:", error);
        res.status(500).json({ success: false });
    }
});

export default router;
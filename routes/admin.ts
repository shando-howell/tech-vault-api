import { Request, Response, Router } from 'express';
import { requireAdminAPI } from '../middleware/requireAdminAPI';
import { query } from '../db';

const router = Router();

// Fetch all products for the dashboard
router.get('/admin/products', async (req: Request, res: Response) => {
    try {
        const result = await query('SELECT * FROM products ORDER BY created_at DESC');
        res.json({ success: true, products: result.rows });
    } catch (error) {
        console.error("FAILED TO FETCH ADMIN PRODUCTS:", error);
        res.status(500).json({ success: false });
    }
});

// Delete a specific product
router.delete('/admin/products/:id', async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        await query('DELETE FROM products WHERE id = $1', [id]);
        res.json({ success: true, message: "Product deleted." });
    } catch (error) {
        console.error("FAILED TO DELETE PRODUCT:", error);
        res.status(500).json({ success: false });
    }
});

// Add a new product
router.post('/admin/products', async (req: Request, res: Response) => {
    const { name, sku, description, price, stock_quantity } = req.body;

    try {
        const result = await query(`
            INSERT INTO products (name, sku, description, price, stock_quantity)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [name, sku, description, price, stock_quantity]);

        res.json({ success: true, product: result.rows[0] });
    } catch (error) {
        console.error("FAILED TO CREATE PRODUCT:", error);
        res.status(500).json({ success: false, message: "Database insert failed." });
    }
});

// Attach the product image url
router.patch('/admin/products/:id/image', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { image_url } = req.body;

    // Log the image URL to confirm that the image upload completes the pipeline 
    // (upload client component --> cloudinary host --> API patch route)
    console.log("IMAGE URL LOG: ", image_url);
    
    const idString = Array.isArray(id) ? id[0] : id;

    if (!idString) {
        return res.status(400).json({ success: false, message: "Product ID is missing" });
    }

    const productId = parseInt(idString, 10);

    if (isNaN(productId)) {
        return res.status(400).json({ success: false, message: "Invalid product ID format."})
    }

    try {
        await query(`UPDATE products SET image_url = $1 WHERE id = $2 RETURNING *`, [image_url, productId]);
        res.json({ success: true });
    } catch (error) {
        console.error("FAILED TO UPDATE IMAGE:", error);
        res.status(500).json({ success: false });
    }
});

// Fetch a single product for the edit form
router.get('/admin/products/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await query('SELECT * FROM products WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }

        res.json({ success: true, product: result.rows[0] });
    } catch (error) {
        console.error("FAILED TO FETCH PRODUCT:", error);
        res.status(500).json({ success: false });
    }
});

// Update an existing product
router.put('/admin/products/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, description, price } = req.body;

    try {
        const result = await query(`
            UPDATE products
            SET name = $1, description = $2, price = $3
            WHERE id = $4
            RETURNING *
        `, [name, description, price, id]);

        res.json({ success: true, product: result.rows[0] });
    } catch (error) {
        console.error("FAILED TO UPDATE PRODUCT:", error);
        res.status(500).json({ success: false, message: "Database update failed." });
    }
});

router.get('/admin/stats', async (req: Request, res: Response) => {
    try {
        // Fire all queries simultaneously for maximun performance
        const [revenueRes, ordersRes, stockRes, recentRes] = await Promise.all([
            // 1. Total Revenue (Adjust 'COMPLETED' if the PayPal status saves differently.)
            query("SELECT SUM(total_amount) AS total_revenue FROM orders WHERE status = 'COMPLETED'"),

            // 2. Total Order Count
            query("SELECT COUNT(*) AS total_orders FROM orders"),

            // 3. Low Stock Alert (Items with less that 5 units)
            query("SELECT COUNT(*) AS low_stock FROM products WHERE stock_quantity < 5"),

            // 4. Recent Orders Table Data
            query("SELECT id, created_at, user_id, status, total_amount FROM orders ORDER BY created_at DESC LIMIT 5")
        ]);

        // Format and send the response
        res.json({
            success: true,
            stats: {
                // SQL SUM() returns a string, so we parse it. Default to 0 if null.
                totalRevenue: parseFloat(revenueRes.rows[0].total_revenue || 0),
                // SQL COUNT() returns a string (bigint), so we parse it.
                totalOrders: parseInt(ordersRes.rows[0].total_orders || 0, 10),
                lowStock: parseInt(stockRes.rows[0].low_stock || 0, 10)
            },
            recentOrders: recentRes.rows
        });
    } catch (error) {
        console.error("Dashboard Stats Error:", error);
        res.status(500).json({ success: false, message: "Failed to load dashboard data." });
    }
});

// GET /api/tickets/:id
router.get('/admin/tickets/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const result = await query(`SELECT * FROM support_tickets WHERE id = $1`, [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "Ticket not found." });
        }

        res.json({
            success: true,
            ticket: result.rows[0]
        });
    } catch (error) {
        console.error("Fetch Single Ticket Error:", error);
        res.status(500).json({success: false, message: "Failed to fetch ticket."});
    }
});

// PATCH /api/admin/tickets/:id/status
router.patch('/admin/tickets/:id/status', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        // Update the status in DB and return the updated row
        const result = await query(`
            UPDATE support_tickets
            SET status = $1
            WHERE id = $2
            RETURNING *;    
        `, [status, id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "Ticket not found." });
        }

        res.json({ success: true, ticket: result.rows[0] });
    } catch (error) {
        console.error("Update Status Error:", error);
        res.status(500).json({ success: false, message: "Failed to update status." });
    }
});

router.get('/admin/tickets', requireAdminAPI, async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string, 10) || 1;
        const limit = parseInt(req.query.limit as string, 10) || 10; // Default to 10 tickets per page
        const offset = (page - 1) * limit;

        // Fetch all tickets, the newest first
        const ticketsResult = await query(`
            SELECT * FROM support_tickets
            ORDER BY created_at DESC
            LIMIT $1 OFFSET $2;
        `, [limit, offset]);

        // Fetch the total count for the pagination math
        const countResult = await query(`SELECT COUNT (*) FROM support_tickets;`);

        const totalItems = parseInt(countResult.rows[0].count, 10);
        const totalPages = Math.ceil(totalItems / limit);
        
        res.json({
            success: true,
            tickets: ticketsResult.rows,
            pagination: {
                currentPage: page,
                totalPages,
                totalItems
            }
        });
    } catch (error) {
        console.error("Fetch Tickets Error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch support tickets." });
    }
});

// POST /api/tickets
router.post('/admin/tickets', async (req: Request, res: Response) => {
    try {
        const{ name, email, subject, message } = req.body;

        // Basic server validation
        if (!name || !email || !subject || !message) {
            return res.status(400).json({ success: false, message: "All fields are required." });
        }

        // Insert into PostgreSQL and return the new row
        const result = await query(`
            INSERT INTO support_tickets (name, email, subject, message)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `, [name, email, subject, message]);

        res.status(201).json({
            success: true,
            message: "Ticket created successfully.",
            ticket: result.rows[0]
        });
    } catch (error) {
        console.error("Create Ticket Error:", error);
        res.status(500).json({ success: false, message: "Failed to submit ticket." });
    }
});

export default router;
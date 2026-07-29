import { Router, Request, Response } from 'express';
import { query } from '../db';
import { Product } from '../types';
import { validate } from '../middleware/validate';
import { productSchema } from '../schemas';

const router = Router();

// GET: Fetch all products
router.get('/products', async (req: Request, res: Response) => {
    try {
        // Grab the page and limit from the URL query (e.g., ?page=2&limit=6)
        // Default to page 1, 6 items per page if not provided
        const page = parseInt(req.query.page as string, 10) || 1;
        const limit = parseInt(req.query.limit as string, 10) || 6;

        // Calculate the offset
        const offset = (page - 1) * limit;

        // Grab the search term from the URL (e.g., ?q=samsung)
        const searchTerm = req.query.q || '';

        // Base queries
        let productsQuery = `SELECT * FROM products`;
        let countQuery = `SELECT COUNT(*) FROM products`;

        // Separate arrays to hold the variables safely to prevent SQL injection
        const productValues = [];
        const countValues = [];

        // If a search term exists, append the WHERE clause dynamically
        if (searchTerm) {
            productsQuery += ` WHERE name ILIKE $1`;
            countQuery += ` WHERE name ILIKE $1`;

            const sqlSearchTerm = `%${searchTerm}%`; 
            productValues.push(sqlSearchTerm);
            countValues.push(sqlSearchTerm);
        }

        // Append the pagination math.
        // If we have a search term, limit and offset become $2 and $3. Otherwise, $1 and $2.
        const limitIndex = searchTerm ? 2 : 1;
        const offsetIndex = searchTerm ? 3 : 2;

        productsQuery += ` ORDER BY id DESC LIMIT $${limitIndex} OFFSET $${offsetIndex};`;
        productValues.push(limit, offset);

        // Execute both queries
        const productsResult = await query(productsQuery, productValues);
        const countResult = await query(countQuery, countValues);

        const totalItems = parseInt(countResult.rows[0].count, 10);
        const totalPages = Math.ceil(totalItems / limit);

        res.json({
            success: true,
            products: productsResult.rows,
            pagination: {currentPage: page, totalPages, totalItems }
        });

        // const result = await query(`
        //     SELECT * FROM products 
        //     ORDER BY created_at DESC
        //     LIMIT $1 OFFSET $2;
        // `, [limit, offset]);

        // // Get the total count of products to cacluate total pages
        // const countQuery = `SELECT COUNT(*) FROM products;`;
        // const countResult = await query(countQuery);
        // const totalItems = parseInt(countResult.rows[0].count, 10);
        // const totalPages = Math.ceil(totalItems / limit);

        // res.json({
        //     success: true,
        //     products: result.rows,
        //     pagination: {
        //         currentPage: page,
        //         totalPages,
        //         totalItems
        //     }
        // });
    } catch (error) {
        console.error('Search/Pagination Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch products.'});
    }
});

// GET: /api/products/latest
router.get('/products/latest', async (req: Request, res: Response) => {
    try {
        const result = await query(`
            SELECT * FROM products
            ORDER BY id DESC
            LIMIT 4;
        `);

        res.json({ success: true, products: result.rows });
    } catch (error) {
        console.error("Database query failed:", error);
        res.status(500).json({ success: false, message: "Failed to fetch latest products." });
    }
});

// GET: Fetch a single product by ID
router.get('/products/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch the product
        const result = await query(
            'SELECT * FROM products WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        res.json({ success: true, product: result.rows[0] });
    } catch (error) {
        console.error('DB error:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' })
    }
});

router.get('/products/:id/images', async (req, res) => {
    try {
        const productId = parseInt(req.params.id, 10);

        if (isNaN(productId)) {
            return res.status(400).json({ message: "Invalid product ID."});
        }

        // Pull every image URL associated with this product
        const result = await query(
            'SELECT image_url FROM products WHERE id = $1',
            [productId]
        );

        // If the product doesn't exist, rows will be empty
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }

        res.json({ success: true, imageUrl: result.rows[0].image_url });
    } catch (error) {
        console.error("FETCH CRASH DETAILS:", error);
        res.status(500).json({ success: false, message: "Failed to fetch image." });
    }
});

// POST: Add a new product
router.post('/', validate(productSchema), async (req: Request, res: Response) => {
    try {
        const { sku, name, description, price, stock_quantity }: Product = req.body;

        const insertQuery = `
            INSERT INTO products (sku, name, description, price, stock_quantity)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *;
        `;

        const values = [sku, name, description, price, stock_quantity || 0];
        const result = await query(insertQuery, values);

        res.status(201).json({
            success: true,
            data: result.rows[0],
        });
    } catch (error: any) {
        console.error('Error inserting product:', error);
        // Handle unique constraint violation for SKU (PostgreSQL error code 23505)
        if (error.code === '23505') {
            return res.status(409).json({ success: false, message: 'Product SKU already exists' });
        }
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

export default router;
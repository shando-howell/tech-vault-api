import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env')});

import express, { Request, Response } from 'express';
import cors from 'cors';
import { clerkMiddleware } from '@clerk/express';

import productRoutes from './routes/products';
import orderRoutes from './routes/orders';
import cartRoutes from './routes/cart';
import adminRoutes from './routes/admin';
import uploadRoutes from './routes/upload';
import webhookRoutes from './routes/webhook';

const app = express();

// CORS configuration
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Mount the webhook first (using raw body parsing)
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

// Middleware (standard JSON)
app.use(express.json());

// Clerk Middlware
app.use(clerkMiddleware());

// Mount the routes
app.use('/api', productRoutes);
app.use('/api', orderRoutes);
app.use('/api', cartRoutes);
app.use('/api', adminRoutes);
app.use('/api', uploadRoutes);

// Health check
app.get('/api/health', (req: Request, res: Response) => {
    res.json({
        status: 'online',
        message: 'Tech Vault API and database pool are operational.'
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
import { Router, Request, Response } from 'express';
import { Webhook } from 'svix';
import { query } from '../db';

const router = Router();

router.post('/clerk', async (req: Request, res: Response) => {
    try {
        const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

        if (!WEBHOOK_SECRET) {
            console.error('Missing CLERK_WEBHOOK_SECRET')
            throw new Error('Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env');
        }

        // Get the headers required by Svix
        const svix_id = req.headers['svix-id'] as string;
        const svix_timestamp = req.headers['svix-timestamp'] as string;
        const svix_signature = req.headers['svix-signature'] as string;
    
        if (!svix_id || !svix_timestamp || !svix_signature) {
            return res.status(400).json({ success: false, message: 'Missing svix headers' });
        }

        // Get the raw body string
        const payload = req.body.toString('utf8');
        const wh = new Webhook(WEBHOOK_SECRET);

        const evt = wh.verify(payload, {
            'svix-id': svix_id,
            'svix-timestamp': svix_timestamp,
            'svix-signature': svix_signature,
        }) as any;

        // Handle the specific event type
        const eventType = evt.type;
        console.log(`Received Clerk webhook event: ${eventType}`);

        if (eventType === 'user.created') {
            const { id, email_addresses } = evt.data;
            const primaryEmail = email_addresses[0]?.email_address;

            await query(
                'INSERT INTO users (clerk_id, email) VALUES ($1, $2)',
                [id, primaryEmail]
            );
            console.log(`Successfully synced new user: ${id}`);
        }

        // Always return a 200 so Clerk knows we received it
        res.status(200).json({ success: true });
    } catch (error: any) {
        console.error('Webhook processing failed safely:', error.message);
        // Returning a 400 stops Clerk from retrying a broken payload infinitely
        return res.status(400).json({ success: false, message: 'Webhook verification or processing failed.'});
    }
});

export default router;

import { getAuth } from '@clerk/express';
import { Request, Response, NextFunction } from 'express';

export const requireAuthAPI = (req: Request, res: Response, next: NextFunction) => {
    // getAuth() automatically extracts the auth state parsed by clerkMiddleware()
    const auth = getAuth(req);

    if (!auth.userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized request.' });
    }

    next();
};
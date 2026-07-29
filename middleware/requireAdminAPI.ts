import { Request, Response, NextFunction } from 'express';

export const requireAdminAPI = async (req: Request & { auth?: any }, res: Response, next: NextFunction) => {
    console.log("BOUNCER CHECK - req.auth exists?", !!req.auth);
    if (req.auth) {
        console.log("BOUNCER CHECK - Token data:", req.auth());
    }
    
    // Check if the auth function exists at all
    if (!req.auth) {
        return res.status(401).json({ success: false, message: 'Auth middleware missing.' });
    }

    // Execute the function to actually parse the token
    const authData = req.auth();
    
    const userRole = authData.sessionClaims?.metadata?.role;

    // Verify the user is logged in
    if (!authData.userId) {
        return res.status(401).json({ success: false, message: 'Invalid or missing token.' });
    }

    if (userRole !== 'admin') {
        return res.status(403).json({ success: false, message: 'Not an admin' });
    }

    next();
};
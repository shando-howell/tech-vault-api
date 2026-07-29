import { Request, Response, NextFunction } from 'express';
import { ZodObject, ZodError } from 'zod';

export const validate = (schema: ZodObject) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Parse the incoming request body against the provided schema
            await schema.parseAsync({
                body: req.body,
                query: req.query,
                params: req.params,
            });
            return next(); // If valid, proceed to the actual route handler
        } catch (error) {
            if (error instanceof ZodError) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed.',
                    error: error.message
                });
            }
            return res.status(400).json({ success: false, message: 'Invalid request data.'});
        }
    };
};
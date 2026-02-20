import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
    const requestId = req.headers['x-request-id'] as string;

    // Zod validation errors
    if (err instanceof ZodError) {
        const messages = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
        logger.warn('Validation error', { requestId, messages });
        return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: messages },
        });
    }

    // Known application errors
    if (err instanceof AppError) {
        logger.warn('App error', { requestId, code: err.code, message: err.message });
        return res.status(err.statusCode).json({
            success: false,
            error: { code: err.code, message: err.message },
        });
    }

    // Prisma unique constraint violation (idempotency key race condition)
    if (typeof err === 'object' && err !== null && (err as any).code === 'P2002') {
        const target = (err as any).meta?.target ?? 'field';
        logger.warn('Unique constraint violation', { requestId, target });
        return res.status(409).json({
            success: false,
            error: { code: 'CONFLICT', message: `Duplicate value for ${target}` },
        });
    }

    // Unexpected errors
    logger.error('Unhandled error', { requestId, err });
    return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
}

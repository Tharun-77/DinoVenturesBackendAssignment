import { NextFunction, Request, Response } from 'express';
import * as WalletService from '../services/wallet.service';
import { ValidationError } from '../utils/errors';
import { BonusSchema, SpendSchema, TopupSchema } from '../utils/validators';

function getIdempotencyKey(req: Request): string {
    const key = req.headers['idempotency-key'] as string | undefined;
    if (!key) throw new ValidationError('Idempotency-Key header is required');
    if (key.length > 128) throw new ValidationError('Idempotency-Key must be ≤ 128 characters');
    return key;
}

export async function getBalance(req: Request, res: Response, next: NextFunction) {
    try {
        const data = await WalletService.getBalances(req.params.userId);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

export async function topup(req: Request, res: Response, next: NextFunction) {
    try {
        const idempotencyKey = getIdempotencyKey(req);
        const input = TopupSchema.parse(req.body);
        const data = await WalletService.topup(input, idempotencyKey);
        const status = data.cached ? 200 : 201;
        res.status(status).json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

export async function bonus(req: Request, res: Response, next: NextFunction) {
    try {
        const idempotencyKey = getIdempotencyKey(req);
        const input = BonusSchema.parse(req.body);
        const data = await WalletService.bonus(input, idempotencyKey);
        const status = data.cached ? 200 : 201;
        res.status(status).json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

export async function spend(req: Request, res: Response, next: NextFunction) {
    try {
        const idempotencyKey = getIdempotencyKey(req);
        const input = SpendSchema.parse(req.body);
        const data = await WalletService.spend(input, idempotencyKey);
        const status = data.cached ? 200 : 201;
        res.status(status).json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

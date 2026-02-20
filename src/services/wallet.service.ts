import { TransactionStatus, TransactionType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import prisma from '../db/prisma';
import {
    applyBalanceDelta,
    createLedgerEntry,
    findByIdempotencyKey,
    findTreasuryWallet,
    findWallet,
    lockWalletsPair,
} from '../repositories/wallet.repository';
import {
    IdempotencyConflictError,
    InsufficientBalanceError,
    NotFoundError,
} from '../utils/errors';
import { logger } from '../utils/logger';
import type { BonusInput, SpendInput, TopupInput } from '../utils/validators';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TransactionResult {
    transactionId: string;
    type: TransactionType;
    status: TransactionStatus;
    amount: string;
    assetId: string;
    userBalance: string;
    idempotencyKey: string;
    createdAt: Date;
    cached: boolean; // true if this was a replayed idempotency response
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDecimal(n: number): Decimal {
    return new Decimal(n);
}

function formatResult(tx: {
    id: string;
    type: TransactionType;
    status: TransactionStatus;
    amount: Decimal;
    assetId: string;
    idempotencyKey: string;
    createdAt: Date;
}, userBalance: Decimal, cached = false): TransactionResult {
    return {
        transactionId: tx.id,
        type: tx.type,
        status: tx.status,
        amount: tx.amount.toFixed(4),
        assetId: tx.assetId,
        userBalance: userBalance.toFixed(4),
        idempotencyKey: tx.idempotencyKey,
        createdAt: tx.createdAt,
        cached,
    };
}

async function getUserWalletOrThrow(userId: string, assetId: string) {
    const wallet = await findWallet(prisma, userId, assetId);
    if (!wallet) throw new NotFoundError(`Wallet for user ${userId} / asset ${assetId}`);
    return wallet;
}

async function getTreasuryWalletOrThrow(assetId: string) {
    const wallet = await findTreasuryWallet(prisma, assetId);
    if (!wallet) throw new NotFoundError(`Treasury wallet for asset ${assetId}`);
    return wallet;
}

// ─── Service Methods ──────────────────────────────────────────────────────────

/**
 * Top-up: user purchases credits. Credits flow Treasury → User.
 */
export async function topup(input: TopupInput, idempotencyKey: string): Promise<TransactionResult> {
    logger.info('topup request', { userId: input.userId, assetId: input.assetId, amount: input.amount, idempotencyKey });

    // Idempotency check BEFORE acquiring any lock
    const existing = await findByIdempotencyKey(prisma, idempotencyKey);
    if (existing) {
        const userWallet = await getUserWalletOrThrow(input.userId, input.assetId);
        return formatResult(existing, userWallet.balance, true);
    }

    const userWallet = await getUserWalletOrThrow(input.userId, input.assetId);
    const treasuryWallet = await getTreasuryWalletOrThrow(input.assetId);

    const result = await prisma.$transaction(async (tx) => {
        // Lock in deterministic order (deadlock prevention)
        const [lockedTreasury, lockedUser] = await lockWalletsPair(
            tx, treasuryWallet.id, userWallet.id
        );

        const amount = toDecimal(input.amount);

        // Debit treasury
        const treasuryBalance = await applyBalanceDelta(tx, lockedTreasury.id, amount.negated());
        // Credit user
        const userBalance = await applyBalanceDelta(tx, lockedUser.id, amount);

        const transaction = await tx.transaction.create({
            data: {
                userId: input.userId,
                type: TransactionType.TOPUP,
                status: TransactionStatus.COMPLETED,
                assetId: input.assetId,
                amount,
                idempotencyKey,
                metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
            },
        });

        // Double-entry ledger
        await createLedgerEntry(tx, lockedTreasury.id, transaction.id, amount.negated(), treasuryBalance);
        await createLedgerEntry(tx, lockedUser.id, transaction.id, amount, userBalance);

        logger.info('topup completed', { transactionId: transaction.id, userBalance });
        return formatResult(transaction, userBalance);
    });

    return result;
}

/**
 * Bonus: system issues free credits to a user. Flow: Treasury → User (same as topup).
 */
export async function bonus(input: BonusInput, idempotencyKey: string): Promise<TransactionResult> {
    logger.info('bonus request', { userId: input.userId, assetId: input.assetId, amount: input.amount, idempotencyKey });

    const existing = await findByIdempotencyKey(prisma, idempotencyKey);
    if (existing) {
        const userWallet = await getUserWalletOrThrow(input.userId, input.assetId);
        return formatResult(existing, userWallet.balance, true);
    }

    const userWallet = await getUserWalletOrThrow(input.userId, input.assetId);
    const treasuryWallet = await getTreasuryWalletOrThrow(input.assetId);

    const result = await prisma.$transaction(async (tx) => {
        const [lockedTreasury, lockedUser] = await lockWalletsPair(
            tx, treasuryWallet.id, userWallet.id
        );

        const amount = toDecimal(input.amount);

        const treasuryBalance = await applyBalanceDelta(tx, lockedTreasury.id, amount.negated());
        const userBalance = await applyBalanceDelta(tx, lockedUser.id, amount);

        const transaction = await tx.transaction.create({
            data: {
                userId: input.userId,
                type: TransactionType.BONUS,
                status: TransactionStatus.COMPLETED,
                assetId: input.assetId,
                amount,
                idempotencyKey,
                metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
            },
        });

        await createLedgerEntry(tx, lockedTreasury.id, transaction.id, amount.negated(), treasuryBalance);
        await createLedgerEntry(tx, lockedUser.id, transaction.id, amount, userBalance);

        logger.info('bonus completed', { transactionId: transaction.id, userBalance });
        return formatResult(transaction, userBalance);
    });

    return result;
}

/**
 * Spend: user spends credits to purchase a service. Flow: User → Treasury.
 */
export async function spend(input: SpendInput, idempotencyKey: string): Promise<TransactionResult> {
    logger.info('spend request', { userId: input.userId, assetId: input.assetId, amount: input.amount, idempotencyKey });

    const existing = await findByIdempotencyKey(prisma, idempotencyKey);
    if (existing) {
        const userWallet = await getUserWalletOrThrow(input.userId, input.assetId);
        return formatResult(existing, userWallet.balance, true);
    }

    const userWallet = await getUserWalletOrThrow(input.userId, input.assetId);
    const treasuryWallet = await getTreasuryWalletOrThrow(input.assetId);

    const result = await prisma.$transaction(async (tx) => {
        const [lockedTreasury, lockedUser] = await lockWalletsPair(
            tx, treasuryWallet.id, userWallet.id
        );

        const amount = toDecimal(input.amount);

        // Balance check AFTER acquiring lock (prevents race conditions)
        if (lockedUser.balance.lessThan(amount)) {
            throw new InsufficientBalanceError(
                lockedUser.balance.toFixed(4),
                amount.toFixed(4)
            );
        }

        const userBalance = await applyBalanceDelta(tx, lockedUser.id, amount.negated());
        const treasuryBalance = await applyBalanceDelta(tx, lockedTreasury.id, amount);

        const transaction = await tx.transaction.create({
            data: {
                userId: input.userId,
                type: TransactionType.SPEND,
                status: TransactionStatus.COMPLETED,
                assetId: input.assetId,
                amount,
                idempotencyKey,
                metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
            },
        });

        await createLedgerEntry(tx, lockedUser.id, transaction.id, amount.negated(), userBalance);
        await createLedgerEntry(tx, lockedTreasury.id, transaction.id, amount, treasuryBalance);

        logger.info('spend completed', { transactionId: transaction.id, userBalance });
        return formatResult(transaction, userBalance);
    });

    return result;
}

/**
 * Get all wallets (with balance) for a user.
 */
export async function getBalances(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User', userId);

    const wallets = await prisma.wallet.findMany({
        where: { userId },
        include: { asset: true },
        orderBy: { asset: { symbol: 'asc' } },
    });

    return {
        userId,
        userName: user.name,
        wallets: wallets.map((w) => ({
            walletId: w.id,
            assetId: w.assetId,
            assetName: w.asset.name,
            assetSymbol: w.asset.symbol,
            balance: w.balance.toFixed(4),
        })),
    };
}

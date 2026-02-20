import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export type TxClient = Omit<
    PrismaClient,
    '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export interface LockedWallet {
    id: string;
    balance: Decimal;
    userId: string;
    assetId: string;
}

export async function lockWalletsPair(
    tx: TxClient,
    walletId1: string,
    walletId2: string
): Promise<[LockedWallet, LockedWallet]> {
    const [firstId, secondId] =
        walletId1 < walletId2 ? [walletId1, walletId2] : [walletId2, walletId1];

    const rows = await tx.$queryRaw<LockedWallet[]>`
        SELECT id, balance, user_id AS "userId", asset_id AS "assetId"
        FROM wallets
        WHERE id IN (${firstId}, ${secondId})
        ORDER BY id ASC
        FOR UPDATE
    `;

    const map = new Map(rows.map((r) => [r.id, r]));
    return [map.get(walletId1)!, map.get(walletId2)!];
}

export async function lockWallet(tx: TxClient, walletId: string): Promise<LockedWallet> {
    const rows = await tx.$queryRaw<LockedWallet[]>`
        SELECT id, balance, user_id AS "userId", asset_id AS "assetId"
        FROM wallets
        WHERE id = ${walletId}
        FOR UPDATE
    `;
    if (!rows.length) throw new Error(`Wallet ${walletId} not found`);
    return rows[0];
}

export async function applyBalanceDelta(
    tx: TxClient,
    walletId: string,
    delta: Decimal
): Promise<Decimal> {
    const updated = await tx.$queryRaw<{ balance: Decimal }[]>`
        UPDATE wallets
        SET balance = balance + ${delta}, updated_at = NOW()
        WHERE id = ${walletId}
        RETURNING balance
    `;
    return updated[0].balance;
}

export async function createLedgerEntry(
    tx: TxClient,
    walletId: string,
    transactionId: string,
    amount: Decimal,
    balanceAfter: Decimal
) {
    await tx.ledgerEntry.create({
        data: { walletId, transactionId, amount, balanceAfter },
    });
}

export async function findWallet(prisma: TxClient, userId: string, assetId: string) {
    return prisma.wallet.findUnique({ where: { userId_assetId: { userId, assetId } } });
}

export async function findTreasuryWallet(prisma: TxClient, assetId: string) {
    const treasury = await prisma.user.findFirst({ where: { isSystem: true } });
    if (!treasury) throw new Error('Treasury user not found');
    return findWallet(prisma, treasury.id, assetId);
}

export async function findByIdempotencyKey(prisma: TxClient, key: string) {
    return prisma.transaction.findUnique({ where: { idempotencyKey: key } });
}

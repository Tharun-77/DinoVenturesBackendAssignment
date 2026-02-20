import 'dotenv/config';
import app from './app';
import prisma from './db/prisma';
import { logger } from './utils/logger';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

async function main() {
    // Verify database connection
    await prisma.$connect();
    logger.info('Database connected');

    const server = app.listen(PORT, () => {
        logger.info(`Wallet service running on http://localhost:${PORT}`);
        logger.info(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
        logger.info(`Received ${signal}, shutting down...`);
        server.close(async () => {
            await prisma.$disconnect();
            logger.info('Database disconnected. Goodbye.');
            process.exit(0);
        });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
    logger.error('Failed to start server', { err });
    process.exit(1);
});

import { Router } from 'express';
import * as WalletController from '../controllers/wallet.controller';

const router = Router();

// GET /wallets/:userId  — fetch all wallet balances for a user
router.get('/:userId', WalletController.getBalance);

export default router;

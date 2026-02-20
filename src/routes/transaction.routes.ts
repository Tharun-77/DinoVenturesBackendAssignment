import { Router } from 'express';
import * as WalletController from '../controllers/wallet.controller';

const router = Router();

// POST /transactions/topup
router.post('/topup', WalletController.topup);

// POST /transactions/bonus
router.post('/bonus', WalletController.bonus);

// POST /transactions/spend
router.post('/spend', WalletController.spend);

export default router;

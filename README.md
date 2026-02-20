# 💰 Production-Grade Internal Wallet Service

> A **transaction-safe, concurrency-proof** virtual wallet backend built with financial system principles — ACID compliance, double-entry ledger, idempotency, and deadlock prevention — designed for high-traffic gaming and loyalty platforms.

---

## 📌 Table of Contents

- [Overview](#-overview)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Core Features](#-core-features)
- [Database Design](#-database-design)
- [API Endpoints](#-api-endpoints)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Engineering Highlights](#-engineering-highlights)

---

## 🚀 Overview

This service powers a **closed-loop internal currency system** (Gold Coins, Diamonds, etc.) for gaming and loyalty platforms. Despite being virtual currency, the architecture mirrors real-world financial systems — every design decision prioritizes data integrity, correctness under load, and full auditability.

**The system guarantees:**

- ✅ ACID-compliant transactions (no partial writes, ever)
- ✅ Concurrency safety under simultaneous high-load requests
- ✅ Idempotent operations (safe network retries, no double-spends)
- ✅ Full audit trail via double-entry ledger
- ✅ Zero negative balance — enforced at the database level

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express |
| Database | PostgreSQL (ACID-compliant) |
| Containerization | Docker & Docker Compose |
| ID Strategy | UUID (collision-safe, distributed-ready) |

---

## 🏗 Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │  HTTP
┌──────▼──────────────────────┐
│     REST API (Express)       │
│  Controller → Service →      │
│  Repository                  │
└──────┬──────────────────────┘
       │
┌──────▼──────┐
│  PostgreSQL  │
│  (ACID DB)   │
└──────┬──────┘
       │
┌──────▼──────────────────────┐
│     Double-Entry Ledger      │
│  (Every tx = debit + credit) │
└─────────────────────────────┘
```

The service follows a strict **3-layer architecture**:

- **Controller** — handles HTTP request/response, input validation
- **Service** — orchestrates business logic and transaction boundaries
- **Repository** — owns all SQL and database interaction

---

## 🔑 Core Features

### 1️⃣ Wallet Operations

| Operation | Description |
|---|---|
| `TOP_UP` | Purchase credits (User ← Treasury) |
| `BONUS` | Incentive/reward credit |
| `SPEND` | Deduct credits for in-app purchases |
| `BALANCE` | Real-time balance via ledger sum |

### 2️⃣ Double-Entry Ledger

Every transaction generates **two ledger entries** — a debit and a credit — mirroring real accounting standards.

```
Top-up of 100 Gold Coins:

  Treasury Wallet   →  DEBIT  100
  User Wallet       →  CREDIT 100
```

> Balance is never stored directly. It's always computed as `SUM(ledger_entries)` — making it impossible for balances to silently drift or corrupt.

### 3️⃣ ACID Transactions

Every wallet operation is wrapped in a full database transaction:

```sql
BEGIN;
  SELECT ... FOR UPDATE;   -- Row-level lock
  -- Validate balance
  INSERT INTO transactions ...;
  INSERT INTO ledger_entries ...;
COMMIT;

-- On any failure:
ROLLBACK;
```

### 4️⃣ Concurrency Control & Deadlock Prevention

Race conditions are prevented through:

- `SELECT ... FOR UPDATE` — row-level locking per wallet
- **Consistent lock ordering** (Treasury → User, always) to eliminate deadlocks
- Validated under concurrent stress: simultaneous spend requests are serialized safely, with no negative balances possible

### 5️⃣ Idempotency

Every mutating request accepts an `Idempotency-Key` header. The system:

1. Checks if the key was already processed
2. Returns the original response if yes (no re-execution)
3. Stores the result on first execution with a unique DB constraint

This eliminates duplicate credits, double-spends, and network-retry bugs.

```http
POST /wallet/topup
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

### 6️⃣ Treasury / System Accounts

All currency flows through a **Treasury wallet** — acting as the canonical source and sink for all credits. This creates a closed-loop system with a complete, reconcilable audit trail.

```
Credit flow:   Treasury ──► User
Spend flow:    User ──► Treasury
```

---

## 🗄 Database Design

```
┌──────────┐     ┌──────────┐     ┌────────────────┐
│  users   │────►│ wallets  │────►│ ledger_entries │
└──────────┘     └──────────┘     └────────────────┘
                      │
               ┌──────▼──────┐
               │ transactions│
               └─────────────┘
                      │
               ┌──────▼──────┐
               │   assets    │
               │ (Gold/Diam.)│
               └─────────────┘
```

| Table | Purpose |
|---|---|
| `users` | User accounts |
| `assets` | Currency types (Gold Coins, Diamonds, etc.) |
| `wallets` | One wallet per user per asset |
| `transactions` | Idempotency record + metadata per operation |
| `ledger_entries` | Immutable double-entry rows; source of truth for balances |

---

## 📡 API Endpoints

```
POST   /wallet/topup           Top up a user's wallet
POST   /wallet/bonus           Credit a bonus/incentive
POST   /wallet/spend           Deduct credits
GET    /wallet/:userId/balance  Get real-time balance
```

All write endpoints require an `Idempotency-Key` header.

---

## 🐳 Getting Started

### Prerequisites

- [Docker](https://www.docker.com/) & Docker Compose installed

### One-Command Startup

```bash
# Clone the repository
git clone https://github.com/your-username/wallet-service.git
cd wallet-service

# Start everything (API + PostgreSQL)
docker-compose up --build

# Seed initial data (Treasury accounts, asset types)
docker-compose exec app npm run seed
```

The API will be available at `http://localhost:3000`.

### Running Locally (without Docker)

```bash
npm install
cp .env.example .env   # Fill in your DB credentials
npm run migrate
npm run seed
npm start
```

---

## 🔧 Environment Variables

```env
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/wallet_db
TREASURY_USER_ID=<uuid-of-treasury-account>
NODE_ENV=development
```

---

## 🧠 Engineering Highlights

This project was built to demonstrate **production-grade backend engineering maturity**:

| Concept | Implementation |
|---|---|
| Financial system design | Double-entry ledger, Treasury model |
| ACID mastery | BEGIN/COMMIT/ROLLBACK with explicit locking |
| Concurrency safety | `SELECT FOR UPDATE` + consistent lock ordering |
| Deadlock prevention | Enforced lock acquisition order (Treasury → User) |
| Idempotency | Header-based deduplication with unique constraint |
| Clean architecture | Controller → Service → Repository separation |
| DevOps readiness | Fully Dockerized, seed scripts, env config |
| Auditability | Immutable ledger; every state change is traceable |

### Comparable Real-World Systems

The patterns used here are the same patterns found in:

- 💳 Payment gateways (Stripe, Adyen)
- 🏦 Banking ledger backends
- 🎮 Gaming credit platforms
- 🎁 Loyalty & rewards engines

---

## 📁 Project Structure

```
wallet-service/
├── src/
│   ├── controllers/     # HTTP layer
│   ├── services/        # Business logic & transaction orchestration
│   ├── repositories/    # SQL queries & DB access
│   ├── middleware/       # Idempotency, error handling
│   └── routes/          # Express route definitions
├── migrations/          # DB schema migrations
├── seeds/               # Initial data (Treasury, asset types)
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

---

## 📄 License

MIT © 2025
# 💰 Production-Grade Internal Wallet Service

> A **transaction-safe, concurrency-proof** virtual wallet backend built with financial system principles — ACID compliance, double-entry ledger, idempotency, and deadlock prevention — designed for high-traffic gaming and loyalty platforms.

---

## 📌 Table of Contents

- [Overview](#-overview)
- [Tech Stack & Why](#-tech-stack--why)
- [Architecture](#-architecture)
- [Core Features](#-core-features)
- [Concurrency Strategy](#-concurrency-strategy)
- [Database Design](#-database-design)
- [API Endpoints](#-api-endpoints)
- [Database Setup & Seeding](#-database-setup--seeding)
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

## 🛠 Tech Stack & Why

Every technology choice was deliberate — not convenience, but fitness for a financial-grade system.

| Layer | Technology | Why |
|---|---|---|
| Runtime | **Node.js** | Non-blocking I/O handles high-concurrency wallet requests efficiently; large ecosystem for financial tooling |
| Framework | **Express** | Minimal and unopinionated — full control over middleware, error handling, and transaction flow without magic |
| ORM | **Prisma** | Type-safe database access, clean migration management, and excellent PostgreSQL support; reduces raw SQL errors in critical paths |
| Database | **PostgreSQL** | True ACID transactions, row-level locking (`SELECT FOR UPDATE`), serializable isolation, and battle-tested reliability at scale |
| Containerization | **Docker & Docker Compose** | Eliminates environment drift; one-command startup ensures reviewer, CI, and production all run identically |
| ID Strategy | **UUID v4** | Collision-safe, non-sequential (no enumeration attacks), distributed-ready without a central ID authority |

### Why PostgreSQL over alternatives?

This was not a default choice. The decision matrix:

- **MongoDB** — rejected. Document stores lack true multi-document ACID transactions, making double-entry ledger writes unsafe under failure.
- **MySQL** — viable, but PostgreSQL's `SELECT FOR UPDATE`, richer isolation modes, and advisory locks make it the superior choice for financial workloads.
- **Redis** — considered as a cache layer only. Persistence guarantees are insufficient for monetary source-of-truth data.

> PostgreSQL's row-level locking is the cornerstone of this system's correctness.

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

See the dedicated [Concurrency Strategy](#-concurrency-strategy) section below for a full breakdown.

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

## ⚙️ Concurrency Strategy

Concurrency is the hardest problem in any financial system. A naive implementation that simply reads a balance, checks it, then updates it will fail under simultaneous requests — producing negative balances, double-spends, or corrupted state. This service addresses every layer of the problem.

### The Problem: Read-Modify-Write Race

```
Thread A: READ balance = 100  ─┐
Thread B: READ balance = 100   │  ← Both see 100
Thread A: SPEND 100 → write 0  │
Thread B: SPEND 100 → write 0  │  ← Both succeed. Balance should be -100.
```

Without locking, both threads pass the balance check and commit — resulting in a negative balance.

### Solution 1: `SELECT ... FOR UPDATE` (Pessimistic Locking)

Before any wallet mutation, the service acquires an **exclusive row-level lock** on the wallet record:

```sql
BEGIN;
  SELECT * FROM wallets
  WHERE id = $walletId
  FOR UPDATE;              -- All other transactions must wait here

  -- Safe to read, validate, and write
  UPDATE wallets SET balance = balance - $amount WHERE id = $walletId;
COMMIT;
```

`FOR UPDATE` causes any concurrent transaction that tries to lock the same wallet to **block and wait** — not fail silently. Once the first transaction commits or rolls back, the next one proceeds with the freshly committed balance. This turns a race condition into a serialized queue.

### Solution 2: Consistent Lock Ordering (Deadlock Prevention)

When a single operation touches **two wallets** (e.g. a top-up moves funds from Treasury → User), naive locking can deadlock:

```
Thread A locks Treasury, waits for User  ─┐
Thread B locks User, waits for Treasury   │ ← Deadlock
```

The fix is a **deterministic lock acquisition order**: wallets are always locked by their UUID, sorted ascending. Since UUIDs are fixed, Treasury and User are always locked in the same order regardless of which thread gets there first — making a circular wait impossible.

```typescript
// Always sort wallet IDs before locking — deadlock impossible
const walletsToLock = [treasuryWalletId, userWalletId].sort();
for (const walletId of walletsToLock) {
  await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${walletId} FOR UPDATE`;
}
```

### Solution 3: Database-Level Balance Constraint

As a final safety net, a `CHECK` constraint ensures balance can never go negative at the database level — even if application logic has a bug:

```sql
ALTER TABLE wallets ADD CONSTRAINT balance_non_negative CHECK (balance >= 0);
```

### Solution 4: Idempotency as Concurrency Protection

Rapid retries from clients (network timeouts, mobile reconnects) are another form of concurrency risk. The `idempotency_key` unique constraint on the `transactions` table guarantees that even if the same request hits the server twice simultaneously, only one will succeed — the second will hit a unique constraint violation and return the original result.

### What Was Tested

- Simultaneous `SPEND` requests from multiple clients on the same wallet — no negative balances observed
- Concurrent `TOP_UP` + `SPEND` — correct final balances in all cases
- Duplicate requests with the same `Idempotency-Key` — exactly one transaction created

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

## 🐳 Database Setup & Seeding

### Prerequisites

- [Docker](https://www.docker.com/) & Docker Compose
- Node.js 18+ (for local setup without Docker)

---

### Option A: Docker (Recommended)

The entire stack — API, PostgreSQL, migrations, and seed — runs with two commands.

```bash
# 1. Clone and configure
git clone https://github.com/Tharun-77/DinoVenturesBackendAssignment.git
cd wallet-service
cp .env.example .env          # Edit DATABASE_URL if needed

# 2. Start PostgreSQL + API
docker-compose up --build -d

# 3. Run Prisma migrations (creates all tables + indexes)
docker-compose exec app npx prisma migrate deploy

# 4. Seed the database
docker-compose exec app npm run seed
```

The seed script creates:
- System asset types: `GOLD_COINS`, `DIAMONDS`
- A Treasury system user (`isSystem: true`) with a wallet per asset
- Sample regular users with wallets, ready for transactions

The API is available at `http://localhost:3000`.

---

### Option B: Local (Without Docker)

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Set DATABASE_URL to your local PostgreSQL instance

# 3. Run migrations — creates all tables, constraints, and indexes
npx prisma migrate dev

# 4. (Optional) Open Prisma Studio to inspect the DB visually
npx prisma studio

# 5. Seed the database
npm run seed

# 6. Start the server
npm run dev
```

---

### What the Seed Script Does

```
Seed sequence:
  1. Create assets        → GOLD_COINS, DIAMONDS
  2. Create Treasury user → isSystem: true
  3. Create Treasury wallets (one per asset, pre-funded)
  4. Create sample users  → alice@example.com, bob@example.com
  5. Create user wallets  → zero balance, ready for top-up
```

To reset and re-seed from scratch:

```bash
# Docker
docker-compose exec app npx prisma migrate reset --force

# Local
npx prisma migrate reset --force
```

> ⚠️ `migrate reset` drops and recreates the entire database. Never run in production.

---

### Verifying Setup

```bash
# Check all tables exist
docker-compose exec db psql -U postgres -d wallet_db -c "\dt"

# Confirm Treasury wallet exists
docker-compose exec db psql -U postgres -d wallet_db \
  -c "SELECT u.name, a.symbol, w.balance FROM wallets w JOIN users u ON u.id = w.user_id JOIN assets a ON a.id = w.asset_id;"
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

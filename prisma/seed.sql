CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ASSETS

INSERT INTO assets (id, name, symbol, created_at)
VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'Gold Coins', 'GOLD',    NOW()),
  ('550e8400-e29b-41d4-a716-446655440002', 'Diamonds',   'DIAMOND', NOW())
ON CONFLICT (symbol) DO NOTHING;

-- 2. USERS

-- Treasury
INSERT INTO users (id, name, email, is_system, created_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'Treasury',
  'treasury@system.internal',
  true,
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- Regular users
INSERT INTO users (id, name, email, is_system, created_at)
VALUES
  ('550e8400-e29b-41d4-a716-446655440010', 'Alice', 'alice@example.com', false, NOW()),
  ('550e8400-e29b-41d4-a716-446655440011', 'Bob',   'bob@example.com',   false, NOW())
ON CONFLICT (email) DO NOTHING;

-- 3. WALLETS

INSERT INTO wallets (id, user_id, asset_id, balance, created_at, updated_at)
SELECT
  gen_random_uuid(),
  u.id,
  a.id,
  CASE WHEN u.is_system THEN 1000000 ELSE 0 END,
  NOW(),
  NOW()
FROM users u, assets a
ON CONFLICT (user_id, asset_id) DO NOTHING;

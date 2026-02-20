CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO assets (id, name, symbol, created_at)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Gold Coins', 'GOLD',    NOW()),
  ('a2000000-0000-0000-0000-000000000002', 'Diamonds',   'DIAMOND', NOW())
ON CONFLICT (symbol) DO NOTHING;

-- Treasury (system account — source of all currency)
INSERT INTO users (id, name, email, is_system, created_at)
VALUES (
  'u0000000-0000-0000-0000-000000000000',
  'Treasury',
  'treasury@system.internal',
  true,
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- Regular users
INSERT INTO users (id, name, email, is_system, created_at)
VALUES
  ('u1000000-0000-0000-0000-000000000001', 'Alice', 'alice@example.com', false, NOW()),
  ('u2000000-0000-0000-0000-000000000002', 'Bob',   'bob@example.com',   false, NOW())
ON CONFLICT (email) DO NOTHING;

INSERT INTO wallets (id, user_id, asset_id, balance, created_at, updated_at)
SELECT
  gen_random_uuid(),
  u.id,
  a.id,
  CASE WHEN u.is_system THEN 1000000 ELSE 0 END,  -- Treasury starts funded
  NOW(),
  NOW()
FROM users u, assets a
ON CONFLICT (user_id, asset_id) DO NOTHING;

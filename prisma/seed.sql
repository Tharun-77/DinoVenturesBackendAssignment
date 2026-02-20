-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO assets (id, name, "createdAt")
VALUES
  (gen_random_uuid(), 'Gold Coins', NOW()),
  (gen_random_uuid(), 'Diamonds', NOW())
ON CONFLICT (name) DO NOTHING;


INSERT INTO users (id, email, "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'treasury@system.com', NOW(), NOW())
ON CONFLICT (email) DO NOTHING;


INSERT INTO users (id, email, "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'user1@example.com', NOW(), NOW()),
  (gen_random_uuid(), 'user2@example.com', NOW(), NOW())
ON CONFLICT (email) DO NOTHING;

-- Gold Coins wallets
INSERT INTO wallets (id, "userId", "assetId", balance, "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  u.id,
  a.id,
  1000,
  NOW(),
  NOW()
FROM users u
JOIN assets a ON a.name = 'Gold Coins'
WHERE u.email IN ('treasury@system.com', 'user1@example.com', 'user2@example.com')
ON CONFLICT DO NOTHING;


-- Diamonds wallets
INSERT INTO wallets (id, "userId", "assetId", balance, "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  u.id,
  a.id,
  500,
  NOW(),
  NOW()
FROM users u
JOIN assets a ON a.name = 'Diamonds'
WHERE u.email IN ('treasury@system.com', 'user1@example.com', 'user2@example.com')
ON CONFLICT DO NOTHING;

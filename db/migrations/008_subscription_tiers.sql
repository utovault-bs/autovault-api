CREATE TABLE IF NOT EXISTS subscription_tiers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  slug VARCHAR(30) UNIQUE NOT NULL,
  listings_limit INTEGER NOT NULL,
  price_monthly_cents INTEGER NOT NULL DEFAULT 0,
  stripe_price_id VARCHAR(100)
);

INSERT INTO subscription_tiers (name, slug, listings_limit, price_monthly_cents, stripe_price_id) VALUES
  ('Free', 'free', 1, 0, NULL),
  ('Starter', 'starter', 5, 4900, NULL),
  ('Pro', 'pro', 25, 9900, NULL),
  ('Enterprise', 'enterprise', 100, 29900, NULL)
ON CONFLICT (slug) DO NOTHING;

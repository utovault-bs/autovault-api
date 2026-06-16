CREATE TABLE IF NOT EXISTS plates (
  id SERIAL PRIMARY KEY,
  seller_id INTEGER REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  plate_text VARCHAR(50) NOT NULL,
  jurisdiction VARCHAR(100) NOT NULL,
  type VARCHAR(50) DEFAULT 'vanity',
  condition VARCHAR(50) DEFAULT 'Used',
  price DECIMAL(10,2) NOT NULL,
  description TEXT,
  transferable BOOLEAN DEFAULT true,
  status VARCHAR(50) DEFAULT 'available',
  views_count INTEGER DEFAULT 0,
  buyer_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plate_images (
  id SERIAL PRIMARY KEY,
  plate_id INTEGER REFERENCES plates(id) ON DELETE CASCADE,
  url VARCHAR(500) NOT NULL,
  public_id VARCHAR(255),
  position INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS plate_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS plate_category_mappings (
  plate_id INTEGER REFERENCES plates(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES plate_categories(id),
  PRIMARY KEY (plate_id, category_id)
);

CREATE TABLE IF NOT EXISTS plate_watchers (
  user_id INTEGER REFERENCES users(id),
  plate_id INTEGER REFERENCES plates(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, plate_id)
);

CREATE TABLE IF NOT EXISTS plate_offers (
  id SERIAL PRIMARY KEY,
  plate_id INTEGER REFERENCES plates(id),
  buyer_id INTEGER REFERENCES users(id),
  amount DECIMAL(10,2) NOT NULL,
  message TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO plate_categories (name, slug) VALUES
  ('Vanity', 'vanity'),
  ('Personalized', 'personalized'),
  ('Vintage', 'vintage'),
  ('Sequential', 'sequential'),
  ('Dealer', 'dealer'),
  ('Specialty', 'specialty'),
  ('Low Digit', 'low-digit'),
  ('Motorcycle', 'motorcycle')
ON CONFLICT (slug) DO NOTHING;

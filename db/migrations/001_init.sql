CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL, role VARCHAR(50) DEFAULT 'user', avatar VARCHAR(500),
  active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cars (
  id SERIAL PRIMARY KEY, seller_id INTEGER REFERENCES users(id), make VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL, year INTEGER NOT NULL, trim VARCHAR(100),
  price DECIMAL(10,2) NOT NULL, original_price DECIMAL(10,2), mileage INTEGER,
  transmission VARCHAR(50), fuel_type VARCHAR(50), engine VARCHAR(100),
  exterior_color VARCHAR(50), interior_color VARCHAR(50), vin VARCHAR(50),
  condition VARCHAR(50) DEFAULT 'Used', description TEXT, status VARCHAR(50) DEFAULT 'available',
  buyer_id INTEGER REFERENCES users(id), views_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS car_images (
  id SERIAL PRIMARY KEY, car_id INTEGER REFERENCES cars(id) ON DELETE CASCADE,
  url VARCHAR(500) NOT NULL, public_id VARCHAR(255), position INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY, car_id INTEGER REFERENCES cars(id), created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id INTEGER REFERENCES conversations(id), user_id INTEGER REFERENCES users(id),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY, conversation_id INTEGER REFERENCES conversations(id),
  sender_id INTEGER REFERENCES users(id), content TEXT NOT NULL, read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY, car_id INTEGER REFERENCES cars(id), buyer_id INTEGER REFERENCES users(id),
  seller_id INTEGER REFERENCES users(id), amount INTEGER NOT NULL, payment_intent_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending', created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cars_status ON cars(status);
CREATE INDEX idx_cars_make ON cars(make);
CREATE INDEX idx_cars_price ON cars(price);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);

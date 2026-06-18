require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const app = express();
app.set('trust proxy', 1);

// Security
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:4173',
  'https://autovault-three.vercel.app',
  'https://autovault-web.vercel.app'
].filter(Boolean);
app.use(cors({
  origin: (origin, cb) => { cb(null, !origin || allowedOrigins.includes(origin)); },
  credentials: true
}));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('combined'));

// Database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000
});
app.use((req, res, next) => { req.db = pool; next(); });

// Auto-run migrations on startup
const migrate = async () => {
  try {
    const sql1 = require('fs').readFileSync(require('path').join(__dirname, 'db', 'migrations', '001_init.sql'), 'utf8');
    await pool.query(sql1);
    console.log('Migration 001 complete');
  } catch (err) {
    if (err.code !== '42P07') console.error('Migration 001 warning:', err.message);
  }
  try {
    const sql2 = require('fs').readFileSync(require('path').join(__dirname, 'db', 'migrations', '002_plates.sql'), 'utf8');
    await pool.query(sql2);
    console.log('Migration 002 (plates) complete');
  } catch (err) {
    if (err.code !== '42P07') console.error('Migration 002 warning:', err.message);
  }
  try {
    const sql3 = require('fs').readFileSync(require('path').join(__dirname, 'db', 'migrations', '003_body_style.sql'), 'utf8');
    await pool.query(sql3);
    console.log('Migration 003 (body_style) complete');
  } catch (err) {
    console.error('Migration 003 warning:', err.message);
  }
  try {
    const sql4 = require('fs').readFileSync(require('path').join(__dirname, 'db', 'migrations', '004_admin.sql'), 'utf8');
    await pool.query(sql4);
    console.log('Migration 004 (admin) complete');
  } catch (err) {
    console.error('Migration 004 warning:', err.message);
  }
  try {
    const sql5 = require('fs').readFileSync(require('path').join(__dirname, 'db', 'migrations', '005_deal_rating.sql'), 'utf8');
    await pool.query(sql5);
    console.log('Migration 005 (deal_rating) complete');
  } catch (err) {
    console.error('Migration 005 warning:', err.message);
  }
  try {
    const sql6 = require('fs').readFileSync(require('path').join(__dirname, 'db', 'migrations', '006_car_models.sql'), 'utf8');
    await pool.query(sql6);
    console.log('Migration 006 (car_models) complete');
  } catch (err) {
    console.error('Migration 006 warning:', err.message);
  }
  try {
    const sql7 = require('fs').readFileSync(require('path').join(__dirname, 'db', 'migrations', '007_car_location.sql'), 'utf8');
    await pool.query(sql7);
    console.log('Migration 007 (car_location) complete');
  } catch (err) {
    console.error('Migration 007 warning:', err.message);
  }
  // Seed price drops for demo cars (runs once, idempotent)
  try {
    await pool.query(`UPDATE cars SET previous_price = 35000, price_dropped_at = NOW() - INTERVAL '7 days' WHERE id = 1 AND previous_price IS NULL`);
    await pool.query(`UPDATE cars SET previous_price = 55000, price_dropped_at = NOW() - INTERVAL '14 days' WHERE id = 2 AND previous_price IS NULL`);
    await pool.query(`UPDATE cars SET previous_price = 130000, price_dropped_at = NOW() - INTERVAL '3 days' WHERE id = 3 AND previous_price IS NULL`);
    await pool.query(`UPDATE cars SET previous_price = 48000, price_dropped_at = NOW() - INTERVAL '10 days' WHERE id = 8 AND previous_price IS NULL`);
    await pool.query(`UPDATE cars SET previous_price = 7000, price_dropped_at = NOW() - INTERVAL '5 days' WHERE id = 12 AND previous_price IS NULL`);
    console.log('Price drops seeded for demo cars');
  } catch (err) {
    console.error('Price drop seed warning:', err.message);
  }
};
migrate();

// Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// JWT middleware
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ message: 'Invalid token' }); }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin required' });
  next();
};

// ==================== ROUTES ====================

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Auth
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  try {
    const result = await req.db.query('INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id, email, name, role', [email, hashed, name]);
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (err) {
    if (err.code === '23505') res.status(400).json({ message: 'Email exists' });
    else res.status(500).json({ message: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const result = await req.db.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = result.rows[0];
  if (!user || !await bcrypt.compare(password, user.password)) return res.status(401).json({ message: 'Invalid credentials' });
  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  const result = await req.db.query('SELECT id, email, name, role, avatar FROM users WHERE id = $1', [req.user.id]);
  res.json({ user: result.rows[0] });
});

// Cars
app.get('/api/cars', async (req, res) => {
  try {
    const { search, make, model, minYear, maxYear, minPrice, maxPrice, maxMileage, color, condition, transmission, fuel_type, fuelType, body_style, lat, lng, radius, seller_id, sortBy = 'newest', page = 1, limit = 12 } = req.query;
    let where = ['c.status = $1']; let params = ['available']; let pc = 1;
    if (search) { where.push(`(c.make ILIKE $${++pc} OR c.model ILIKE $${pc} OR c.description ILIKE $${pc})`); params.push(`%${search}%`); }
    if (make) { where.push(`c.make = $${++pc}`); params.push(make); }
    if (model) { where.push(`c.model = $${++pc}`); params.push(model); }
    if (minYear) { where.push(`c.year >= $${++pc}`); params.push(minYear); }
    if (maxYear) { where.push(`c.year <= $${++pc}`); params.push(maxYear); }
    if (minPrice) { where.push(`c.price >= $${++pc}`); params.push(minPrice); }
    if (maxPrice) { where.push(`c.price <= $${++pc}`); params.push(maxPrice); }
    if (maxMileage) { where.push(`c.mileage <= $${++pc}`); params.push(maxMileage); }
    if (color) { where.push(`c.exterior_color = $${++pc}`); params.push(color); }
    if (condition) { where.push(`c.condition = $${++pc}`); params.push(condition); }
    if (transmission) { where.push(`c.transmission = $${++pc}`); params.push(transmission); }
    const ft = fuel_type || fuelType; if (ft) { where.push(`c.fuel_type = $${++pc}`); params.push(ft); }
    if (body_style) { where.push(`c.body_style = $${++pc}`); params.push(body_style); }
    if (seller_id) { where.push(`c.seller_id = $${++pc}`); params.push(parseInt(seller_id)); }
    let distanceSelect = '';
    if (lat && lng && radius) {
      const plat = parseFloat(lat), plng = parseFloat(lng), pradius = parseFloat(radius);
      const distCol = `(3959 * acos(cos(radians($${++pc})) * cos(radians(c.latitude)) * cos(radians(c.longitude) - radians($${++pc})) + sin(radians(${pc - 1})) * sin(radians(c.latitude))))`;
      where.push(`${distCol} <= $${++pc} AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL`);
      distanceSelect = `, ${distCol} AS distance`;
      params.push(plat, plng, pradius);
    }
    const orderMap = { newest: 'c.created_at DESC', price_asc: 'c.price ASC', price_desc: 'c.price DESC', mileage_asc: 'c.mileage ASC', mileage_desc: 'c.mileage DESC', year_desc: 'c.year DESC', year_asc: 'c.year ASC', distance: 'distance ASC' };
    const orderBy = orderMap[sortBy] || 'c.created_at DESC';
    const countQ = `SELECT COUNT(*) FROM cars c WHERE ${where.join(' AND ')}`;
    const { rows: countRows } = await req.db.query(countQ, params);
    const total = parseInt(countRows[0].count);
    const offset = (page - 1) * limit;
    const dataQ = `SELECT c.*, u.name as seller_name, (SELECT url FROM car_images WHERE car_id = c.id ORDER BY position LIMIT 1) as main_image${distanceSelect} FROM cars c JOIN users u ON c.seller_id = u.id WHERE ${where.join(' AND ')} ORDER BY ${orderBy} LIMIT $${++pc} OFFSET $${++pc}`;
    const { rows: cars } = await req.db.query(dataQ, [...params, limit, offset]);
    const avgPrices = await req.db.query('SELECT make, AVG(price) as avg_price FROM cars WHERE status = $1 GROUP BY make', ['available']);
    const avgMap = {};
    for (const r of avgPrices.rows) avgMap[r.make] = parseInt(r.avg_price);
    const enriched = cars.map(c => {
      const avg = avgMap[c.make];
      let deal_rating = null;
      if (avg && avg > 0) {
        const diff = c.price - avg;
        const pct = (diff / avg) * 100;
        if (pct <= -20) deal_rating = 'great';
        else if (pct <= -10) deal_rating = 'good';
        else if (pct <= 10) deal_rating = 'fair';
        else deal_rating = 'overpriced';
      }
      return { ...c, deal_rating };
    });
    res.json({ cars: enriched, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('GET /api/cars error:', err);
    res.status(500).json({ message: 'Failed to fetch cars' });
  }
});

app.get('/api/cars/recommended', async (req, res) => {
  try {
    const { rows } = await req.db.query('SELECT c.*, u.name as seller_name, (SELECT url FROM car_images WHERE car_id = c.id ORDER BY position LIMIT 1) as main_image FROM cars c JOIN users u ON c.seller_id = u.id WHERE c.status = $1 ORDER BY c.views_count DESC, c.created_at DESC LIMIT 6', ['available']);
    const avgPrices = await req.db.query('SELECT make, AVG(price) as avg_price FROM cars WHERE status = $1 GROUP BY make', ['available']);
    const avgMap = {};
    for (const r of avgPrices.rows) avgMap[r.make] = parseInt(r.avg_price);
    const enriched = rows.map(c => {
      const avg = avgMap[c.make];
      let deal_rating = null;
      if (avg && avg > 0) {
        const diff = c.price - avg;
        const pct = (diff / avg) * 100;
        if (pct <= -20) deal_rating = 'great';
        else if (pct <= -10) deal_rating = 'good';
        else if (pct <= 10) deal_rating = 'fair';
        else deal_rating = 'overpriced';
      }
      return { ...c, deal_rating };
    });
    res.json(enriched);
  } catch (err) {
    console.error('GET /api/cars/recommended error:', err);
    res.status(500).json({ message: 'Failed' });
  }
});

app.get('/api/models/:make', async (req, res) => {
  try {
    const result = await pool.query('SELECT model FROM car_models WHERE LOWER(make) = LOWER($1) ORDER BY model', [req.params.make]);
    res.json(result.rows.map(r => r.model));
  } catch (err) {
    console.error('Models fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

app.get('/api/cars/:id', async (req, res) => {
  await req.db.query('UPDATE cars SET views_count = views_count + 1 WHERE id = $1', [req.params.id]);
  const { rows } = await req.db.query('SELECT c.*, u.name as seller_name FROM cars c JOIN users u ON c.seller_id = u.id WHERE c.id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ message: 'Not found' });
  const car = rows[0];
  const { rows: images } = await req.db.query('SELECT url, public_id FROM car_images WHERE car_id = $1 ORDER BY position', [req.params.id]);
  car.images = images;
  const avgResult = await req.db.query('SELECT AVG(price) as avg_price FROM cars WHERE make = $1 AND status = $2', [car.make, 'available']);
  const avg = parseInt(avgResult.rows[0].avg_price);
  let deal_rating = null;
  if (avg && avg > 0) {
    const diff = car.price - avg;
    const pct = (diff / avg) * 100;
    if (pct <= -20) deal_rating = 'great';
    else if (pct <= -10) deal_rating = 'good';
    else if (pct <= 10) deal_rating = 'fair';
    else deal_rating = 'overpriced';
  }
  car.deal_rating = deal_rating;
  res.json(car);
});

app.post('/api/cars', authenticate, async (req, res) => {
  const { make, model, year, trim, price, mileage, transmission, fuel_type, fuelType, engine, exterior_color, exteriorColor, interior_color, interiorColor, vin, condition, description, body_style, bodyStyle, drivetrain, city, state, zip, latitude, longitude, images } = req.body;
  try {
    await req.db.query('BEGIN');
    const ft = fuel_type || fuelType; const ec = exterior_color || exteriorColor; const ic = interior_color || interiorColor;
    const bs = body_style || bodyStyle;
    const dt = drivetrain;
    const carResult = await req.db.query('INSERT INTO cars (seller_id, make, model, year, trim, price, mileage, transmission, fuel_type, engine, exterior_color, interior_color, vin, condition, description, body_style, drivetrain, city, state, zip, latitude, longitude) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *', [req.user.id, make, model, year, trim, price, mileage, transmission, ft, engine, ec, ic, vin, condition, description, bs, dt, city, state, zip, latitude, longitude]);
    const car = carResult.rows[0];
    if (images?.length) for (let i = 0; i < images.length; i++) {
      const url = typeof images[i] === 'string' ? images[i] : images[i].url;
      const pid = typeof images[i] === 'string' ? null : images[i].publicId;
      await req.db.query('INSERT INTO car_images (car_id, url, public_id, position) VALUES ($1,$2,$3,$4)', [car.id, url, pid, i]);
    }
    await req.db.query('COMMIT');
    res.status(201).json(car);
  } catch (err) { await req.db.query('ROLLBACK'); res.status(500).json({ message: 'Failed' }); }
});

app.patch('/api/cars/:id', authenticate, async (req, res) => {
  const { images, ...fields } = req.body;
  try {
    await req.db.query('BEGIN');
    const car = await req.db.query('SELECT * FROM cars WHERE id = $1 AND seller_id = $2', [req.params.id, req.user.id]);
    if (!car.rows.length) {
      const exists = await req.db.query('SELECT 1 FROM cars WHERE id = $1', [req.params.id]);
      if (!exists.rows.length) return res.status(404).json({ message: 'Car not found' });
      return res.status(403).json({ message: 'Only the seller can update this car' });
    }
    if (Object.keys(fields).length) {
      const updates = []; const vals = []; let idx = 1;
      for (const [key, val] of Object.entries(fields)) {
        if (val !== undefined) { updates.push(`${key} = $${idx++}`); vals.push(val); }
      }
      if (updates.length) {
        vals.push(req.params.id);
        await req.db.query(`UPDATE cars SET ${updates.join(', ')} WHERE id = $${idx}`, vals);
      }
    }
    if (images?.length) {
      await req.db.query('DELETE FROM car_images WHERE car_id = $1', [req.params.id]);
      for (let i = 0; i < images.length; i++) {
        const url = typeof images[i] === 'string' ? images[i] : images[i].url;
        const pid = typeof images[i] === 'string' ? null : images[i].publicId;
        await req.db.query('INSERT INTO car_images (car_id, url, public_id, position) VALUES ($1,$2,$3,$4)', [req.params.id, url, pid, i]);
      }
    }
    await req.db.query('COMMIT');
    const { rows } = await req.db.query('SELECT c.*, u.name as seller_name, (SELECT url FROM car_images WHERE car_id = c.id ORDER BY position LIMIT 1) as main_image FROM cars c JOIN users u ON c.seller_id = u.id WHERE c.id = $1', [req.params.id]);
    res.json(rows[0]);
  } catch (err) { await req.db.query('ROLLBACK'); res.status(500).json({ message: 'Failed to update car' }); }
});

// Upload
app.post('/api/upload', authenticate, upload.single('image'), async (req, res) => {
  try {
    const result = await cloudinary.uploader.upload(req.file.path, { folder: 'autovault/cars', transformation: [{ width: 1200, height: 800, crop: 'fill' }] });
    res.json({ url: result.secure_url, publicId: result.public_id });
  } catch (err) { res.status(500).json({ message: 'Upload failed' }); }
});

// Payments
app.post('/api/payments/create-intent', authenticate, async (req, res) => {
  const { carId, amount } = req.body;
  const carResult = await req.db.query('SELECT * FROM cars WHERE id = $1', [carId]);
  const car = carResult.rows[0];
  if (!car || car.status === 'sold') return res.status(400).json({ message: 'Unavailable' });
  const paymentIntent = await stripe.paymentIntents.create({ amount, currency: 'usd', metadata: { carId, buyerId: req.user.id, sellerId: car.seller_id } });
  res.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id });
});

app.post('/api/orders/confirm', authenticate, async (req, res) => {
  const { paymentIntentId, carId } = req.body;
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (intent.status !== 'succeeded') return res.status(400).json({ message: 'Not complete' });
  await req.db.query('BEGIN');
  await req.db.query('UPDATE cars SET status = $1, buyer_id = $2 WHERE id = $3', ['sold', req.user.id, carId]);
  await req.db.query('INSERT INTO orders (car_id, buyer_id, seller_id, amount, payment_intent_id, status) VALUES ($1,$2,$3,$4,$5,$6)', [carId, req.user.id, intent.metadata.sellerId, intent.amount, paymentIntentId, 'completed']);
  await req.db.query('COMMIT');
  res.json({ success: true });
});

// Messages
app.get('/api/messages/conversations', authenticate, async (req, res) => {
  const { rows } = await req.db.query(`SELECT c.id, c.car_id, (SELECT json_agg(json_build_object('id',u.id,'name',u.name)) FROM conversation_participants cp2 JOIN users u ON cp2.user_id = u.id WHERE cp2.conversation_id = c.id) as participants, (SELECT json_build_object('content',m.content) FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message FROM conversations c JOIN conversation_participants cp ON c.id = cp.conversation_id WHERE cp.user_id = $1`, [req.user.id]);
  res.json(rows);
});

app.get('/api/messages/:conversationId', authenticate, async (req, res) => {
  const { rows } = await req.db.query('SELECT m.*, u.name as sender_name FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.conversation_id = $1 ORDER BY m.created_at ASC', [req.params.conversationId]);
  res.json(rows);
});

app.post('/api/messages', authenticate, async (req, res) => {
  const { carId, content } = req.body;
  let conv = await req.db.query('SELECT c.id FROM conversations c JOIN conversation_participants cp1 ON c.id = cp1.conversation_id JOIN conversation_participants cp2 ON c.id = cp2.conversation_id WHERE c.car_id = $1 AND cp1.user_id = $2 AND cp2.user_id = (SELECT seller_id FROM cars WHERE id = $1)', [carId, req.user.id]);
  let conversationId;
  if (!conv.rows.length) {
    const newConv = await req.db.query('INSERT INTO conversations (car_id) VALUES ($1) RETURNING id', [carId]);
    conversationId = newConv.rows[0].id;
    const seller = await req.db.query('SELECT seller_id FROM cars WHERE id = $1', [carId]);
    await req.db.query('INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1,$2), ($1,$3)', [conversationId, req.user.id, seller.rows[0].seller_id]);
  } else conversationId = conv.rows[0].id;
  const result = await req.db.query('INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1,$2,$3) RETURNING *', [conversationId, req.user.id, content]);
  res.json(result.rows[0]);
});

// Plates
app.get('/api/plates', async (req, res) => {
  const { search, jurisdiction, type, minPrice, maxPrice, sortBy = 'newest', page = 1, limit = 12 } = req.query;
  let where = ['p.status = $1']; let params = ['available']; let pc = 1;
  if (search) { where.push(`(p.title ILIKE $${++pc} OR p.plate_text ILIKE $${pc})`); params.push(`%${search}%`); }
  if (jurisdiction) { where.push(`p.jurisdiction = $${++pc}`); params.push(jurisdiction); }
  if (type) { where.push(`p.type = $${++pc}`); params.push(type); }
  if (minPrice) { where.push(`p.price >= $${++pc}`); params.push(minPrice); }
  if (maxPrice) { where.push(`p.price <= $${++pc}`); params.push(maxPrice); }
  const orderMap = { newest: 'p.created_at DESC', price_asc: 'p.price ASC', price_desc: 'p.price DESC' };
  const orderBy = orderMap[sortBy] || 'p.created_at DESC';
  const countQ = `SELECT COUNT(*) FROM plates p WHERE ${where.join(' AND ')}`;
  const { rows: countRows } = await req.db.query(countQ, params);
  const total = parseInt(countRows[0].count);
  const offset = (page - 1) * limit;
  const dataQ = `SELECT p.*, u.name as seller_name, (SELECT url FROM plate_images WHERE plate_id = p.id ORDER BY position LIMIT 1) as main_image, (SELECT COUNT(*) FROM plate_watchers WHERE plate_id = p.id) as watchers_count FROM plates p JOIN users u ON p.seller_id = u.id WHERE ${where.join(' AND ')} ORDER BY ${orderBy} LIMIT $${++pc} OFFSET $${++pc}`;
  const { rows: plates } = await req.db.query(dataQ, [...params, limit, offset]);
  res.json({ plates, total, page: parseInt(page), limit: parseInt(limit) });
});

app.get('/api/plates/categories', async (req, res) => {
  const { rows } = await req.db.query('SELECT * FROM plate_categories ORDER BY name');
  res.json(rows);
});

app.get('/api/plates/jurisdictions', async (req, res) => {
  const { rows } = await req.db.query('SELECT jurisdiction, COUNT(*) as count FROM plates GROUP BY jurisdiction ORDER BY count DESC LIMIT 50');
  const usStates = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
  const all = usStates.map(s => ({ jurisdiction: s, count: 0 }));
  for (const r of rows) { const idx = all.findIndex(a => a.jurisdiction === r.jurisdiction); if (idx >= 0) all[idx].count = parseInt(r.count); }
  res.json(all);
});

app.get('/api/plates/:id', async (req, res) => {
  await req.db.query('UPDATE plates SET views_count = views_count + 1 WHERE id = $1', [req.params.id]);
  const { rows } = await req.db.query('SELECT p.*, u.name as seller_name FROM plates p JOIN users u ON p.seller_id = u.id WHERE p.id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ message: 'Not found' });
  const plate = rows[0];
  const { rows: images } = await req.db.query('SELECT url, public_id FROM plate_images WHERE plate_id = $1 ORDER BY position', [req.params.id]);
  plate.images = images;
  const { rows: cats } = await req.db.query('SELECT c.id, c.name, c.slug FROM plate_categories c JOIN plate_category_mappings m ON c.id = m.category_id WHERE m.plate_id = $1', [req.params.id]);
  plate.categories = cats;
  const { rows: watchRows } = await req.db.query('SELECT COUNT(*) as count FROM plate_watchers WHERE plate_id = $1', [req.params.id]);
  plate.watchers_count = parseInt(watchRows[0].count);
  if (req.headers.authorization) {
    try {
      const token = req.headers.authorization.split(' ')[1];
      const user = jwt.verify(token, process.env.JWT_SECRET);
      const { rows: w } = await req.db.query('SELECT 1 FROM plate_watchers WHERE user_id = $1 AND plate_id = $2', [user.id, req.params.id]);
      plate.is_watching = w.length > 0;
    } catch {}
  }
  res.json(plate);
});

app.post('/api/plates', authenticate, async (req, res) => {
  const { title, plate_text, jurisdiction, type, condition, price, description, transferable, images, category_ids } = req.body;
  try {
    await req.db.query('BEGIN');
    const result = await req.db.query('INSERT INTO plates (seller_id, title, plate_text, jurisdiction, type, condition, price, description, transferable) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [req.user.id, title, plate_text, jurisdiction, type || 'vanity', condition || 'Used', price, description, transferable !== false]);
    const plate = result.rows[0];
    if (images?.length) for (let i = 0; i < images.length; i++) {
      const url = typeof images[i] === 'string' ? images[i] : images[i].url;
      const pid = typeof images[i] === 'string' ? null : images[i].publicId;
      await req.db.query('INSERT INTO plate_images (plate_id, url, public_id, position) VALUES ($1,$2,$3,$4)', [plate.id, url, pid, i]);
    }
    if (category_ids?.length) for (const cid of category_ids) {
      await req.db.query('INSERT INTO plate_category_mappings (plate_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [plate.id, cid]);
    }
    await req.db.query('COMMIT');
    res.status(201).json(plate);
  } catch (err) { await req.db.query('ROLLBACK'); res.status(500).json({ message: 'Failed to create plate listing' }); }
});

app.post('/api/plates/:id/watch', authenticate, async (req, res) => {
  const existing = await req.db.query('SELECT 1 FROM plate_watchers WHERE user_id = $1 AND plate_id = $2', [req.user.id, req.params.id]);
  if (existing.rows.length) {
    await req.db.query('DELETE FROM plate_watchers WHERE user_id = $1 AND plate_id = $2', [req.user.id, req.params.id]);
    res.json({ watching: false });
  } else {
    await req.db.query('INSERT INTO plate_watchers (user_id, plate_id) VALUES ($1,$2)', [req.user.id, req.params.id]);
    res.json({ watching: true });
  }
});

app.post('/api/plates/:id/offers', authenticate, async (req, res) => {
  const { amount, message } = req.body;
  const result = await req.db.query('INSERT INTO plate_offers (plate_id, buyer_id, amount, message, expires_at) VALUES ($1,$2,$3,$4,NOW() + INTERVAL \'7 days\') RETURNING *',
    [req.params.id, req.user.id, amount, message]);
  res.status(201).json(result.rows[0]);
});

app.get('/api/plates/:id/offers', authenticate, async (req, res) => {
  const plate = await req.db.query('SELECT seller_id FROM plates WHERE id = $1', [req.params.id]);
  if (!plate.rows.length) return res.status(404).json({ message: 'Not found' });
  if (plate.rows[0].seller_id !== req.user.id) return res.status(403).json({ message: 'Only the seller can view offers' });
  const { rows } = await req.db.query('SELECT o.*, u.name as buyer_name FROM plate_offers o JOIN users u ON o.buyer_id = u.id WHERE o.plate_id = $1 ORDER BY o.created_at DESC', [req.params.id]);
  res.json(rows);
});

app.patch('/api/plates/offers/:id', authenticate, async (req, res) => {
  const { status } = req.body;
  if (!['accepted', 'rejected'].includes(status)) return res.status(400).json({ message: 'Invalid status' });
  const offer = await req.db.query('SELECT o.*, p.seller_id FROM plate_offers o JOIN plates p ON o.plate_id = p.id WHERE o.id = $1', [req.params.id]);
  if (!offer.rows.length) return res.status(404).json({ message: 'Offer not found' });
  if (offer.rows[0].seller_id !== req.user.id) return res.status(403).json({ message: 'Only the seller can respond' });
  await req.db.query('UPDATE plate_offers SET status = $1, updated_at = NOW() WHERE id = $2', [status, req.params.id]);
  if (status === 'accepted') {
    await req.db.query('UPDATE plates SET status = $1, buyer_id = $2 WHERE id = $3', ['sold', offer.rows[0].buyer_id, offer.rows[0].plate_id]);
  }
  res.json({ success: true });
});

// Admin
app.get('/api/admin/stats', authenticate, requireAdmin, async (req, res) => {
  const results = await Promise.all([
    req.db.query('SELECT COUNT(*) FROM cars'), req.db.query('SELECT COUNT(*) FROM cars WHERE status = $1', ['available']),
    req.db.query('SELECT COUNT(*) FROM users'), req.db.query('SELECT COUNT(*) FROM orders'),
    req.db.query('SELECT COUNT(*) FROM messages'), req.db.query('SELECT COALESCE(SUM(amount),0) FROM orders WHERE status = $1', ['completed'])
  ]);
  res.json({ totalCars: parseInt(results[0].rows[0].count), activeCars: parseInt(results[1].rows[0].count), totalUsers: parseInt(results[2].rows[0].count), totalOrders: parseInt(results[3].rows[0].count), totalMessages: parseInt(results[4].rows[0].count), totalRevenue: parseInt(results[5].rows[0].coalesce) / 100 });
});

app.get('/api/admin/cars', authenticate, requireAdmin, async (req, res) => {
  const { rows } = await req.db.query('SELECT c.*, u.name as seller_name FROM cars c JOIN users u ON c.seller_id = u.id ORDER BY c.created_at DESC');
  res.json(rows);
});

app.delete('/api/admin/cars/:id', authenticate, requireAdmin, async (req, res) => {
  await req.db.query('DELETE FROM cars WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/admin/users', authenticate, requireAdmin, async (req, res) => {
  const { rows } = await req.db.query('SELECT u.*, COUNT(c.id) as listing_count FROM users u LEFT JOIN cars c ON u.id = c.seller_id GROUP BY u.id ORDER BY u.created_at DESC');
  res.json(rows);
});

app.delete('/api/admin/users/:id', authenticate, requireAdmin, async (req, res) => {
  await req.db.query('DELETE FROM users WHERE id = $1 AND role != $2', [req.params.id, 'admin']);
  res.json({ success: true });
});

app.get('/api/admin/orders', authenticate, requireAdmin, async (req, res) => {
  const { rows } = await req.db.query('SELECT o.*, c.year, c.make, c.model, buyer.name as buyer_name, seller.name as seller_name FROM orders o JOIN cars c ON o.car_id = c.id JOIN users buyer ON o.buyer_id = buyer.id JOIN users seller ON o.seller_id = seller.id ORDER BY o.created_at DESC');
  res.json(rows);
});

// Error handling
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ message: 'Internal error' }); });

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`AutoVault USA on port ${PORT}`));

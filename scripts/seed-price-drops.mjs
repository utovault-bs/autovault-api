import fetch from 'node-fetch';
const API = process.env.API_URL || 'http://localhost:5000/api';

const priceDrops = [
  { id: 1, prev: 35000 },   // Honda Civic
  { id: 2, prev: 55000 },   // Toyota Camry
  { id: 3, prev: 130000 },  // BMW M3
  { id: 8, prev: 48000 },   // Mazda CX-5
  { id: 12, prev: 7000 },   // Honda Civic LX
];

async function run() {
  for (const { id, prev } of priceDrops) {
    try {
      const res = await fetch(`${API}/cars/${id}`);
      const car = await res.json();
      if (car.id) {
        // Use a simple direct update via the API
        // We need to use PATCH /api/cars/:id but it requires auth + seller match
        // Instead we'll do direct DB update in a raw query endpoint, or skip and just run SQL
        console.log(`Car ${id}: ${car.make} ${car.model} — would set previous_price to $${prev}`);
      }
    } catch (e) {
      console.error(`Error on car ${id}:`, e.message);
    }
  }
  console.log('\nRun this SQL directly to set price drops:');
  console.log('UPDATE cars SET previous_price = 35000, price_dropped_at = NOW() - INTERVAL \'7 days\' WHERE id = 1;');
  console.log('UPDATE cars SET previous_price = 55000, price_dropped_at = NOW() - INTERVAL \'14 days\' WHERE id = 2;');
  console.log('UPDATE cars SET previous_price = 130000, price_dropped_at = NOW() - INTERVAL \'3 days\' WHERE id = 3;');
  console.log('UPDATE cars SET previous_price = 48000, price_dropped_at = NOW() - INTERVAL \'10 days\' WHERE id = 8;');
  console.log('UPDATE cars SET previous_price = 7000, price_dropped_at = NOW() - INTERVAL \'5 days\' WHERE id = 12;');
}

run();

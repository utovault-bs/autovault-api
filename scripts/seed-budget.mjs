const API = 'https://autovault-api-oa6j.onrender.com';
const CARS = [
  { make: 'Honda', model: 'Civic', year: 2015, trim: 'LX', price: '6500', mileage: 72000, transmission: 'Automatic', fuel_type: 'Gasoline', engine: '1.8L 4-Cyl', exterior_color: 'Black', interior_color: 'Gray', vin: 'B1HGCM82633A10001', condition: 'Used', description: 'Reliable daily driver, one owner, clean Carfax. Great gas mileage, Bluetooth, backup camera. Well maintained.', body_style: 'Sedan', drivetrain: 'FWD', image: 'https://unsplash.com/photos/TfzKdWPv5vA/download?w=800' },
  { make: 'Mazda', model: 'Mazda3', year: 2012, trim: 'i Touring', price: '4200', mileage: 95000, transmission: 'Manual', fuel_type: 'Gasoline', engine: '2.0L 4-Cyl', exterior_color: 'Blue', interior_color: 'Black', vin: 'B2HGCM82633A10002', condition: 'Used', description: 'Fun to drive, great condition inside and out. Sunroof, heated seats, premium audio. Manual transmission makes it a blast.', body_style: 'Hatchback', drivetrain: 'FWD', image: 'https://unsplash.com/photos/_wQoaxsLpL8/download?w=800' },
  { make: 'Ford', model: 'Focus', year: 2013, trim: 'SE', price: '3900', mileage: 88000, transmission: 'Automatic', fuel_type: 'Gasoline', engine: '2.0L 4-Cyl', exterior_color: 'Gray', interior_color: 'Black', vin: 'B3HGCM82633A10003', condition: 'Used', description: 'Great first car or commuter. Power windows/locks, Bluetooth, SYNC infotainment, good tires. Passed inspection.', body_style: 'Hatchback', drivetrain: 'FWD', image: 'https://unsplash.com/photos/wgEu_2JVd1Q/download?w=800' },
];

async function main() {
  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@autovault.com', password: 'demo123' }),
  });
  const { token } = await login.json();
  if (!token) { console.error('Login failed'); process.exit(1); }
  console.log('Logged in\n');

  for (const c of CARS) {
    const { image, ...car } = c;
    const res = await fetch(`${API}/api/cars`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...car, images: [image] }),
    });
    if (res.ok) {
      const r = await res.json();
      console.log(`\u2713 ${r.make} ${r.model}: id=${r.id}, \$${parseInt(r.price).toLocaleString()}`);
    } else {
      console.error(`\u2717 ${c.make} ${c.model}: ${res.status} ${await res.text()}`);
    }
  }
  console.log('\nDone!');
}

main().catch(console.error);

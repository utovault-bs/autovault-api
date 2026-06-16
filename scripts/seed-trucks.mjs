const API = 'https://autovault-api-oa6j.onrender.com';
const TRUCKS = [
  { make: 'Ford', model: 'F-150', year: 2024, trim: 'Lariat', price: '52000', mileage: 5000, transmission: 'Automatic', fuel_type: 'Gasoline', engine: '3.5L EcoBoost V6', exterior_color: 'White', interior_color: 'Black', vin: 'T1FTMW82A4S000001', condition: 'New', description: 'Crew cab, 4WD, tow package, spray-in bedliner, SYNC 4 infotainment. Like-new condition.', body_style: 'Truck', drivetrain: '4WD', image: 'https://unsplash.com/photos/0q9OSS7Rfmo/download?w=800' },
  { make: 'Ram', model: '1500', year: 2024, trim: 'Laramie', price: '48500', mileage: 8000, transmission: 'Automatic', fuel_type: 'Gasoline', engine: '5.7L HEMI V8', exterior_color: 'Black', interior_color: 'Black', vin: 'T2FTMW82A4S000002', condition: 'Used', description: 'Crew cab, 4WD, 12" touchscreen, heated/ventilated seats, air suspension. Smooth ride.', body_style: 'Truck', drivetrain: '4WD', image: 'https://unsplash.com/photos/HM1rcFaVkoM/download?w=800' },
  { make: 'Chevrolet', model: 'Silverado 1500', year: 2023, trim: 'LT Trail Boss', price: '45500', mileage: 12000, transmission: 'Automatic', fuel_type: 'Gasoline', engine: '5.3L V8', exterior_color: 'Black', interior_color: 'Gray', vin: 'T3FTMW82A4S000003', condition: 'Used', description: 'Crew cab, 4WD, Z71 off-road package, skid plates, all-terrain tires. Ready for work or play.', body_style: 'Truck', drivetrain: '4WD', image: 'https://unsplash.com/photos/znZ45o8gJOc/download?w=800' },
];

async function main() {
  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@autovault.com', password: 'demo123' }),
  });
  const { token } = await login.json();
  if (!token) { console.error('Login failed'); process.exit(1); }
  console.log('Logged in\n');

  for (const t of TRUCKS) {
    const { image, ...car } = t;
    const res = await fetch(`${API}/api/cars`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...car, images: [image] }),
    });
    if (res.ok) {
      const c = await res.json();
      console.log(`\u2713 ${c.make} ${c.model}: id=${c.id}, \$${c.price}, ${c.body_style}`);
    } else {
      console.error(`\u2717 ${t.make} ${t.model}: ${res.status} ${await res.text()}`);
    }
  }
  console.log('\nDone!');
}

main().catch(console.error);

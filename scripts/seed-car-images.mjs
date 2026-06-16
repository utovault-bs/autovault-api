const API = 'https://autovault-api-oa6j.onrender.com';
const CARS = [
  { id: 1, model: 'Toyota Camry',       image: 'https://unsplash.com/photos/YPfnvLc3bbQ/download?w=800' },
  { id: 2, model: 'Honda CR-V',         image: 'https://unsplash.com/photos/vjwwhm3iTd4/download?w=800' },
  { id: 3, model: 'Ford Mustang GT',    image: 'https://unsplash.com/photos/_x95FGRElkU/download?w=800' },
  { id: 4, model: 'Tesla Model 3',      image: 'https://unsplash.com/photos/y4vzbiq4xiw/download?w=800' },
  { id: 5, model: 'BMW X5',            image: 'https://unsplash.com/photos/tShF65IfzHg/download?w=800' },
  { id: 6, model: 'Chevrolet Tahoe',    image: 'https://unsplash.com/photos/Cy0qwqsN92o/download?w=800' },
  { id: 7, model: 'Mercedes C300',      image: 'https://unsplash.com/photos/RmNyG8rBpt4/download?w=800' },
  { id: 8, model: 'Subaru Outback',     image: 'https://unsplash.com/photos/2KrY6jXifP0/download?w=800' },
];

async function main() {
  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@autovault.com', password: 'demo123' }),
  });
  const { token } = await login.json();
  if (!token) { console.error('Login failed'); process.exit(1); }
  console.log('Logged in as demo user\n');

  for (const car of CARS) {
    const res = await fetch(`${API}/api/cars/${car.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ images: [car.image] }),
    });
    if (res.ok) {
      const updated = await res.json();
      console.log(`✓ ${car.model}: main_image = ${updated.main_image?.slice(0, 60)}...`);
    } else {
      const err = await res.text();
      console.error(`✗ ${car.model}: ${res.status} ${err}`);
    }
  }

  console.log('\nDone! Check https://autovault-api-oa6j.onrender.com/api/cars');
}

main().catch(console.error);

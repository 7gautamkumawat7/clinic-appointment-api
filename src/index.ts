import { createApp } from './app.js';
import { createDatabase } from './db.js';
import { join } from 'node:path';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const DB_PATH = process.env.DB_PATH || join(process.cwd(), 'clinic_booking.db');

const db = createDatabase(DB_PATH);
const app = createApp(db);

app.listen(PORT, () => {
  console.log(`Clinic Booking API running at http://localhost:${PORT}`);
  console.log(`SQLite database: ${DB_PATH}`);
});

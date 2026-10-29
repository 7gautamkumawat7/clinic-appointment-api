import { DatabaseSync } from 'node:sqlite';

export function createDatabase(dbPath: string = ':memory:'): DatabaseSync {
  const db = new DatabaseSync(dbPath);

  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS slots (
      id TEXT PRIMARY KEY,
      clinic_id TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'BOOKED', 'CANCELLED')),
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      CHECK (start_time < end_time)
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      slot_id TEXT NOT NULL REFERENCES slots(id),
      patient_name TEXT NOT NULL,
      patient_email TEXT NOT NULL,
      patient_phone TEXT,
      status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'CANCELLED')),
      cancellation_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_active_booking
    ON bookings (slot_id)
    WHERE status = 'CONFIRMED';

    CREATE INDEX IF NOT EXISTS idx_slots_search
    ON slots (clinic_id, status, start_time);
  `);

  return db;
}

export function withTransaction<T>(db: DatabaseSync, action: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

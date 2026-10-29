# Clinic Appointment Booking API (TypeScript)

A simple, robust appointment booking API built with **TypeScript**, **Node.js**, **Express**, and **SQLite**.

---

## 1. Database Design

The schema uses two tables with SQLite/Postgres compatibility:

```sql
-- SLOTS TABLE
CREATE TABLE IF NOT EXISTS slots (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'BOOKED', 'CANCELLED')),
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  CHECK (start_time < end_time)
);

-- BOOKINGS TABLE
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

-- INVARIANT: Guarantees a slot can NEVER be double-booked
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_booking
ON bookings (slot_id)
WHERE status = 'CONFIRMED';
```

---

## 2. Concurrency & Booking Rule Guarantees

How double-booking is prevented even with simultaneous requests:
1. **Immediate Write Lock**: Operations run inside `BEGIN IMMEDIATE` transactions.
2. **Atomic Status Check & Flip**:
   ```sql
   UPDATE slots SET status = 'BOOKED' WHERE id = ? AND status = 'AVAILABLE';
   ```
   Only the first request modifies the row (`changes === 1`). The other request gets `changes === 0` and is rejected with `409 Conflict`.
3. **Database Unique Constraint**: The partial index `uq_active_booking` enforces that only **one** `CONFIRMED` booking can exist per `slot_id`.

---

## 3. API Endpoints

| Method | Route | Description |
|---|---|---|
| `POST` | `/slots` | Publish a time slot (`clinic_id`, `start_time`, `end_time`). |
| `GET` | `/slots` | List slots (optional filters: `?clinic_id=...&status=AVAILABLE`). |
| `POST` | `/slots/:id/cancel` | Cancel a slot. If booked, also cancels active booking. |
| `POST` | `/bookings` | Book an available slot (`slot_id`, `patient_name`, `patient_email`). |
| `GET` | `/bookings/:id` | Get booking details. |
| `POST` | `/bookings/:id/cancel` | Cancel a booking. **Reopens the slot to `AVAILABLE`**. |

---

## 4. Architecture & Project Structure

The project uses a clean, layered architecture separating routing, business logic, data persistence, and error handling:

```
clinic-booking/
├── src/
│   ├── types.ts                   # Core domain interfaces (Slot, Booking, DTOs)
│   ├── errors.ts                  # Standardized HttpError class
│   ├── db.ts                      # SQLite schema setup and withTransaction helper
│   ├── services/
│   │   ├── slot.service.ts        # Slot creation, queries, overlap checks, and cancellations
│   │   └── booking.service.ts     # Concurrency-safe booking creation, queries, cancellations
│   ├── routes/
│   │   ├── slots.ts               # Express router for /slots endpoints
│   │   └── bookings.ts            # Express router for /bookings endpoints
│   ├── app.ts                     # Express application factory & centralized error handler
│   └── index.ts                   # Server entry point
├── tests/
│   └── booking-rules.test.ts      # Automated unit, integration & concurrency tests
├── package.json
└── tsconfig.json
```

---

## 5. Run the Tests & Server

```bash
# Run automated tests (includes concurrency & double-booking tests)
npm test

# Run API server (development mode with tsx)
npm start

# Build and run compiled production JavaScript
npm run build
npm run start:dist
```

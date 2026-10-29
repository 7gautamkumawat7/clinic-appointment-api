import express, { Express, Request, Response, NextFunction } from 'express';
import { DatabaseSync } from 'node:sqlite';
import { createDatabase } from './db.js';
import { createSlotRouter } from './routes/slots.js';
import { createBookingRouter } from './routes/bookings.js';
import { HttpError } from './errors.js';

export function createApp(database?: DatabaseSync): Express {
  const db = database ?? createDatabase(':memory:');
  const app = express();

  app.use(express.json());

  // Root & Health Check
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      message: 'Clinic Appointment Booking API is running!',
      status: 'healthy',
      endpoints: [
        'GET  /health',
        'POST /slots              (Publish a time slot)',
        'GET  /slots              (List slots with optional ?clinic_id=...&status=...)',
        'POST /slots/:id/cancel   (Cancel a time slot)',
        'POST /bookings           (Book an available slot)',
        'GET  /bookings/:id       (Get booking details)',
        'POST /bookings/:id/cancel(Cancel a booking & reopen slot)',
      ],
    });
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'clinic-booking-api' });
  });

  // Domain Routers
  app.use('/slots', createSlotRouter(db));
  app.use('/bookings', createBookingRouter(db));

  // Centralized Error Handling Middleware
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    if (err?.message?.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Slot is already booked' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

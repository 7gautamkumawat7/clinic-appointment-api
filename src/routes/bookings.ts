import { Router, Request, Response, NextFunction } from 'express';
import { DatabaseSync } from 'node:sqlite';
import { BookingService } from '../services/booking.service.js';
import { HttpError } from '../errors.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createBookingRouter(db: DatabaseSync): Router {
  const router = Router();
  const bookingService = new BookingService(db);

  router.post('/', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { slot_id, patient_name, patient_email, patient_phone } = req.body || {};

      if (!slot_id || typeof slot_id !== 'string') {
        throw new HttpError(400, 'slot_id is required');
      }
      if (!patient_name || typeof patient_name !== 'string' || !patient_name.trim()) {
        throw new HttpError(400, 'patient_name is required');
      }
      if (!patient_email || typeof patient_email !== 'string' || !EMAIL_REGEX.test(patient_email)) {
        throw new HttpError(400, 'A valid patient_email is required');
      }

      const booking = bookingService.createBooking({
        slot_id,
        patient_name,
        patient_email,
        patient_phone,
      });

      return res.status(201).json({
        message: 'Slot booked successfully',
        booking,
      });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const booking = bookingService.getBooking(id);
      return res.json({ booking });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/:id/cancel', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const { reason } = req.body || {};
      const booking = bookingService.cancelBooking(id, reason);

      return res.json({
        message: 'Booking cancelled successfully. Slot has been reopened for bookings.',
        booking,
      });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}


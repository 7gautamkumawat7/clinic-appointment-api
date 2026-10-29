import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { withTransaction } from '../db.js';
import { HttpError } from '../errors.js';
import { Booking, CreateBookingDTO, Slot } from '../types.js';

export class BookingService {
  constructor(private db: DatabaseSync) {}

  createBooking(dto: CreateBookingDTO): Booking {
    const { slot_id, patient_name, patient_email, patient_phone } = dto;

    return withTransaction(this.db, () => {
      const slot = this.db.prepare('SELECT * FROM slots WHERE id = ?').get(slot_id) as unknown as Slot | undefined;
      if (!slot) {
        throw new HttpError(404, 'Slot not found');
      }
      if (slot.status === 'CANCELLED') {
        throw new HttpError(409, 'Cannot book a cancelled slot');
      }
      if (slot.status === 'BOOKED') {
        throw new HttpError(409, 'Slot is already booked');
      }

      const updateResult = this.db
        .prepare(`UPDATE slots SET status = 'BOOKED' WHERE id = ? AND status = 'AVAILABLE'`)
        .run(slot_id);

      if (updateResult.changes === 0) {
        throw new HttpError(409, 'Slot was just booked by another request');
      }

      const bookingId = randomUUID();
      this.db
        .prepare(`
          INSERT INTO bookings (id, slot_id, patient_name, patient_email, patient_phone, status)
          VALUES (?, ?, ?, ?, ?, 'CONFIRMED')
        `)
        .run(bookingId, slot_id, patient_name.trim(), patient_email.trim(), patient_phone || null);

      return {
        id: bookingId,
        slot_id,
        patient_name: patient_name.trim(),
        patient_email: patient_email.trim(),
        patient_phone: patient_phone || null,
        status: 'CONFIRMED',
        created_at: new Date().toISOString(),
      };
    });
  }

  getBooking(id: string): Booking {
    const booking = this.db.prepare('SELECT * FROM bookings WHERE id = ?').get(id) as unknown as Booking | undefined;
    if (!booking) {
      throw new HttpError(404, 'Booking not found');
    }
    return booking;
  }

  cancelBooking(id: string, reason?: string): Booking {
    return withTransaction(this.db, () => {
      const booking = this.db.prepare('SELECT * FROM bookings WHERE id = ?').get(id) as unknown as Booking | undefined;
      if (!booking) {
        throw new HttpError(404, 'Booking not found');
      }
      if (booking.status === 'CANCELLED') {
        throw new HttpError(409, 'Booking is already cancelled');
      }

      this.db
        .prepare(`UPDATE bookings SET status = 'CANCELLED', cancellation_reason = ? WHERE id = ?`)
        .run(reason || 'Patient cancelled', id);

      this.db
        .prepare(`UPDATE slots SET status = 'AVAILABLE' WHERE id = ? AND status = 'BOOKED'`)
        .run(booking.slot_id);

      return this.db.prepare('SELECT * FROM bookings WHERE id = ?').get(id) as unknown as Booking;
    });
  }
}

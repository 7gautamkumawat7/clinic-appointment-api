import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { withTransaction } from '../db.js';
import { HttpError } from '../errors.js';
import { CreateSlotDTO, Slot } from '../types.js';

export class SlotService {
  constructor(private db: DatabaseSync) {}

  createSlot(dto: CreateSlotDTO): Slot {
    const { clinic_id, start_time, end_time } = dto;

    // Check for overlapping non-cancelled slot for this clinic
    const overlapStmt = this.db.prepare(`
      SELECT id FROM slots 
      WHERE clinic_id = ? 
        AND status != 'CANCELLED' 
        AND start_time < ? 
        AND end_time > ?
    `);
    const overlap = overlapStmt.get(clinic_id, end_time, start_time);
    if (overlap) {
      throw new HttpError(409, 'A slot already overlaps with this time window for the clinic');
    }

    const slotId = randomUUID();
    const insertStmt = this.db.prepare(`
      INSERT INTO slots (id, clinic_id, start_time, end_time, status)
      VALUES (?, ?, ?, ?, 'AVAILABLE')
    `);
    insertStmt.run(slotId, clinic_id, start_time, end_time);

    return {
      id: slotId,
      clinic_id,
      start_time,
      end_time,
      status: 'AVAILABLE',
      created_at: new Date().toISOString(),
    };
  }

  listSlots(clinicId?: string, status?: string): Slot[] {
    const conditions: string[] = [];
    const params: string[] = [];

    if (clinicId) {
      conditions.push('clinic_id = ?');
      params.push(clinicId);
    }
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return this.db.prepare(`SELECT * FROM slots ${where} ORDER BY start_time ASC`).all(...params) as unknown as Slot[];
  }

  cancelSlot(slotId: string): Slot {
    return withTransaction(this.db, () => {
      const slot = this.db.prepare('SELECT * FROM slots WHERE id = ?').get(slotId) as unknown as Slot | undefined;
      if (!slot) {
        throw new HttpError(404, 'Slot not found');
      }
      if (slot.status === 'CANCELLED') {
        throw new HttpError(409, 'Slot is already cancelled');
      }

      // If slot was booked, also cancel the active confirmed booking
      if (slot.status === 'BOOKED') {
        this.db.prepare(`
          UPDATE bookings 
          SET status = 'CANCELLED', cancellation_reason = 'Clinic cancelled time slot' 
          WHERE slot_id = ? AND status = 'CONFIRMED'
        `).run(slotId);
      }

      this.db.prepare("UPDATE slots SET status = 'CANCELLED' WHERE id = ?").run(slotId);

      return this.db.prepare('SELECT * FROM slots WHERE id = ?').get(slotId) as unknown as Slot;
    });
  }
}

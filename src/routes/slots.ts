import { Router, Request, Response, NextFunction } from 'express';
import { DatabaseSync } from 'node:sqlite';
import { SlotService } from '../services/slot.service.js';
import { HttpError } from '../errors.js';

export function createSlotRouter(db: DatabaseSync): Router {
  const router = Router();
  const slotService = new SlotService(db);

  router.post('/', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clinic_id, start_time, end_time } = req.body || {};

      if (!clinic_id || typeof clinic_id !== 'string') {
        throw new HttpError(400, 'clinic_id is required');
      }
      if (!start_time || isNaN(Date.parse(start_time))) {
        throw new HttpError(400, 'Valid ISO start_time is required');
      }
      if (!end_time || isNaN(Date.parse(end_time))) {
        throw new HttpError(400, 'Valid ISO end_time is required');
      }
      if (new Date(start_time) >= new Date(end_time)) {
        throw new HttpError(400, 'end_time must be strictly after start_time');
      }

      const slot = slotService.createSlot({ clinic_id, start_time, end_time });
      return res.status(201).json(slot);
    } catch (err) {
      return next(err);
    }
  });

  router.get('/', (req: Request, res: Response, next: NextFunction) => {
    try {
      const clinicId = typeof req.query.clinic_id === 'string' ? req.query.clinic_id : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;

      const slots = slotService.listSlots(clinicId, status);
      return res.json({ count: slots.length, slots });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/:id/cancel', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const slot = slotService.cancelSlot(id);
      return res.json({ message: 'Slot cancelled successfully', slot });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}


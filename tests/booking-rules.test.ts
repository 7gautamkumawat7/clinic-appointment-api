import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/db.js';

describe('Clinic Booking API Tests', () => {
  let app: any;
  let db: any;

  beforeEach(() => {
    db = createDatabase(':memory:');
    app = createApp(db);
  });

  test('Create, list, and cancel slots', async () => {
    const createRes = await request(app)
      .post('/slots')
      .send({
        clinic_id: 'clinic-1',
        start_time: '2026-11-01T09:00:00.000Z',
        end_time: '2026-11-01T09:30:00.000Z',
      });

    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.status, 'AVAILABLE');
    assert.ok(createRes.body.id);
    const slotId = createRes.body.id;

    const listRes = await request(app).get('/slots?clinic_id=clinic-1');
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.count, 1);
    assert.equal(listRes.body.slots[0].id, slotId);

    const cancelRes = await request(app).post(`/slots/${slotId}/cancel`).send();
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.body.slot.status, 'CANCELLED');

    const listAfterCancel = await request(app).get('/slots?status=CANCELLED');
    assert.equal(listAfterCancel.body.count, 1);
  });

  test('Book an available slot and cancel booking (reopening the slot)', async () => {
    const slotRes = await request(app).post('/slots').send({
      clinic_id: 'clinic-1',
      start_time: '2026-11-01T10:00:00.000Z',
      end_time: '2026-11-01T10:30:00.000Z',
    });
    const slotId = slotRes.body.id;

    const bookRes = await request(app).post('/bookings').send({
      slot_id: slotId,
      patient_name: 'Alice Johnson',
      patient_email: 'alice@example.com',
    });
    assert.equal(bookRes.status, 201);
    assert.equal(bookRes.body.booking.status, 'CONFIRMED');
    const bookingId = bookRes.body.booking.id;

    const listBooked = await request(app).get(`/slots?status=BOOKED`);
    assert.equal(listBooked.body.count, 1);

    const cancelBookingRes = await request(app).post(`/bookings/${bookingId}/cancel`).send({
      reason: 'Schedule change',
    });
    assert.equal(cancelBookingRes.status, 200);
    assert.equal(cancelBookingRes.body.booking.status, 'CANCELLED');

    const listReopened = await request(app).get(`/slots?status=AVAILABLE`);
    assert.equal(listReopened.body.count, 1);

    const rebookRes = await request(app).post('/bookings').send({
      slot_id: slotId,
      patient_name: 'Bob Smith',
      patient_email: 'bob@example.com',
    });
    assert.equal(rebookRes.status, 201);
    assert.equal(rebookRes.body.booking.patient_name, 'Bob Smith');
  });

  test('A slot can never be double-booked sequentially', async () => {
    const slotRes = await request(app).post('/slots').send({
      clinic_id: 'clinic-1',
      start_time: '2026-11-01T11:00:00.000Z',
      end_time: '2026-11-01T11:30:00.000Z',
    });
    const slotId = slotRes.body.id;

    const firstRes = await request(app).post('/bookings').send({
      slot_id: slotId,
      patient_name: 'Patient 1',
      patient_email: 'p1@example.com',
    });
    assert.equal(firstRes.status, 201);

    const secondRes = await request(app).post('/bookings').send({
      slot_id: slotId,
      patient_name: 'Patient 2',
      patient_email: 'p2@example.com',
    });
    assert.equal(secondRes.status, 409);
    assert.match(secondRes.body.error, /already booked/i);
  });

  test('CONCURRENCY: Simultaneous booking requests at the same moment result in EXACTLY 1 booking', async () => {
    const slotRes = await request(app).post('/slots').send({
      clinic_id: 'clinic-1',
      start_time: '2026-11-01T14:00:00.000Z',
      end_time: '2026-11-01T14:30:00.000Z',
    });
    const slotId = slotRes.body.id;

    const promises = Array.from({ length: 20 }, (_, i) => {
      return request(app).post('/bookings').send({
        slot_id: slotId,
        patient_name: `Patient ${i + 1}`,
        patient_email: `patient${i + 1}@example.com`,
      });
    });

    const responses = await Promise.all(promises);

    const success = responses.filter((r) => r.status === 201);
    const conflicts = responses.filter((r) => r.status === 409);

    assert.equal(success.length, 1, `Expected exactly 1 success, got ${success.length}`);
    assert.equal(conflicts.length, 19, `Expected 19 conflicts, got ${conflicts.length}`);

    const count = db.prepare(`SELECT count(*) as c FROM bookings WHERE slot_id = ? AND status = 'CONFIRMED'`).get(slotId);
    assert.equal(count.c, 1);
  });

  test('Validates input and returns helpful errors', async () => {
    const missingRes = await request(app).post('/bookings').send({});
    assert.equal(missingRes.status, 400);
    assert.match(missingRes.body.error, /slot_id is required/i);

    const invalidEmailRes = await request(app).post('/bookings').send({
      slot_id: 'some-id',
      patient_name: 'John',
      patient_email: 'not-an-email',
    });
    assert.equal(invalidEmailRes.status, 400);
    assert.match(invalidEmailRes.body.error, /valid patient_email/i);

    const invalidTimes = await request(app).post('/slots').send({
      clinic_id: 'clinic-1',
      start_time: '2026-11-01T12:00:00.000Z',
      end_time: '2026-11-01T11:00:00.000Z',
    });
    assert.equal(invalidTimes.status, 400);
    assert.match(invalidTimes.body.error, /end_time must be strictly after start_time/i);

    await request(app).post('/slots').send({
      clinic_id: 'clinic-1',
      start_time: '2026-11-01T15:00:00.000Z',
      end_time: '2026-11-01T16:00:00.000Z',
    });
    const overlapRes = await request(app).post('/slots').send({
      clinic_id: 'clinic-1',
      start_time: '2026-11-01T15:30:00.000Z',
      end_time: '2026-11-01T16:30:00.000Z',
    });
    assert.equal(overlapRes.status, 409);
    assert.match(overlapRes.body.error, /already overlaps/i);

    const slotToCancel = await request(app).post('/slots').send({
      clinic_id: 'clinic-1',
      start_time: '2026-11-01T17:00:00.000Z',
      end_time: '2026-11-01T17:30:00.000Z',
    });
    await request(app).post(`/slots/${slotToCancel.body.id}/cancel`).send();

    const bookCancelled = await request(app).post('/bookings').send({
      slot_id: slotToCancel.body.id,
      patient_name: 'Carol',
      patient_email: 'carol@example.com',
    });
    assert.equal(bookCancelled.status, 409);
    assert.match(bookCancelled.body.error, /cannot book a cancelled slot/i);
  });
});

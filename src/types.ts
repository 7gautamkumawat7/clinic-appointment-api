export type SlotStatus = 'AVAILABLE' | 'BOOKED' | 'CANCELLED';
export type BookingStatus = 'CONFIRMED' | 'CANCELLED';

export interface Slot {
  id: string;
  clinic_id: string;
  start_time: string;
  end_time: string;
  status: SlotStatus;
  created_at: string;
}

export interface Booking {
  id: string;
  slot_id: string;
  patient_name: string;
  patient_email: string;
  patient_phone: string | null;
  status: BookingStatus;
  cancellation_reason?: string | null;
  created_at: string;
}

export interface CreateSlotDTO {
  clinic_id: string;
  start_time: string;
  end_time: string;
}

export interface CreateBookingDTO {
  slot_id: string;
  patient_name: string;
  patient_email: string;
  patient_phone?: string;
}


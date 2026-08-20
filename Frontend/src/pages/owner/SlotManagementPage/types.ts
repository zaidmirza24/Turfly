import { TimeSlot } from '@/types';

export type SlotAction = 'AVAILABLE' | 'CLOSED' | 'FULL';
export type SlotsApiResponse = { data: TimeSlot[] };

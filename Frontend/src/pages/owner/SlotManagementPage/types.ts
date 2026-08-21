import { UseMutationResult } from '@tanstack/react-query';
import { TimeSlot, Turf } from '@/types';
import { ApiEnvelope } from '@/lib/api';

export type SlotAction = 'AVAILABLE' | 'CLOSED' | 'FULL';
export type SlotsApiResponse = ApiEnvelope<TimeSlot[]>;

/** The subset of a turf an owner can change from the settings dialog. */
export type TurfSettingsPayload = Partial<
  Pick<Turf, 'is24x7' | 'openHour' | 'closeHour' | 'defaultWeekdayPrice' | 'defaultWeekendPrice'>
>;

export type SlotInput = { startTime: string; endTime: string; price: number };
export type CreateSlotsPayload = { turfId: string; slots: SlotInput[] };

/**
 * Mutation handles passed down to the dialogs. Spelling these out (rather than
 * `UseMutationResult<any, any, any, any>`) is what makes a wrong payload at a
 * call site a compile error instead of a 400 at runtime.
 */
export type UpdateTurfMutation = UseMutationResult<ApiEnvelope<Turf>, Error, TurfSettingsPayload, { previous?: { data: Turf[] } }>;
export type ApplyDefaultsMutation = UseMutationResult<ApiEnvelope<null>, Error, void, { previous?: SlotsApiResponse }>;
export type CreateSlotsMutation = UseMutationResult<ApiEnvelope<TimeSlot[]>, Error, CreateSlotsPayload, { previous?: SlotsApiResponse }>;

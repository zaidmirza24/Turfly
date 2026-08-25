import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiPost, apiPatch, apiDelete } from '@/lib/api';
import { TimeSlot, Turf } from '@/types';
import { getISTDay, parseDateKey } from '@/lib/dateKey';
import { STATUS_META } from '../constants';
import { hourlyRateToSlotPrice } from '../utils';
import { SlotAction, SlotsApiResponse, CreateSlotsPayload, TurfSettingsPayload } from '../types';

type Params = {
  selectedTurfId: string;
  currentTurf: Turf | undefined;
  slotsQueryKey: readonly unknown[];
  onSettingsSaved: () => void;
  onBulkOrSlotCreated: () => void;
  onSelectionApplied: () => void;
};

export function useSlotMutations({ selectedTurfId, currentTurf, slotsQueryKey, onSettingsSaved, onBulkOrSlotCreated, onSelectionApplied }: Params) {
  const queryClient = useQueryClient();

  const upsertSlotsInCache = (
    old: SlotsApiResponse | undefined,
    updates: { startTime: string; endTime: string; price?: number; status: SlotAction }[]
  ): SlotsApiResponse | undefined => {
    if (!old) return old;
    const list = [...old.data];
    updates.forEach(u => {
      const targetTime = new Date(u.startTime).getTime();
      const idx = list.findIndex(s => new Date(s.startTime).getTime() === targetTime);
      if (idx >= 0) {
        if (list[idx].status === 'BOOKED' || list[idx].status === 'LOCKED') return; // never optimistically touch real bookings
        list[idx] = { ...list[idx], status: u.status, price: u.price ?? list[idx].price };
      } else {
        list.push({
          _id: `optimistic-${u.startTime}`,
          turfId: selectedTurfId,
          startTime: u.startTime,
          endTime: u.endTime,
          status: u.status,
          price: u.price ?? currentTurf?.pricePerHour ?? 0,
        });
      }
    });
    return { ...old, data: list };
  };

  const snapshotSlots = async () => {
    await queryClient.cancelQueries({ queryKey: slotsQueryKey });
    return queryClient.getQueryData<SlotsApiResponse>(slotsQueryKey);
  };

  const rollbackSlots = (previous: SlotsApiResponse | undefined) => {
    if (previous) queryClient.setQueryData(slotsQueryKey, previous);
  };

  const updateTurfMutation = useMutation({
    mutationFn: (data: TurfSettingsPayload) => apiPatch<Turf>(`/turfs/${selectedTurfId}`, data),
    onMutate: async (data: TurfSettingsPayload) => {
      await queryClient.cancelQueries({ queryKey: ['my-turfs'] });
      const previous = queryClient.getQueryData<{ data: Turf[] }>(['my-turfs']);
      queryClient.setQueryData<{ data: Turf[] }>(['my-turfs'], (old) => {
        if (!old) return old;
        return { ...old, data: old.data.map(t => t._id === selectedTurfId ? { ...t, ...data } : t) };
      });
      onSettingsSaved();
      return { previous };
    },
    onError: (error: Error, _data, context) => {
      if (context?.previous) queryClient.setQueryData(['my-turfs'], context.previous);
      toast.error(error.message || 'Failed to save settings');
    },
    onSuccess: () => toast.success('Settings saved'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['my-turfs'] }),
  });

  const applyDefaultsMutation = useMutation({
    mutationFn: () => {
      const weekday = currentTurf?.defaultWeekdayPrice || 1000;
      const weekend = currentTurf?.defaultWeekendPrice || 1500;
      return apiPatch<null>('/slots', { turfId: selectedTurfId, weekdayPrice: weekday, weekendPrice: weekend });
    },
    onMutate: async () => {
      const previous = await snapshotSlots();
      const weekday = currentTurf?.defaultWeekdayPrice || 1000;
      const weekend = currentTurf?.defaultWeekendPrice || 1500;
      queryClient.setQueryData<SlotsApiResponse>(slotsQueryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map(s => {
            if (s.status !== 'AVAILABLE') return s;
            // IST, matching the server's $dayOfWeek timezone. Using the
            // browser's local day here made the optimistic price flip to the
            // wrong tier for early-morning IST slots, then silently correct
            // itself on refetch.
            const day = getISTDay(s.startTime);
            const isWeekend = day === 0 || day === 6;
            // weekday/weekend are per-hour rates and a slot is half an hour —
            // showing the hourly figure here optimistically displayed double
            // the price the server actually stores.
            return { ...s, price: hourlyRateToSlotPrice(isWeekend ? weekend : weekday) };
          })
        };
      });
      return { previous };
    },
    onError: (error: Error, _v, context) => {
      rollbackSlots(context?.previous);
      toast.error(error.message || 'Failed to apply default prices');
    },
    onSuccess: () => toast.success('Default prices applied to all available slots'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['slots-range', selectedTurfId] }),
  });

  const createSlotsMutation = useMutation({
    mutationFn: (data: CreateSlotsPayload) => apiPost<TimeSlot[]>('/slots', data),
    onMutate: async (data) => {
      const previous = await snapshotSlots();
      queryClient.setQueryData<SlotsApiResponse>(slotsQueryKey, (old) =>
        upsertSlotsInCache(old, data.slots.map(s => ({ ...s, status: 'AVAILABLE' as const })))
      );
      onBulkOrSlotCreated();
      return { previous };
    },
    onError: (error: Error, _data, context) => {
      rollbackSlots(context?.previous);
      toast.error(error.message || 'Failed to update slots');
    },
    onSuccess: () => toast.success('Slot updated'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['slots-range', selectedTurfId] }),
  });

  const setStatusMutation = useMutation({
    mutationFn: (data: { turfId: string; slots: { startTime: string; endTime: string }[]; status: SlotAction }) =>
      apiPatch<TimeSlot[]>('/slots/status', data),
    onMutate: async (data) => {
      const previous = await snapshotSlots();
      queryClient.setQueryData<SlotsApiResponse>(slotsQueryKey, (old) =>
        upsertSlotsInCache(old, data.slots.map(s => ({ ...s, status: data.status })))
      );
      onSelectionApplied();
      return { previous };
    },
    onError: (error: Error, _data, context) => {
      rollbackSlots(context?.previous);
      toast.error(error.message || 'Failed to update slot status');
    },
    onSuccess: (_data, variables) => {
      const label = STATUS_META[variables.status].label;
      toast.success(`Marked ${variables.slots.length} slot${variables.slots.length > 1 ? 's' : ''} as ${label}`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['slots-range', selectedTurfId] }),
  });

  const deleteSlotsMutation = useMutation({
    mutationFn: (date: string) => apiDelete<null>('/slots', { params: { turfId: selectedTurfId, date } }),
    onMutate: async (dateIso: string) => {
      const previous = await snapshotSlots();
      const target = parseDateKey(dateIso);
      queryClient.setQueryData<SlotsApiResponse>(slotsQueryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.filter(s => {
            const sd = new Date(s.startTime);
            const sameDay = sd.getFullYear() === target.getFullYear() && sd.getMonth() === target.getMonth() && sd.getDate() === target.getDate();
            return !(sameDay && s.status !== 'BOOKED');
          })
        };
      });
      onSelectionApplied();
      return { previous };
    },
    onError: (error: Error, _date, context) => {
      rollbackSlots(context?.previous);
      toast.error(error.message || 'Failed to clear slots');
    },
    onSuccess: () => toast.success('Slots cleared successfully'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['slots-range', selectedTurfId] }),
  });

  const isMutatingSlots = createSlotsMutation.isPending || setStatusMutation.isPending || deleteSlotsMutation.isPending;

  return {
    updateTurfMutation,
    applyDefaultsMutation,
    createSlotsMutation,
    setStatusMutation,
    deleteSlotsMutation,
    isMutatingSlots,
  };
}

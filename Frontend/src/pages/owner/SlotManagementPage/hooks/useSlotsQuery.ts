import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { TimeSlot } from '@/types';

export function useSlotsQuery(selectedTurfId: string, startDateStr: string, endDateStr: string) {
  const slotsQueryKey = useMemo(() => ['slots-range', selectedTurfId, startDateStr] as const, [selectedTurfId, startDateStr]);

  const { data: slotsResponse, isLoading: isLoadingSlots, isFetching: isFetchingSlots, isError: isSlotsError, refetch: refetchSlots } = useQuery({
    queryKey: slotsQueryKey,
    queryFn: () => apiGet<TimeSlot[]>(`/slots?turfId=${selectedTurfId}&startDate=${startDateStr}&endDate=${endDateStr}`),
    enabled: !!selectedTurfId,
  });

  const slots = slotsResponse?.data ?? [];

  return { slots, slotsQueryKey, isLoadingSlots, isFetchingSlots, isSlotsError, refetchSlots };
}

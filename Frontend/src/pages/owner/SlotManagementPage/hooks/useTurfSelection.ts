import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { Turf } from '@/types';

export function useTurfSelection() {
  const [selectedTurfId, setSelectedTurfId] = useState('');

  const { data: turfsResponse, isLoading: isLoadingTurfs, isError: isTurfsError, refetch: refetchTurfs } = useQuery({
    queryKey: ['my-turfs'],
    queryFn: () => apiGet<Turf[]>('/turfs/my-turfs'),
  });

  const turfs = turfsResponse?.data ?? [];
  const currentTurf = turfs.find(t => t._id === selectedTurfId);

  // Auto-select the first turf once turfs load (effect, not during render).
  useEffect(() => {
    if (turfs.length > 0 && !turfs.some(t => t._id === selectedTurfId)) {
      setSelectedTurfId(turfs[0]._id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turfs.length]);

  return {
    turfs,
    currentTurf,
    selectedTurfId,
    setSelectedTurfId,
    isLoadingTurfs,
    isTurfsError,
    refetchTurfs,
  };
}

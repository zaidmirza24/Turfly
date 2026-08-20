import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Turf, TimeSlot } from '@/types';
import { Loader2, Plus, Calendar as CalendarIcon, Sparkles, Trash2, Info, Settings, Zap, ChevronLeft, ChevronRight, Ban, UserCheck, CheckCircle2, Pencil, X, AlertTriangle, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type SlotAction = 'AVAILABLE' | 'CLOSED' | 'FULL';
type SlotsApiResponse = { data: TimeSlot[] };

const STATUS_META: Record<string, { label: string; barClass: string; badgeClass: string }> = {
  NONE: { label: 'Not Set', barClass: 'bg-transparent border-dashed border-border hover:border-primary/40', badgeClass: 'bg-muted text-muted-foreground' },
  AVAILABLE: { label: 'Available', barClass: 'bg-primary/10 border-primary/30 hover:bg-primary/20', badgeClass: 'bg-primary/20 text-primary' },
  CLOSED: { label: 'Closed', barClass: 'bg-muted border-border', badgeClass: 'bg-muted-foreground/20 text-muted-foreground' },
  FULL: { label: 'Full', barClass: 'bg-warning/10 border-warning/30', badgeClass: 'bg-warning/20 text-warning' },
  BOOKED: { label: 'Booked', barClass: 'bg-destructive/10 border-destructive/20 opacity-60 cursor-not-allowed', badgeClass: 'bg-destructive/20 text-destructive' },
  LOCKED: { label: 'Locked', barClass: 'bg-warning/5 border-warning/10 opacity-60 cursor-not-allowed', badgeClass: 'bg-warning/20 text-warning' },
};

const sameLocalHour = (isoTime: string, date: Date, hour: number) => {
  const t = new Date(isoTime);
  return t.getFullYear() === date.getFullYear() && t.getMonth() === date.getMonth() && t.getDate() === date.getDate() && t.getHours() === hour;
};

export default function SlotManagementPage() {
  const queryClient = useQueryClient();
  const [selectedTurfId, setSelectedTurfId] = useState('');
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const { data: turfsResponse, isLoading: isLoadingTurfs, isError: isTurfsError, refetch: refetchTurfs } = useQuery({
    queryKey: ['my-turfs'],
    queryFn: () => api.get('/turfs/my-turfs'),
  });

  const turfs = (turfsResponse as any)?.data as Turf[] || [];
  const currentTurf = turfs.find(t => t._id === selectedTurfId);

  // Auto-select the first turf once turfs load (effect, not during render).
  useEffect(() => {
    if (turfs.length > 0 && !turfs.some(t => t._id === selectedTurfId)) {
      setSelectedTurfId(turfs[0]._id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turfs.length]);

  // Operating hours settings state (local to dialog)
  const [is24x7, setIs24x7] = useState(true);
  const [openHour, setOpenHour] = useState(6);
  const [closeHour, setCloseHour] = useState(22);

  useEffect(() => {
    if (currentTurf) {
      setIs24x7(currentTurf.is24x7 ?? true);
      setOpenHour(currentTurf.openHour ?? 6);
      setCloseHour(currentTurf.closeHour ?? 22);
    }
  }, [selectedTurfId, currentTurf]);

  // Bulk form state
  const [bulkConfig, setBulkConfig] = useState({
    startDate: new Date().toISOString().split('T')[0],
    days: 7,
    startHour: 0,
    endHour: 23,
    weekdayPrice: 1000,
    weekendPrice: 1500
  });

  // Pre-fill from turf defaults / operating hours
  useEffect(() => {
    if (currentTurf) {
      setBulkConfig(prev => ({
        ...prev,
        startHour: currentTurf.is24x7 === false ? (currentTurf.openHour ?? prev.startHour) : 0,
        endHour: currentTurf.is24x7 === false ? (currentTurf.closeHour ?? prev.endHour) : 23,
        weekdayPrice: currentTurf.defaultWeekdayPrice || currentTurf.pricePerHour || 1000,
        weekendPrice: currentTurf.defaultWeekendPrice || (currentTurf.pricePerHour ? currentTurf.pricePerHour * 1.5 : 1500)
      }));
    }
  }, [selectedTurfId, currentTurf]);

  const [viewDate, setViewDate] = useState(new Date());
  const [activeDayIndex, setActiveDayIndex] = useState(0);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(viewDate);
      d.setDate(viewDate.getDate() + i);
      return d;
    });
  }, [viewDate]);

  const activeDay = days[activeDayIndex] || days[0];

  const handleNextWeek = () => {
    const next = new Date(viewDate);
    next.setDate(viewDate.getDate() + 7);
    setViewDate(next);
    setActiveDayIndex(0);
  };

  const handlePrevWeek = () => {
    const prev = new Date(viewDate);
    prev.setDate(viewDate.getDate() - 7);
    setViewDate(prev);
    setActiveDayIndex(0);
  };

  const startDateStr = viewDate.toISOString().split('T')[0];
  const endDate = new Date(viewDate);
  endDate.setDate(viewDate.getDate() + 7);
  const endDateStr = endDate.toISOString().split('T')[0];

  const slotsQueryKey = useMemo(() => ['slots-range', selectedTurfId, startDateStr] as const, [selectedTurfId, startDateStr]);

  const { data: slotsResponse, isLoading: isLoadingSlots, isFetching: isFetchingSlots, isError: isSlotsError, refetch: refetchSlots } = useQuery({
    queryKey: slotsQueryKey,
    queryFn: () => api.get(`/slots?turfId=${selectedTurfId}&startDate=${startDateStr}&endDate=${endDateStr}`),
    enabled: !!selectedTurfId,
  });

  const slots = (slotsResponse as any)?.data as TimeSlot[] || [];

  // ── Optimistic cache helpers ──
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
    mutationFn: (data: any) => api.patch(`/turfs/${selectedTurfId}`, data),
    onMutate: async (data: any) => {
      await queryClient.cancelQueries({ queryKey: ['my-turfs'] });
      const previous = queryClient.getQueryData<{ data: Turf[] }>(['my-turfs']);
      queryClient.setQueryData<{ data: Turf[] }>(['my-turfs'], (old) => {
        if (!old) return old;
        return { ...old, data: old.data.map(t => t._id === selectedTurfId ? { ...t, ...data } : t) };
      });
      setIsSettingsOpen(false);
      return { previous };
    },
    onError: (error: any, _data, context) => {
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
      return api.patch('/slots', { turfId: selectedTurfId, weekdayPrice: weekday, weekendPrice: weekend });
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
            const day = new Date(s.startTime).getDay();
            const isWeekend = day === 0 || day === 6;
            return { ...s, price: isWeekend ? weekend : weekday };
          })
        };
      });
      return { previous };
    },
    onError: (error: any, _v, context) => {
      rollbackSlots(context?.previous);
      toast.error(error.message || 'Failed to apply default prices');
    },
    onSuccess: () => toast.success('Default prices applied to all available slots'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['slots-range', selectedTurfId] }),
  });

  const createSlotsMutation = useMutation({
    mutationFn: (data: { turfId: string; slots: { startTime: string; endTime: string; price: number }[] }) => api.post('/slots', data),
    onMutate: async (data) => {
      const previous = await snapshotSlots();
      queryClient.setQueryData<SlotsApiResponse>(slotsQueryKey, (old) =>
        upsertSlotsInCache(old, data.slots.map(s => ({ ...s, status: 'AVAILABLE' as const })))
      );
      setIsBulkOpen(false);
      setEditingSlot(null);
      return { previous };
    },
    onError: (error: any, _data, context) => {
      rollbackSlots(context?.previous);
      toast.error(error.message || 'Failed to update slots');
    },
    onSuccess: () => toast.success('Slot updated'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['slots-range', selectedTurfId] }),
  });

  const setStatusMutation = useMutation({
    mutationFn: (data: { turfId: string; slots: { startTime: string; endTime: string }[]; status: SlotAction }) =>
      api.patch('/slots/status', data),
    onMutate: async (data) => {
      const previous = await snapshotSlots();
      queryClient.setQueryData<SlotsApiResponse>(slotsQueryKey, (old) =>
        upsertSlotsInCache(old, data.slots.map(s => ({ ...s, status: data.status })))
      );
      clearSelection();
      return { previous };
    },
    onError: (error: any, _data, context) => {
      rollbackSlots(context?.previous);
      toast.error(error.message || 'Failed to update slot status');
    },
    onSuccess: (_data, variables) => {
      const label = STATUS_META[variables.status].label;
      toast.success(`Marked ${variables.slots.length} hour${variables.slots.length > 1 ? 's' : ''} as ${label}`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['slots-range', selectedTurfId] }),
  });

  const deleteSlotsMutation = useMutation({
    mutationFn: (date: string) => api.delete('/slots', { params: { turfId: selectedTurfId, date } }),
    onMutate: async (dateIso: string) => {
      const previous = await snapshotSlots();
      const target = new Date(dateIso);
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
      clearSelection();
      return { previous };
    },
    onError: (error: any, _date, context) => {
      rollbackSlots(context?.previous);
      toast.error(error.message || 'Failed to clear slots');
    },
    onSuccess: () => toast.success('Slots cleared successfully'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['slots-range', selectedTurfId] }),
  });

  const isMutatingSlots = createSlotsMutation.isPending || setStatusMutation.isPending || deleteSlotsMutation.isPending;

  // Hours shown for the active day, based on the turf's operating hours
  const hours = useMemo(() => {
    if (!currentTurf || currentTurf.is24x7 !== false) {
      return Array.from({ length: 24 }, (_, i) => i);
    }
    const start = currentTurf.openHour ?? 0;
    const end = currentTurf.closeHour ?? 23;
    const list = [];
    for (let h = start; h <= end; h++) list.push(h);
    return list;
  }, [currentTurf]);

  const getSlotForHour = (date: Date, hour: number) => {
    return slots.find(s => sameLocalHour(s.startTime, date, hour));
  };

  // ── Drag-to-select across hour rows for the active day (mouse + touch) ──
  const [selectedHours, setSelectedHours] = useState<number[]>([]);
  const isDragging = useRef(false);
  const dragAnchor = useRef<number | null>(null);

  const clearSelection = () => setSelectedHours([]);

  useEffect(() => {
    clearSelection();
  }, [activeDayIndex, selectedTurfId]);

  const isHourLocked = (date: Date, hour: number) => {
    const slot = getSlotForHour(date, hour);
    return slot?.status === 'BOOKED' || slot?.status === 'LOCKED';
  };

  const handleRowMouseDown = (hour: number) => {
    if (isMutatingSlots || isHourLocked(activeDay, hour)) return;
    isDragging.current = true;
    dragAnchor.current = hour;
    setSelectedHours([hour]);
  };

  const handleRowMouseEnter = (hour: number) => {
    if (!isDragging.current || dragAnchor.current === null) return;
    if (isHourLocked(activeDay, hour)) return;
    const start = Math.min(dragAnchor.current, hour);
    const end = Math.max(dragAnchor.current, hour);
    const range = [];
    for (let h = start; h <= end; h++) {
      if (!isHourLocked(activeDay, h)) range.push(h);
    }
    setSelectedHours(range);
  };

  useEffect(() => {
    const stopDrag = () => { isDragging.current = false; };
    window.addEventListener('mouseup', stopDrag);
    window.addEventListener('touchend', stopDrag);
    window.addEventListener('touchcancel', stopDrag);
    return () => {
      window.removeEventListener('mouseup', stopDrag);
      window.removeEventListener('touchend', stopDrag);
      window.removeEventListener('touchcancel', stopDrag);
    };
  }, []);

  const handleTimelineTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const el = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null;
    const hourAttr = el?.closest('[data-hour]')?.getAttribute('data-hour');
    if (hourAttr !== null && hourAttr !== undefined) {
      handleRowMouseEnter(Number(hourAttr));
    }
  };

  const applyStatusToSelection = (status: SlotAction) => {
    if (selectedHours.length === 0 || isMutatingSlots) return;
    const slotPayload = selectedHours.map(h => {
      const start = new Date(activeDay);
      start.setHours(h, 0, 0, 0);
      const end = new Date(start);
      end.setHours(h + 1, 0, 0, 0);
      return { startTime: start.toISOString(), endTime: end.toISOString() };
    });
    setStatusMutation.mutate({ turfId: selectedTurfId, slots: slotPayload, status });
  };

  const handleBulkGenerate = () => {
    if (bulkConfig.days < 1 || bulkConfig.startHour > bulkConfig.endHour) {
      toast.error('Check your duration and hour range before generating.');
      return;
    }

    const newSlots = [];
    const start = new Date(bulkConfig.startDate);

    for (let i = 0; i < bulkConfig.days; i++) {
      const currentDate = new Date(start);
      currentDate.setDate(start.getDate() + i);

      const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
      const price = isWeekend ? bulkConfig.weekendPrice : bulkConfig.weekdayPrice;

      for (let h = bulkConfig.startHour; h <= bulkConfig.endHour; h++) {
        const startTime = new Date(currentDate);
        startTime.setHours(h, 0, 0, 0);

        const endTime = new Date(startTime);
        endTime.setHours(h + 1, 0, 0, 0);

        newSlots.push({
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          price: Number(price)
        });
      }
    }

    createSlotsMutation.mutate({
      turfId: selectedTurfId,
      slots: newSlots
    });
  };

  const [editingSlot, setEditingSlot] = useState<{ date: Date, hour: number, price: number } | null>(null);

  const openPriceEditor = (date: Date, hour: number) => {
    if (isMutatingSlots) return;
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const existing = getSlotForHour(date, hour);
    const defaultPrice = isWeekend ? currentTurf?.defaultWeekendPrice : currentTurf?.defaultWeekdayPrice;
    setEditingSlot({ date, hour, price: existing?.price ?? Number(defaultPrice || currentTurf?.pricePerHour || 1000) });
  };

  const saveSlotPrice = (price: number) => {
    if (!editingSlot) return;
    if (!Number.isFinite(price) || price < 0) {
      toast.error('Enter a valid price');
      return;
    }
    const { date, hour } = editingSlot;
    const startTime = new Date(date);
    startTime.setHours(hour, 0, 0, 0);
    const endTime = new Date(startTime);
    endTime.setHours(hour + 1, 0, 0, 0);

    createSlotsMutation.mutate({
      turfId: selectedTurfId,
      slots: [{
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        price: Number(price)
      }]
    });
  };

  if (isLoadingTurfs) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" /></div>;

  if (isTurfsError) {
    return (
      <div className="text-center py-24 border-2 border-dashed rounded-[3rem] bg-destructive/5 border-destructive/20">
        <AlertTriangle size={40} className="text-destructive/60 mx-auto mb-4" />
        <h3 className="text-xl font-bold mb-2">Couldn't load your arenas</h3>
        <p className="text-muted-foreground font-medium mb-6">Check your connection and try again.</p>
        <Button onClick={() => refetchTurfs()} className="rounded-2xl gap-2 px-8">
          <RefreshCw size={16} /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter">Slot Management</h1>
          <p className="text-muted-foreground font-medium mt-1">Schedule availability and set pricing for your arenas.</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="rounded-full gap-2 h-12 px-6 border-primary/20 hover:bg-primary/5 transition-all card-hover glass">
                <Settings size={18} className="text-primary" />
                <span className="font-bold tracking-tight">Turf Settings</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-[2.5rem] sm:max-w-[450px] p-0 overflow-hidden border-none shadow-2xl">
              <div className="bg-gradient-to-br from-primary/20 via-background to-background p-8">
                <DialogHeader className="mb-8">
                  <DialogTitle className="text-3xl font-black tracking-tighter">Turf Settings</DialogTitle>
                  <DialogDescription className="text-muted-foreground font-medium">
                    Set your operating hours and standard rates.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-muted">
                    <div>
                      <div className="text-sm font-bold">Open 24 Hours</div>
                      <div className="text-[10px] text-muted-foreground font-medium">This turf never closes</div>
                    </div>
                    <Switch checked={is24x7} onCheckedChange={setIs24x7} />
                  </div>

                  {!is24x7 && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Opens At</Label>
                        <Input
                          type="number" min={0} max={23}
                          value={openHour}
                          onChange={(e) => setOpenHour(Number(e.target.value))}
                          className="h-14 rounded-2xl bg-muted border-none font-bold"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Closes At</Label>
                        <Input
                          type="number" min={0} max={23}
                          value={closeHour}
                          onChange={(e) => setCloseHour(Number(e.target.value))}
                          className="h-14 rounded-2xl bg-muted border-none font-bold"
                        />
                      </div>
                    </div>
                  )}

                  <div className="h-[1px] bg-border" />

                  <div className="group space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Weekday Standard</Label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-bold">₹</div>
                      <Input
                        type="number"
                        defaultValue={currentTurf?.defaultWeekdayPrice || 1000}
                        id="defWeekday"
                        className="h-14 pl-10 rounded-2xl bg-muted border-2 border-transparent focus-visible:ring-primary focus-visible:border-primary transition-all text-lg font-bold"
                      />
                    </div>
                  </div>

                  <div className="group space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Weekend Premium</Label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-bold">₹</div>
                      <Input
                        type="number"
                        defaultValue={currentTurf?.defaultWeekendPrice || 1500}
                        id="defWeekend"
                        className="h-14 pl-10 rounded-2xl bg-primary/5 border-2 border-primary/20 focus-visible:ring-primary transition-all text-lg font-bold"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => {
                        if (confirm('Apply these prices to all existing unbooked slots?')) {
                          applyDefaultsMutation.mutate();
                        }
                      }}
                      disabled={applyDefaultsMutation.isPending}
                      className="w-full p-4 rounded-2xl bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-all flex items-center justify-between group disabled:opacity-50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary text-primary-foreground">
                          {applyDefaultsMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                        </div>
                        <div className="text-left">
                          <div className="text-sm font-bold">Sync Schedule</div>
                          <div className="text-[10px] text-muted-foreground font-medium">Apply rates to all available slots</div>
                        </div>
                      </div>
                      <Plus size={16} className="text-primary transition-transform group-hover:rotate-90" />
                    </button>
                  </div>
                </div>

                <DialogFooter className="mt-10 gap-3">
                  <Button variant="ghost" onClick={() => setIsSettingsOpen(false)} className="rounded-xl font-bold h-12 flex-1">Cancel</Button>
                  <Button
                    disabled={updateTurfMutation.isPending}
                    onClick={() => {
                      const weekday = (document.getElementById('defWeekday') as HTMLInputElement).value;
                      const weekend = (document.getElementById('defWeekend') as HTMLInputElement).value;
                      if (!is24x7 && Number(openHour) > Number(closeHour)) {
                        toast.error('Opening hour must be before closing hour');
                        return;
                      }
                      updateTurfMutation.mutate({
                        defaultWeekdayPrice: Number(weekday),
                        defaultWeekendPrice: Number(weekend),
                        is24x7,
                        openHour: is24x7 ? 0 : Number(openHour),
                        closeHour: is24x7 ? 23 : Number(closeHour),
                      });
                    }}
                    className="gradient-primary rounded-xl h-12 flex-1 font-bold shadow-lg shadow-primary/20"
                  >
                    {updateTurfMutation.isPending ? <Loader2 className="animate-spin" size={18} /> : 'Save Changes'}
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isBulkOpen} onOpenChange={setIsBulkOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary rounded-full shadow-lg shadow-primary/20 gap-2 h-12 px-8 font-bold card-hover">
                <Sparkles size={18} /> Bulk Generator
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl sm:max-w-[450px]">
              <div className="bg-gradient-to-br from-primary/10 via-background to-background p-8">
                <DialogHeader className="mb-8">
                  <DialogTitle className="text-3xl font-black tracking-tighter">Mass Schedule</DialogTitle>
                  <DialogDescription className="text-muted-foreground font-medium">
                    Generate weeks of inventory in a single click.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                  <div className="grid gap-2">
                    <Label htmlFor="startDate" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Start From</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={bulkConfig.startDate}
                      onChange={(e) => setBulkConfig({...bulkConfig, startDate: e.target.value})}
                      className="h-14 rounded-2xl bg-muted border-none font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="days" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Duration (Days)</Label>
                      <Input
                        id="days"
                        type="number"
                        min={1}
                        value={bulkConfig.days}
                        onChange={(e) => setBulkConfig({...bulkConfig, days: Number(e.target.value)})}
                        className="h-14 rounded-2xl bg-muted border-none font-bold"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="startHour" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Daily Start</Label>
                      <Input
                        id="startHour"
                        type="number"
                        min={0} max={23}
                        value={bulkConfig.startHour}
                        onChange={(e) => setBulkConfig({...bulkConfig, startHour: Number(e.target.value)})}
                        className="h-14 rounded-2xl bg-muted border-none font-bold"
                      />
                    </div>
                  </div>

                  <div className="p-5 rounded-3xl glass border-primary/10 space-y-5">
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-primary" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Rate Configuration</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-bold opacity-50 ml-1">Weekday</Label>
                        <Input
                          type="number"
                          value={bulkConfig.weekdayPrice}
                          onChange={(e) => setBulkConfig({...bulkConfig, weekdayPrice: Number(e.target.value)})}
                          className="h-12 rounded-xl bg-muted border-none font-bold"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-bold text-primary ml-1">Weekend</Label>
                        <Input
                          type="number"
                          value={bulkConfig.weekendPrice}
                          onChange={(e) => setBulkConfig({...bulkConfig, weekendPrice: Number(e.target.value)})}
                          className="h-12 rounded-xl bg-muted border-primary/10 border font-bold"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="endHour" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Daily End</Label>
                    <Input
                      id="endHour"
                      type="number"
                      min={0} max={23}
                      value={bulkConfig.endHour}
                      onChange={(e) => setBulkConfig({...bulkConfig, endHour: Number(e.target.value)})}
                      className="h-14 rounded-2xl bg-muted border-none font-bold"
                    />
                  </div>
                </div>

                <DialogFooter className="mt-10 gap-3">
                  <Button variant="ghost" onClick={() => setIsBulkOpen(false)} className="rounded-xl font-bold h-12 flex-1">Discard</Button>
                  <Button
                    onClick={handleBulkGenerate}
                    disabled={createSlotsMutation.isPending}
                    className="gradient-primary rounded-xl h-12 flex-1 font-bold shadow-lg shadow-primary/20"
                  >
                    {createSlotsMutation.isPending ? <Loader2 className="animate-spin" size={18} /> : 'Build Schedule'}
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {turfs.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed rounded-[3rem] bg-muted/10 border-primary/10 backdrop-blur-sm">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <CalendarIcon size={40} className="text-primary/40" />
          </div>
          <h3 className="text-xl font-bold mb-2">No Arenas Listed</h3>
          <p className="text-muted-foreground font-medium mb-6 max-w-xs mx-auto">You need to list a turf before you can manage its schedule and pricing.</p>
          <Button variant="default" className="gradient-primary rounded-2xl px-8 shadow-lg shadow-primary/20">Add Your First Turf</Button>
        </div>
      ) : (
        <div className="space-y-6 pb-24">
          <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-none px-1">
            {turfs.map(t => (
              <Button
                key={t._id}
                variant={selectedTurfId === t._id ? 'default' : 'outline'}
                className={cn('rounded-full h-12 px-8 font-black transition-all',
                  selectedTurfId === t._id ? 'gradient-primary shadow-xl shadow-primary/30 border-none scale-105' : 'glass hover:bg-accent hover:border-primary/30 text-muted-foreground hover:text-foreground')}
                onClick={() => setSelectedTurfId(t._id)}
              >
                {t.name}
              </Button>
            ))}
          </div>

          {currentTurf && currentTurf.is24x7 === false && (
            <div className="flex items-center gap-2 px-4 text-xs font-bold text-muted-foreground">
              <Zap size={14} className="text-primary" />
              Operating hours: {String(currentTurf.openHour ?? 0).padStart(2, '0')}:00 – {String((currentTurf.closeHour ?? 23) + 1).padStart(2, '0')}:00
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 glass p-4 rounded-[2rem] shadow-xl">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handlePrevWeek} className="rounded-xl h-11 px-4 hover:bg-accent text-muted-foreground hover:text-foreground">
                <ChevronLeft size={18} className="mr-1" /> Prev Week
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setViewDate(new Date()); setActiveDayIndex(0); }} className="rounded-xl h-11 px-6 hover:bg-accent font-black text-[10px] uppercase tracking-widest">
                Today
              </Button>
              <Button variant="ghost" size="sm" onClick={handleNextWeek} className="rounded-xl h-11 px-4 hover:bg-accent text-muted-foreground hover:text-foreground">
                Next Week <ChevronRight size={18} className="ml-1" />
              </Button>
            </div>

            <div className="flex items-center gap-4">
              {isFetchingSlots && !isLoadingSlots && (
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              )}
              <div className="h-8 w-[1px] bg-border mx-2" />
              <div className="relative group">
                <CalendarIcon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-primary opacity-60 group-focus-within:opacity-100 transition-opacity" />
                <input
                  type="date"
                  value={viewDate.toISOString().split('T')[0]}
                  onChange={(e) => { if (e.target.value) { setViewDate(new Date(e.target.value)); setActiveDayIndex(0); } }}
                  className="bg-primary/5 border-2 border-transparent focus:border-primary/20 rounded-xl h-11 pl-10 pr-4 outline-none font-bold text-xs transition-all w-40"
                />
              </div>
            </div>
          </div>

          {/* Day switcher */}
          <div className="grid grid-cols-7 gap-2">
            {days.map((d, i) => {
              const isActive = i === activeDayIndex;
              const isToday = d.toDateString() === new Date().toDateString();
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => setActiveDayIndex(i)}
                  className={cn('rounded-2xl p-3 text-center transition-all border-2',
                    isActive ? 'gradient-primary border-transparent shadow-lg shadow-primary/20 text-primary-foreground scale-105' :
                    'glass border-transparent hover:border-primary/20 text-foreground')}
                >
                  <div className={cn('text-[9px] font-black uppercase tracking-widest mb-1', isActive ? 'opacity-80' : 'text-muted-foreground')}>
                    {d.toLocaleDateString('en', { weekday: 'short' })}
                  </div>
                  <div className="text-xl font-black tracking-tighter">{d.getDate()}</div>
                  {isToday && !isActive && <div className="w-1 h-1 rounded-full bg-primary mx-auto mt-1" />}
                </button>
              );
            })}
          </div>

          {/* Active day header + actions */}
          <div className="flex items-center justify-between px-2">
            <div>
              <div className="text-2xl font-black tracking-tighter">{activeDay.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">Drag across hours to bulk-set status</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={deleteSlotsMutation.isPending}
              className="rounded-xl h-10 px-4 text-destructive hover:bg-destructive/10 gap-2"
              onClick={() => {
                if (confirm(`Clear all slots for ${activeDay.toLocaleDateString()}?`)) {
                  deleteSlotsMutation.mutate(activeDay.toISOString());
                }
              }}
            >
              {deleteSlotsMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Clear Day
            </Button>
          </div>

          {/* Day timeline */}
          <div className="relative glass border-primary/10 rounded-[2.5rem] overflow-hidden shadow-2xl shadow-black/20 select-none">
            {isSlotsError ? (
              <div className="text-center py-16">
                <AlertTriangle size={32} className="text-destructive/60 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium mb-4">Couldn't load this week's schedule.</p>
                <Button variant="outline" size="sm" onClick={() => refetchSlots()} className="rounded-xl gap-2">
                  <RefreshCw size={14} /> Retry
                </Button>
              </div>
            ) : isLoadingSlots ? (
              <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>
            ) : (
              <div
                className={cn('divide-y divide-border transition-opacity', isMutatingSlots && 'opacity-70 pointer-events-none')}
                onTouchMove={handleTimelineTouchMove}
              >
                {hours.map(h => {
                  const slot = getSlotForHour(activeDay, h);
                  const status = slot?.status || 'NONE';
                  const meta = STATUS_META[status] || STATUS_META.NONE;
                  const isSelected = selectedHours.includes(h);
                  const isLocked = status === 'BOOKED' || status === 'LOCKED';
                  const timeLabel = `${h.toString().padStart(2, '0')}:00 – ${((h + 1) % 24).toString().padStart(2, '0')}:00`;

                  return (
                    <div
                      key={h}
                      data-hour={h}
                      onMouseDown={() => handleRowMouseDown(h)}
                      onMouseEnter={() => handleRowMouseEnter(h)}
                      onTouchStart={() => handleRowMouseDown(h)}
                      className={cn('flex items-center gap-4 px-6 py-4 transition-colors cursor-pointer',
                        isSelected ? 'bg-primary/10' : 'hover:bg-muted/40',
                        isLocked && 'cursor-not-allowed')}
                    >
                      <div className="w-24 shrink-0 font-black text-sm tracking-tighter text-muted-foreground">
                        {timeLabel}
                      </div>

                      <div className={cn('flex-1 h-11 rounded-2xl border-2 flex items-center px-4 transition-all', meta.barClass)}>
                        <span className={cn('text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full', meta.badgeClass)}>
                          {meta.label}
                        </span>
                        {status === 'BOOKED' && (
                          <span className="ml-auto text-[10px] font-bold text-destructive flex items-center gap-1">
                            <UserCheck size={12} /> Customer booking
                          </span>
                        )}
                      </div>

                      <div className="w-24 shrink-0 text-right font-black text-lg tracking-tighter flex items-center justify-end gap-2">
                        {slot ? <>₹{slot.price}</> : <span className="text-muted-foreground/30 text-sm">—</span>}
                        {!isLocked && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openPriceEditor(activeDay, h); }}
                            className="p-1.5 rounded-full hover:bg-primary/10 text-primary/60 hover:text-primary transition-colors"
                            title="Edit price"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 p-6 rounded-[2rem] glass border-primary/10 text-sm text-muted-foreground max-w-2xl">
            <div className="p-2 rounded-full bg-primary/10 text-primary">
              <Info size={18} />
            </div>
            <p><strong>Tip:</strong> Click and drag across hours to select a range, then mark it <strong>Closed</strong> (turf not operating) or <strong>Full</strong> (booked outside the app). Use the pencil icon to set a custom price for a single hour.</p>
          </div>
        </div>
      )}

      {/* Floating bulk-status toolbar */}
      {selectedHours.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 glass border-primary/20 rounded-full shadow-2xl px-3 py-2 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4">
          <span className="text-xs font-black px-3 text-muted-foreground">
            {setStatusMutation.isPending ? <Loader2 size={14} className="animate-spin inline" /> : `${selectedHours.length} hour${selectedHours.length > 1 ? 's' : ''}`}
          </span>
          <Button
            size="sm"
            className="rounded-full h-9 px-4 bg-primary/10 text-primary hover:bg-primary/20 gap-1.5 font-bold"
            disabled={setStatusMutation.isPending}
            onClick={() => applyStatusToSelection('AVAILABLE')}
          >
            <CheckCircle2 size={14} /> Available
          </Button>
          <Button
            size="sm"
            className="rounded-full h-9 px-4 bg-muted text-muted-foreground hover:bg-muted/70 gap-1.5 font-bold"
            disabled={setStatusMutation.isPending}
            onClick={() => applyStatusToSelection('CLOSED')}
          >
            <Ban size={14} /> Closed
          </Button>
          <Button
            size="sm"
            className="rounded-full h-9 px-4 bg-warning/10 text-warning hover:bg-warning/20 gap-1.5 font-bold"
            disabled={setStatusMutation.isPending}
            onClick={() => applyStatusToSelection('FULL')}
          >
            <UserCheck size={14} /> Full
          </Button>
          <button
            onClick={clearSelection}
            disabled={setStatusMutation.isPending}
            className="p-2 rounded-full hover:bg-muted text-muted-foreground ml-1 disabled:opacity-40"
            title="Clear selection"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {editingSlot && (
        <Dialog open={!!editingSlot} onOpenChange={(open) => { if (!open) setEditingSlot(null); }}>
          <DialogContent className="rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl sm:max-w-[400px]">
            <div className="bg-gradient-to-br from-primary/20 via-background to-background p-8">
              <DialogHeader className="mb-6">
                <DialogTitle className="text-2xl font-black tracking-tighter">Set Slot Price</DialogTitle>
                <DialogDescription className="text-muted-foreground font-medium uppercase text-[10px] tracking-widest">
                  {editingSlot.date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })} @ {editingSlot.hour}:00
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                <div className="group space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Price per Hour</Label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-bold text-xl">₹</div>
                    <Input
                      type="number"
                      autoFocus
                      min={0}
                      defaultValue={editingSlot.price}
                      id="slotPriceInput"
                      className="h-16 pl-10 rounded-2xl bg-muted border-2 border-transparent focus-visible:border-primary/30 focus-visible:ring-0 transition-all text-2xl font-black"
                      onKeyDown={(e) => e.key === 'Enter' && saveSlotPrice(Number((e.target as HTMLInputElement).value))}
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="mt-8 gap-3">
                <Button variant="ghost" onClick={() => setEditingSlot(null)} className="rounded-xl font-bold h-12 flex-1">Cancel</Button>
                <Button
                  disabled={createSlotsMutation.isPending}
                  onClick={() => {
                    const price = (document.getElementById('slotPriceInput') as HTMLInputElement).value;
                    saveSlotPrice(Number(price));
                  }}
                  className="gradient-primary rounded-xl h-12 flex-1 font-bold shadow-lg shadow-primary/20"
                >
                  {createSlotsMutation.isPending ? <Loader2 className="animate-spin" size={18} /> : 'Confirm Slot'}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { AlertTriangle, Calendar as CalendarIcon, Info, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TimeSlot } from '@/types';
import { getISTDay, toDateKey } from '@/lib/dateKey';

import { useTurfSelection } from './hooks/useTurfSelection';
import { useWeekView } from './hooks/useWeekView';
import { useSlotsQuery } from './hooks/useSlotsQuery';
import { useSlotMutations } from './hooks/useSlotMutations';
import { useHourSelection } from './hooks/useHourSelection';
import { sameLocalHour, isPastBookableWindow, hourStart } from './utils';

import { TurfSettingsDialog } from './components/TurfSettingsDialog';
import { BulkGeneratorDialog } from './components/BulkGeneratorDialog';
import { BlockTimeModal } from './components/BlockTimeModal';
import { TurfTabs } from './components/TurfTabs';
import { WeekNavigator } from './components/WeekNavigator';
import { WeekOverview } from './components/WeekOverview';
import { DaySwitcher } from './components/DaySwitcher';
import { DayTimeline } from './components/DayTimeline';
import { BulkStatusToolbar } from './components/BulkStatusToolbar';
import { SlotPriceDialog, EditingSlot } from './components/SlotPriceDialog';

export default function SlotManagementPage() {
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<EditingSlot | null>(null);

  const { turfs, currentTurf, selectedTurfId, setSelectedTurfId, isLoadingTurfs, isTurfsError, refetchTurfs } = useTurfSelection();

  const {
    viewDate, days, activeDay, activeDayIndex, setActiveDayIndex,
    handleNextWeek, handlePrevWeek, goToToday, jumpToDate,
    startDateStr, endDateStr,
  } = useWeekView();

  const { slots, slotsQueryKey, isLoadingSlots, isFetchingSlots, isSlotsError, refetchSlots } = useSlotsQuery(selectedTurfId, startDateStr, endDateStr);

  const {
    updateTurfMutation, applyDefaultsMutation, createSlotsMutation, setStatusMutation, deleteSlotsMutation, isMutatingSlots,
  } = useSlotMutations({
    selectedTurfId,
    currentTurf,
    slotsQueryKey,
    onSettingsSaved: () => setIsSettingsOpen(false),
    onBulkOrSlotCreated: () => { setIsBulkOpen(false); setEditingSlot(null); },
    onSelectionApplied: () => clearSelection(),
  });

  // Half-hour marks shown for the active day, based on the turf's operating
  // hours — two rows (:00 and :30) per operating hour, matching the server's
  // own 30-minute slot grid (slot.service.js).
  const hours = useMemo(() => {
    const start = !currentTurf || currentTurf.is24x7 !== false ? 0 : (currentTurf.openHour ?? 0);
    const end = !currentTurf || currentTurf.is24x7 !== false ? 23 : (currentTurf.closeHour ?? 23);
    const list: number[] = [];
    for (let h = start; h <= end; h++) {
      list.push(h, h + 0.5);
    }
    return list;
  }, [currentTurf]);

  const getSlotForHour = (date: Date, hour: number): TimeSlot | undefined => {
    return slots.find(s => sameLocalHour(s.startTime, date, hour));
  };

  const {
    selectedHours, clearSelection, handleRowClick,
  } = useHourSelection({
    activeDay,
    getSlotForHour,
    isMutating: isMutatingSlots,
    resetKey: `${activeDayIndex}-${selectedTurfId}`,
  });

  const applyStatusToSelection = (status: 'AVAILABLE' | 'CLOSED' | 'FULL') => {
    if (selectedHours.length === 0 || isMutatingSlots) return;
    const slotPayload = selectedHours.map(h => {
      const start = hourStart(activeDay, h);
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      return { startTime: start.toISOString(), endTime: end.toISOString() };
    });
    setStatusMutation.mutate({ turfId: selectedTurfId, slots: slotPayload, status });
  };

  const openPriceEditor = (date: Date, hour: number) => {
    if (isMutatingSlots || isPastBookableWindow(date, hour)) return;
    const istDay = getISTDay(date.toISOString());
    const isWeekend = istDay === 0 || istDay === 6;
    const existing = getSlotForHour(date, hour);
    const hourlyDefault = isWeekend ? currentTurf?.defaultWeekendPrice : currentTurf?.defaultWeekdayPrice;
    // Half the hourly default — this dialog prices one 30-minute slot.
    const defaultPrice = Number(hourlyDefault || currentTurf?.pricePerHour || 1000) / 2;
    setEditingSlot({ date, hour, price: existing?.price ?? defaultPrice });
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
          <TurfSettingsDialog
            open={isSettingsOpen}
            onOpenChange={setIsSettingsOpen}
            currentTurf={currentTurf}
            updateTurfMutation={updateTurfMutation}
            applyDefaultsMutation={applyDefaultsMutation}
          />
          <BulkGeneratorDialog
            open={isBulkOpen}
            onOpenChange={setIsBulkOpen}
            selectedTurfId={selectedTurfId}
            currentTurf={currentTurf}
            createSlotsMutation={createSlotsMutation}
          />
          {selectedTurfId && (
            <BlockTimeModal
              selectedTurfId={selectedTurfId}
              defaultDate={activeDay}
              setStatusMutation={setStatusMutation}
            />
          )}
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
          <TurfTabs turfs={turfs} selectedTurfId={selectedTurfId} onSelect={setSelectedTurfId} />

          {currentTurf && currentTurf.is24x7 === false && (
            <div className="flex items-center gap-2 px-4 text-xs font-bold text-muted-foreground">
              <CalendarIcon size={14} className="text-primary" />
              Operating hours: {String(currentTurf.openHour ?? 0).padStart(2, '0')}:00 – {String((currentTurf.closeHour ?? 23) + 1).padStart(2, '0')}:00
            </div>
          )}

          <WeekNavigator
            viewDate={viewDate}
            onPrevWeek={handlePrevWeek}
            onNextWeek={handleNextWeek}
            onToday={goToToday}
            onJumpToDate={jumpToDate}
            isFetching={isFetchingSlots && !isLoadingSlots}
          />

          <WeekOverview
            days={days}
            hours={hours}
            activeDayIndex={activeDayIndex}
            getSlotForHour={getSlotForHour}
            onSelect={setActiveDayIndex}
          />

          <DaySwitcher days={days} activeDayIndex={activeDayIndex} onSelect={setActiveDayIndex} />

          <div className="flex items-center justify-between px-2">
            <div>
              <div className="text-2xl font-black tracking-tighter">{activeDay.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">Click hours to select, then bulk-set status</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={deleteSlotsMutation.isPending}
              className="rounded-xl h-10 px-4 text-destructive hover:bg-destructive/10 gap-2"
              onClick={() => {
                if (confirm(`Clear all slots for ${activeDay.toLocaleDateString()}?`)) {
                  deleteSlotsMutation.mutate(toDateKey(activeDay));
                }
              }}
            >
              {deleteSlotsMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Clear Day
            </Button>
          </div>

          <DayTimeline
            hours={hours}
            activeDay={activeDay}
            getSlotForHour={getSlotForHour}
            selectedHours={selectedHours}
            isMutating={isMutatingSlots}
            isLoading={isLoadingSlots}
            isError={isSlotsError}
            onRetry={() => refetchSlots()}
            onRowClick={handleRowClick}
            onEditPrice={openPriceEditor}
          />

          <div className="flex items-center gap-3 p-6 rounded-[2rem] glass border-primary/10 text-sm text-muted-foreground max-w-2xl">
            <div className="p-2 rounded-full bg-primary/10 text-primary">
              <Info size={18} />
            </div>
            <p><strong>Tip:</strong> Click hours to select them, then mark the selection <strong>Closed</strong> (turf not operating) or <strong>Full</strong> (booked outside the app). Use the pencil icon to set a custom price for a single hour.</p>
          </div>
        </div>
      )}

      <BulkStatusToolbar
        selectedHours={selectedHours}
        isPending={setStatusMutation.isPending}
        onApply={applyStatusToSelection}
        onClear={clearSelection}
      />

      <SlotPriceDialog
        editingSlot={editingSlot}
        onClose={() => setEditingSlot(null)}
        selectedTurfId={selectedTurfId}
        createSlotsMutation={createSlotsMutation}
      />
    </div>
  );
}

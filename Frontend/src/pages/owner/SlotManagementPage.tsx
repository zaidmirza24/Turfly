import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Turf, TimeSlot } from '@/types';
import { Loader2, Plus, Calendar as CalendarIcon, Sparkles, Trash2, Info, Settings, Zap, ChevronLeft, ChevronRight } from 'lucide-react';
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

export default function SlotManagementPage() {
  const queryClient = useQueryClient();
  const [selectedTurfId, setSelectedTurfId] = useState('');
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const { data: turfsResponse, isLoading: isLoadingTurfs } = useQuery({
    queryKey: ['my-turfs'],
    queryFn: () => api.get('/turfs/my-turfs'),
  });

  const turfs = (turfsResponse as any)?.data as Turf[] || [];
  const currentTurf = turfs.find(t => t._id === selectedTurfId);
  
  // Bulk form state
  const [bulkConfig, setBulkConfig] = useState({
    startDate: new Date().toISOString().split('T')[0],
    days: 7,
    startHour: 0,
    endHour: 23,
    weekdayPrice: 1000,
    weekendPrice: 1500
  });

  // Pre-fill from turf defaults
  useEffect(() => {
    if (currentTurf) {
      setBulkConfig(prev => ({
        ...prev,
        weekdayPrice: (currentTurf as any).defaultWeekdayPrice || (currentTurf as any).pricePerHour || 1000,
        weekendPrice: (currentTurf as any).defaultWeekendPrice || ((currentTurf as any).pricePerHour ? (currentTurf as any).pricePerHour * 1.5 : 1500)
      }));
    }
  }, [selectedTurfId, currentTurf]);

  const updateTurfMutation = useMutation({
    mutationFn: (data: any) => api.patch(`/turfs/${selectedTurfId}`, data),
    onSuccess: () => {
      toast.success('Pricing defaults saved');
      queryClient.invalidateQueries({ queryKey: ['my-turfs'] });
      setIsSettingsOpen(false);
    }
  });

  const applyDefaultsMutation = useMutation({
    mutationFn: async () => {
      const weekday = (currentTurf as any)?.defaultWeekdayPrice || 1000;
      const weekend = (currentTurf as any)?.defaultWeekendPrice || 1500;
      
      await api.patch('/slots', { turfId: selectedTurfId, weekdayPrice: weekday, weekendPrice: weekend });
      toast.success('Default prices applied to all available slots');
      queryClient.invalidateQueries({ queryKey: ['all-slots', selectedTurfId] });
    }
  });

  const [viewDate, setViewDate] = useState(new Date());

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(viewDate);
      d.setDate(viewDate.getDate() + i);
      return d;
    });
  }, [viewDate]);

  const handleNextWeek = () => {
    const next = new Date(viewDate);
    next.setDate(viewDate.getDate() + 7);
    setViewDate(next);
  };

  const handlePrevWeek = () => {
    const prev = new Date(viewDate);
    prev.setDate(viewDate.getDate() - 7);
    setViewDate(prev);
  };

  if (turfs.length > 0 && !selectedTurfId) {
    setSelectedTurfId(turfs[0]._id);
  }

  const startDateStr = viewDate.toISOString().split('T')[0];
  const endDate = new Date(viewDate);
  endDate.setDate(viewDate.getDate() + 7);
  const endDateStr = endDate.toISOString().split('T')[0];

  const { data: slotsResponse, isLoading: isLoadingSlots } = useQuery({
    queryKey: ['slots-range', selectedTurfId, startDateStr],
    queryFn: () => api.get(`/slots?turfId=${selectedTurfId}&startDate=${startDateStr}&endDate=${endDateStr}`),
    enabled: !!selectedTurfId,
  });

  const slots = (slotsResponse as any)?.data as TimeSlot[] || [];

  const createSlotsMutation = useMutation({
    mutationFn: (data: any) => api.post('/slots', data),
    onSuccess: () => {
      toast.success('Slots updated successfully');
      queryClient.invalidateQueries({ queryKey: ['all-slots', selectedTurfId] });
      setIsBulkOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update slots');
    }
  });

  const deleteSlotsMutation = useMutation({
    mutationFn: (date: string) => api.delete('/slots', { params: { turfId: selectedTurfId, date } }),
    onSuccess: () => {
      toast.success('Slots cleared successfully');
      queryClient.invalidateQueries({ queryKey: ['all-slots', selectedTurfId] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to clear slots');
    }
  });

  const hours = Array.from({ length: 24 }, (_, i) => i); // 0 to 23

  const handleBulkGenerate = () => {
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

  const handleCellClick = (date: Date, hour: number) => {
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const defaultPrice = isWeekend ? (currentTurf as any)?.defaultWeekendPrice : (currentTurf as any)?.defaultWeekdayPrice;
    setEditingSlot({ date, hour, price: Number(defaultPrice || 1000) });
  };

  const saveSlotPrice = (price: number) => {
    if (!editingSlot) return;
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
    setEditingSlot(null);
  };

  const handleCopyDay = (sourceDate: Date) => {
    const targetDateStr = prompt('Enter target date (YYYY-MM-DD):');
    if (!targetDateStr) return;
    
    const sourceDateStr = sourceDate.toISOString().split('T')[0];
    const sourceSlots = slots.filter(s => s.startTime.startsWith(sourceDateStr));
    
    if (sourceSlots.length === 0) {
      toast.error('No slots to copy from this day');
      return;
    }

    const newSlots = sourceSlots.map(s => {
      const startTime = new Date(s.startTime);
      const endTime = new Date(s.endTime);
      const targetStart = new Date(targetDateStr);
      targetStart.setHours(startTime.getHours(), 0, 0, 0);
      const targetEnd = new Date(targetDateStr);
      targetEnd.setHours(endTime.getHours(), 0, 0, 0);
      
      return {
        startTime: targetStart.toISOString(),
        endTime: targetEnd.toISOString(),
        price: s.price
      };
    });

    createSlotsMutation.mutate({
      turfId: selectedTurfId,
      slots: newSlots
    });
  };

  if (isLoadingTurfs) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" /></div>;

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
                <span className="font-bold tracking-tight">Price Settings</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-[2.5rem] sm:max-w-[450px] p-0 overflow-hidden border-none shadow-2xl">
              <div className="bg-gradient-to-br from-primary/20 via-background to-background p-8">
                <DialogHeader className="mb-8">
                  <DialogTitle className="text-3xl font-black tracking-tighter">Fixed Pricing</DialogTitle>
                  <DialogDescription className="text-muted-foreground font-medium">
                    Establish your venue's standard rates once and apply them globally.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-6">
                  <div className="group space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Weekday Standard</Label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-bold">₹</div>
                      <Input 
                        type="number" 
                        defaultValue={(currentTurf as any)?.defaultWeekdayPrice || 1000}
                        id="defWeekday"
                        className="h-14 pl-10 rounded-2xl bg-white/50 border-2 border-transparent focus-visible:ring-primary focus-visible:border-primary transition-all text-lg font-bold"
                      />
                    </div>
                  </div>

                  <div className="group space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Weekend Premium</Label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-bold">₹</div>
                      <Input 
                        type="number" 
                        defaultValue={(currentTurf as any)?.defaultWeekendPrice || 1500}
                        id="defWeekend"
                        className="h-14 pl-10 rounded-2xl bg-primary/5 border-2 border-primary/20 focus-visible:ring-primary transition-all text-lg font-bold"
                      />
                    </div>
                  </div>
                  
                  <div className="pt-6">
                    <button 
                      onClick={() => {
                        if (confirm('Apply these prices to all existing unbooked slots?')) {
                          applyDefaultsMutation.mutate();
                        }
                      }}
                      className="w-full p-4 rounded-2xl bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-all flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary text-primary-foreground">
                          <Zap size={16} />
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
                    onClick={() => {
                      const weekday = (document.getElementById('defWeekday') as HTMLInputElement).value;
                      const weekend = (document.getElementById('defWeekend') as HTMLInputElement).value;
                      updateTurfMutation.mutate({ defaultWeekdayPrice: Number(weekday), defaultWeekendPrice: Number(weekend) });
                    }}
                    className="gradient-primary rounded-xl h-12 flex-1 font-bold shadow-lg shadow-primary/20"
                  >
                    Save Changes
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
                      className="h-14 rounded-2xl bg-white/50 border-none font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="days" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Duration (Days)</Label>
                      <Input 
                        id="days" 
                        type="number" 
                        value={bulkConfig.days} 
                        onChange={(e) => setBulkConfig({...bulkConfig, days: Number(e.target.value)})} 
                        className="h-14 rounded-2xl bg-white/50 border-none font-bold"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="startHour" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Daily Start</Label>
                      <Input 
                        id="startHour" 
                        type="number" 
                        value={bulkConfig.startHour} 
                        onChange={(e) => setBulkConfig({...bulkConfig, startHour: Number(e.target.value)})} 
                        className="h-14 rounded-2xl bg-white/50 border-none font-bold"
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
                          className="h-12 rounded-xl bg-white/80 border-none font-bold"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-bold text-primary ml-1">Weekend</Label>
                        <Input 
                          type="number" 
                          value={bulkConfig.weekendPrice} 
                          onChange={(e) => setBulkConfig({...bulkConfig, weekendPrice: Number(e.target.value)})} 
                          className="h-12 rounded-xl bg-white/80 border-primary/10 border font-bold"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="endHour" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Daily End</Label>
                    <Input 
                      id="endHour" 
                      type="number" 
                      value={bulkConfig.endHour} 
                      onChange={(e) => setBulkConfig({...bulkConfig, endHour: Number(e.target.value)})} 
                      className="h-14 rounded-2xl bg-white/50 border-none font-bold"
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
        <div className="space-y-10">
          <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-none px-1">
            {turfs.map(t => (
              <Button 
                key={t._id} 
                variant={selectedTurfId === t._id ? 'default' : 'outline'} 
                className={cn('rounded-full h-12 px-8 font-black transition-all border-white/5', 
                  selectedTurfId === t._id ? 'gradient-primary shadow-xl shadow-primary/30 border-none scale-105' : 'glass hover:bg-white/5 hover:border-primary/30 text-muted-foreground hover:text-white')}
                onClick={() => setSelectedTurfId(t._id)}
              >
                {t.name}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 glass p-4 rounded-[2rem] border-white/5 shadow-xl">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handlePrevWeek} className="rounded-xl h-11 px-4 hover:bg-white/5 text-muted-foreground hover:text-white">
                <ChevronLeft size={18} className="mr-1" /> Prev Week
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setViewDate(new Date())} className="rounded-xl h-11 px-6 hover:bg-white/5 font-black text-[10px] uppercase tracking-widest">
                Today
              </Button>
              <Button variant="ghost" size="sm" onClick={handleNextWeek} className="rounded-xl h-11 px-4 hover:bg-white/5 text-muted-foreground hover:text-white">
                Next Week <ChevronRight size={18} className="ml-1" />
              </Button>
            </div>

            <div className="flex items-center gap-4">
              <div className="h-8 w-[1px] bg-white/5 mx-2" />
              <div className="relative group">
                <CalendarIcon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-primary opacity-60 group-focus-within:opacity-100 transition-opacity" />
                <input 
                  type="date" 
                  value={viewDate.toISOString().split('T')[0]} 
                  onChange={(e) => setViewDate(new Date(e.target.value))}
                  className="bg-primary/5 border-2 border-transparent focus:border-primary/20 rounded-xl h-11 pl-10 pr-4 outline-none font-bold text-xs transition-all w-40"
                />
              </div>
            </div>
          </div>

          <div className="glass border-primary/10 rounded-[3rem] overflow-hidden shadow-2xl shadow-black/20">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-xs border-separate border-spacing-0">
                <thead>
                  <tr className="bg-primary/5 backdrop-blur-xl">
                    <th className="p-6 text-left font-black tracking-tighter sticky left-0 bg-card/95 backdrop-blur-md min-w-[120px] border-r border-white/5 z-20">
                      <div className="flex items-center gap-2 text-primary">
                        <Zap size={14} className="animate-pulse" /> TIME
                      </div>
                    </th>
                    {days.map(d => (
                      <th key={d.toISOString()} className="p-6 text-center min-w-[160px] border-r border-white/5 last:border-r-0 relative group/col z-10">
                        <div className="text-[10px] uppercase text-primary font-black tracking-[0.2em] mb-2 opacity-60">{d.toLocaleDateString('en', { weekday: 'long' })}</div>
                        <div className="text-2xl font-black tracking-tighter text-white">{d.getDate()} {d.toLocaleDateString('en', { month: 'short' }).toUpperCase()}</div>
                        
                        <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover/col:opacity-100 transition-all">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 rounded-full hover:bg-primary/20 text-primary"
                            onClick={() => handleCopyDay(d)}
                            title="Copy Schedule"
                          >
                            <Plus size={14} />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 rounded-full hover:bg-destructive/20 text-destructive"
                            onClick={() => {
                              if (confirm(`Clear all slots for ${d.toLocaleDateString()}?`)) {
                                deleteSlotsMutation.mutate(d.toISOString());
                              }
                            }}
                            title="Clear Day"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {hours.map(h => (
                    <tr key={h} className="group hover:bg-white/[0.02] transition-colors">
                      <td className="p-6 font-black tracking-tighter sticky left-0 bg-card/95 backdrop-blur-sm border-r border-white/5 z-20 text-muted-foreground group-hover:text-primary transition-colors">
                        {h.toString().padStart(2, '0')}:00
                      </td>
                      {days.map(d => {
                        const dateStr = d.toISOString().split('T')[0];
                        const slot = slots.find(s => {
                          const sTime = new Date(s.startTime);
                          return sTime.getDate() === d.getDate() && sTime.getMonth() === d.getMonth() && sTime.getHours() === h;
                        });
                        
                        const status = slot?.status.toUpperCase() || 'NONE';
                        
                        return (
                          <td key={dateStr} className="p-3 border-r border-white/5 last:border-r-0">
                            <button
                              onClick={() => !slot && handleCellClick(d, h)}
                              disabled={status === 'BOOKED' || createSlotsMutation.isPending}
                              className={cn('w-full p-4 rounded-[1.5rem] transition-all flex flex-col items-center justify-center min-h-[80px] relative overflow-hidden group/btn border-2',
                                status === 'NONE' ? 'bg-transparent border-dashed border-white/5 hover:border-primary/40 hover:bg-primary/10 text-muted-foreground/20' :
                                status === 'AVAILABLE' ? 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20 hover:border-primary/50 shadow-[0_0_20px_rgba(16,185,129,0.1)]' :
                                status === 'BOOKED' ? 'bg-red-500/10 text-red-500 border-red-500/20 cursor-not-allowed opacity-40' :
                                'bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-lg shadow-amber-500/5'
                              )}
                            >
                              {status === 'NONE' ? (
                                <Plus size={24} className="opacity-0 group-hover/btn:opacity-100 transition-all scale-75 group-hover/btn:scale-100" />
                              ) : (
                                <>
                                  <div className="flex items-baseline gap-0.5">
                                    <span className="text-[10px] font-bold opacity-60">₹</span>
                                    <span className="font-black text-xl tracking-tighter">{slot.price}</span>
                                  </div>
                                  <div className={cn("text-[9px] font-black tracking-widest mt-1 px-2 py-0.5 rounded-full",
                                    status === 'AVAILABLE' ? 'bg-primary/20' : 'bg-amber-500/20'
                                  )}>
                                    {status}
                                  </div>
                                  {status === 'AVAILABLE' && (
                                    <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.9)]" />
                                  )}
                                </>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-6 rounded-[2rem] glass border-primary/10 text-sm text-muted-foreground max-w-2xl">
            <div className="p-2 rounded-full bg-primary/10 text-primary">
              <Info size={18} />
            </div>
            <p><strong>Pro Tip:</strong> Define your <strong>Price Settings</strong> once to automatically apply standard rates to all newly generated slots. Use the <strong>Sync</strong> button to update existing slots globally.</p>
          </div>
        </div>
      )}
      {editingSlot && (
        <Dialog open={!!editingSlot} onOpenChange={() => setEditingSlot(null)}>
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
                      defaultValue={editingSlot.price}
                      id="slotPriceInput"
                      className="h-16 pl-10 rounded-2xl bg-white/50 border-2 border-transparent focus-visible:border-primary/30 focus-visible:ring-0 transition-all text-2xl font-black"
                      onKeyDown={(e) => e.key === 'Enter' && saveSlotPrice(Number((e.target as HTMLInputElement).value))}
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="mt-8 gap-3">
                <Button variant="ghost" onClick={() => setEditingSlot(null)} className="rounded-xl font-bold h-12 flex-1">Cancel</Button>
                <Button 
                  onClick={() => {
                    const price = (document.getElementById('slotPriceInput') as HTMLInputElement).value;
                    saveSlotPrice(Number(price));
                  }}
                  className="gradient-primary rounded-xl h-12 flex-1 font-bold shadow-lg shadow-primary/20"
                >
                  Confirm Slot
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

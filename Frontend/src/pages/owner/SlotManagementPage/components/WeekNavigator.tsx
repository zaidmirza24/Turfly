import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toDateKey, parseDateKey } from '@/lib/dateKey';

type Props = {
  viewDate: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onJumpToDate: (date: Date) => void;
  isFetching: boolean;
};

export function WeekNavigator({ viewDate, onPrevWeek, onNextWeek, onToday, onJumpToDate, isFetching }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 glass p-4 rounded-[2rem] shadow-xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onPrevWeek} className="rounded-xl h-11 px-4 hover:bg-accent text-muted-foreground hover:text-foreground">
          <ChevronLeft size={18} className="mr-1" /> Prev Week
        </Button>
        <Button variant="ghost" size="sm" onClick={onToday} className="rounded-xl h-11 px-6 hover:bg-accent font-black text-[10px] uppercase tracking-widest">
          Today
        </Button>
        <Button variant="ghost" size="sm" onClick={onNextWeek} className="rounded-xl h-11 px-4 hover:bg-accent text-muted-foreground hover:text-foreground">
          Next Week <ChevronRight size={18} className="ml-1" />
        </Button>
      </div>

      <div className="flex items-center gap-4">
        {isFetching && (
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        )}
        <div className="h-8 w-[1px] bg-border mx-2" />
        <div className="relative group">
          <CalendarIcon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-primary opacity-60 group-focus-within:opacity-100 transition-opacity" />
          <input
            type="date"
            value={toDateKey(viewDate)}
            onChange={(e) => { if (e.target.value) onJumpToDate(parseDateKey(e.target.value)); }}
            className="bg-primary/5 border-2 border-transparent focus:border-primary/20 rounded-xl h-11 pl-10 pr-4 outline-none font-bold text-xs transition-all w-40"
          />
        </div>
      </div>
    </div>
  );
}

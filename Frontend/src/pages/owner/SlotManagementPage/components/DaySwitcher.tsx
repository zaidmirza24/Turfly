import { cn } from '@/lib/utils';

type Props = {
  days: Date[];
  activeDayIndex: number;
  onSelect: (index: number) => void;
};

export function DaySwitcher({ days, activeDayIndex, onSelect }: Props) {
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d, i) => {
        const isActive = i === activeDayIndex;
        const isToday = d.toDateString() === new Date().toDateString();
        return (
          <button
            key={d.toISOString()}
            onClick={() => onSelect(i)}
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
  );
}

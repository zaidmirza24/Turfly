import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Turf } from '@/types';

type Props = {
  turfs: Turf[];
  selectedTurfId: string;
  onSelect: (turfId: string) => void;
};

export function TurfTabs({ turfs, selectedTurfId, onSelect }: Props) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-none px-1">
      {turfs.map(t => (
        <Button
          key={t._id}
          variant={selectedTurfId === t._id ? 'default' : 'outline'}
          className={cn('rounded-full h-12 px-8 font-black transition-all',
            selectedTurfId === t._id ? 'gradient-primary shadow-xl shadow-primary/30 border-none scale-105' : 'glass hover:bg-accent hover:border-primary/30 text-muted-foreground hover:text-foreground')}
          onClick={() => onSelect(t._id)}
        >
          {t.name}
        </Button>
      ))}
    </div>
  );
}

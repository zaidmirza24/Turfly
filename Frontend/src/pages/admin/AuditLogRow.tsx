import { CheckCircle2, XCircle, Ban, ShieldCheck, CalendarX, RotateCcw, Wallet } from 'lucide-react';
import { AuditLogEntry } from '@/types';

const ACTION_META: Record<AuditLogEntry['action'], { label: string; icon: typeof CheckCircle2; color: string }> = {
  TURF_APPROVED: { label: 'approved a turf', icon: CheckCircle2, color: 'text-success bg-success/10' },
  TURF_REJECTED: { label: 'rejected/unlisted a turf', icon: XCircle, color: 'text-destructive bg-destructive/10' },
  USER_BANNED: { label: 'banned a user', icon: Ban, color: 'text-destructive bg-destructive/10' },
  USER_UNBANNED: { label: 'unbanned a user', icon: ShieldCheck, color: 'text-success bg-success/10' },
  BOOKING_CANCELLED: { label: 'cancelled a booking', icon: CalendarX, color: 'text-destructive bg-destructive/10' },
  BOOKING_REFUNDED: { label: 'marked a booking refunded', icon: RotateCcw, color: 'text-primary bg-primary/10' },
  BOOKING_PAID_OUT: { label: 'settled an owner payout', icon: Wallet, color: 'text-success bg-success/10' },
};

function adminName(entry: AuditLogEntry) {
  return typeof entry.adminId === 'object' ? entry.adminId.name : 'An admin';
}

export function AuditLogRow({ entry }: { entry: AuditLogEntry }) {
  const meta = ACTION_META[entry.action];
  const Icon = meta.icon;
  return (
    <div className="flex items-start gap-3 p-3 rounded-2xl hover:bg-primary/5 transition-colors">
      <div className={`p-2 rounded-xl shrink-0 ${meta.color}`}>
        <Icon size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-snug">
          <span className="text-foreground">{adminName(entry)}</span>{' '}
          <span className="text-muted-foreground font-medium">{meta.label}</span>
        </p>
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-0.5">
          {new Date(entry.createdAt).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

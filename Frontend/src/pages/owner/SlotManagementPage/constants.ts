export const STATUS_META: Record<string, { label: string; barClass: string; badgeClass: string }> = {
  NONE: { label: 'Not Set', barClass: 'bg-transparent border-dashed border-border hover:border-primary/40', badgeClass: 'bg-muted text-muted-foreground' },
  AVAILABLE: { label: 'Available', barClass: 'bg-primary/10 border-primary/30 hover:bg-primary/20', badgeClass: 'bg-primary/20 text-primary' },
  // An hour that's already elapsed (or too close to ever be locked) — shown
  // instead of AVAILABLE/NONE so it reads as what it is: never bookable by
  // anyone, not idle inventory waiting for a customer.
  PAST: { label: 'Past', barClass: 'bg-muted/30 border-border opacity-50 cursor-not-allowed', badgeClass: 'bg-muted text-muted-foreground/70' },
  CLOSED: { label: 'Closed', barClass: 'bg-muted border-border', badgeClass: 'bg-muted-foreground/20 text-muted-foreground' },
  FULL: { label: 'Full', barClass: 'bg-warning/10 border-warning/30', badgeClass: 'bg-warning/20 text-warning' },
  BOOKED: { label: 'Booked', barClass: 'bg-destructive/10 border-destructive/20 opacity-60 cursor-not-allowed', badgeClass: 'bg-destructive/20 text-destructive' },
  LOCKED: { label: 'Locked', barClass: 'bg-warning/5 border-warning/10 opacity-60 cursor-not-allowed', badgeClass: 'bg-warning/20 text-warning' },
};

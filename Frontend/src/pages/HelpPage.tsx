import { useSearchParams } from 'react-router-dom';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Mail, LifeBuoy, CreditCard, XCircle, RotateCcw, AlertTriangle } from 'lucide-react';

const SUPPORT_EMAIL = 'support@turfly.app';

const topics = [
  { icon: XCircle, label: 'Cancellation issue', subject: 'Cancellation issue' },
  { icon: CreditCard, label: 'Payment issue', subject: 'Payment issue' },
  { icon: RotateCcw, label: 'Refund issue', subject: 'Refund issue' },
  { icon: AlertTriangle, label: 'Report an issue', subject: 'Reporting an issue' },
];

const faqs = [
  { q: 'How do I cancel a booking?', a: 'Go to My Bookings → Upcoming, and tap Cancel on the booking. Free cancellation is available up to 6 hours before your slot starts.' },
  { q: 'Will I get a refund if I cancel?', a: "This platform doesn't process real payments yet — checkout is simulated, so nothing is actually charged, and there's nothing to refund when you cancel." },
  { q: "I didn't get a booking confirmation email", a: "Booking confirmation currently only appears in-app (on the confirmation screen and in My Bookings) — email/SMS receipts aren't built yet. Your booking record itself is real; you can view or print it from My Bookings → Receipt." },
  { q: 'How do I contact a venue directly?', a: "Open the venue's page — if they've listed a contact number, you'll find a Call Venue button. Not every venue has one on file yet." },
  { q: 'How are turfs verified?', a: 'Every turf is reviewed by our team before it appears in search results.' },
  { q: 'Can I edit or delete my review?', a: 'Yes — open the turf you reviewed and use Edit next to your review. There is no delete yet; contact support if you need a review removed.' },
];

/** Prefixes the booking reference into the mail subject when we know it (deep-linked from a receipt or booking card). */
function buildMailto(subject: string, bookingId?: string | null) {
  const fullSubject = bookingId ? `[Booking #${bookingId}] ${subject}` : subject;
  const body = bookingId ? `Booking reference: #${bookingId}\n\nDescribe your issue here:\n` : '';
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(fullSubject)}&body=${encodeURIComponent(body)}`;
}

export default function HelpPage() {
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get('booking');

  return (
    <div className="container mx-auto px-4 py-10 max-w-2xl">
      <div className="flex items-center gap-3 mb-2">
        <LifeBuoy size={26} className="text-primary" />
        <h1 className="text-2xl font-bold">Help &amp; Support</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-8">
        {bookingId
          ? `We'll include booking #${bookingId} automatically when you reach out below.`
          : "Answers to common questions, or reach us directly below."}
      </p>

      <div className="grid grid-cols-2 gap-3 mb-10">
        {topics.map(t => (
          <Button key={t.label} variant="outline" className="h-auto py-4 flex-col gap-2 whitespace-normal" asChild>
            <a href={buildMailto(t.subject, bookingId)}>
              <t.icon size={18} className="text-primary" />
              <span className="text-xs font-medium text-center">{t.label}</span>
            </a>
          </Button>
        ))}
      </div>

      <div className="border rounded-2xl p-5 flex items-center justify-between gap-4 mb-10">
        <div>
          <p className="font-semibold text-sm">Still stuck?</p>
          <p className="text-xs text-muted-foreground">Email us and we'll get back to you.</p>
        </div>
        <Button asChild>
          <a href={buildMailto('General support', bookingId)} className="gap-2"><Mail size={14} /> Email Support</a>
        </Button>
      </div>

      <h2 className="text-lg font-bold mb-4">Frequently Asked Questions</h2>
      <Accordion type="single" collapsible>
        {faqs.map((f, i) => (
          <AccordionItem key={i} value={`item-${i}`}>
            <AccordionTrigger className="text-left font-semibold text-sm">{f.q}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-sm leading-relaxed">{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Search, MapPin, Zap, ShieldCheck, ChevronRight, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TurfCard } from '@/components/TurfCard';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Turf } from '@/types';
import { motion } from 'framer-motion';

const sportsList = ['Football', 'Cricket', 'Badminton', 'Tennis', 'Basketball', 'Volleyball'];

const steps = [
  { n: '01', title: 'Search', desc: 'Browse turfs by sport, location and price near you.' },
  { n: '02', title: 'Pick a slot', desc: 'See real-time availability and lock in your time — instantly.' },
  { n: '03', title: 'Play', desc: 'Get instant confirmation and show up ready to go.' },
];

const faqs = [
  { q: 'How do I book a turf?', a: 'Search for a turf, pick an open time slot, and confirm — your booking is instant, no waiting for approval.' },
  { q: "What happens if two people try to book the same slot?", a: "The moment you select a slot it's locked just for you, so it's never double-booked." },
  { q: 'Can I cancel a booking?', a: 'Yes — cancel anytime before your slot starts, directly from your dashboard.' },
  { q: 'How are turfs verified?', a: 'Every turf is reviewed by our team before it appears in search results, so listings you see are real and active.' },
  { q: 'Is there a fee to list my turf?', a: 'No upfront listing fees — create your partner account and list your first turf for free.' },
];

export default function HomePage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data: turfsResponse, isLoading } = useQuery({
    queryKey: ['featured-turfs'],
    queryFn: () => api.get('/turfs?limit=3'),
  });

  const featuredTurfs = (turfsResponse as any)?.data as Turf[] || [];

  const goToSearch = () => navigate(search ? `/turfs?q=${encodeURIComponent(search)}` : '/turfs');

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Hero */}
      <section className="pt-20 pb-16 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-4 py-1.5 rounded-full text-xs font-bold mb-6">
              <Zap size={13} />
              Slots update in real time — no double bookings
            </div>
            <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight mb-5 leading-[1.05]">
              Book a turf near you<br />in under a minute
            </h1>
            <p className="text-base md:text-lg text-muted-foreground mb-10 max-w-xl mx-auto">
              Football, cricket, badminton and more — see live availability and lock in your slot instantly.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className="flex flex-col sm:flex-row items-stretch gap-2 max-w-xl mx-auto p-2 bg-card border rounded-full shadow-lg"
          >
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <Input
                placeholder="Search by turf name or locality..."
                className="pl-11 h-12 border-none rounded-full focus-visible:ring-0 bg-transparent"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && goToSearch()}
              />
            </div>
            <Button size="lg" className="h-12 px-8 rounded-full font-bold" onClick={goToSearch}>
              Search
            </Button>
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 px-4 bg-muted/40 border-y">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="font-display text-2xl md:text-3xl font-bold mb-2">How it works</h2>
            <p className="text-muted-foreground text-sm">Three steps, no phone calls.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {steps.map((s) => (
              <div key={s.n} className="text-center sm:text-left">
                <div className="font-display text-3xl font-bold text-primary/25 mb-2">{s.n}</div>
                <h3 className="font-bold mb-1.5">{s.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sports */}
      <section className="py-16 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-8">
            <h2 className="font-display text-2xl md:text-3xl font-bold mb-2">Every sport, one place</h2>
            <p className="text-muted-foreground text-sm">Pick a sport to see turfs near you.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 max-w-4xl mx-auto">
            {sportsList.map((s) => (
              <button
                key={s}
                onClick={() => navigate(`/turfs?sport=${s.toLowerCase()}`)}
                className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl border bg-card hover:border-primary/40 hover:bg-accent transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-sm font-bold">{s}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Trust features */}
      <section className="py-16 bg-muted/40 border-y">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: MapPin, title: 'Nearby arenas', desc: 'Find the best turfs in your neighborhood.' },
              { icon: Zap, title: 'Instant booking', desc: 'Atomic slot reservation — no double-booking, ever.' },
              { icon: ShieldCheck, title: 'Verified listings', desc: 'Every turf is reviewed by our team before it goes live.' },
            ].map((f) => (
              <div key={f.title} className="flex items-start gap-4 p-5 rounded-2xl bg-card border card-hover">
                <div className="p-3 rounded-xl bg-primary/10 text-primary flex-shrink-0">
                  <f.icon size={22} />
                </div>
                <div>
                  <h3 className="font-bold mb-1">{f.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured turfs */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="font-display text-2xl md:text-3xl font-bold mb-1">Popular near you</h2>
              <p className="text-muted-foreground text-sm">Hand-picked, admin-verified turfs.</p>
            </div>
            <Button variant="ghost" className="gap-1.5 group" onClick={() => navigate('/turfs')}>
              View all <ChevronRight size={16} className="transition-transform group-hover:translate-x-1" />
            </Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={28} /></div>
          ) : featuredTurfs.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed rounded-2xl text-muted-foreground">
              <p className="font-medium">No turfs live yet</p>
              <p className="text-sm mt-1">Check back soon, or list your own below.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredTurfs.map((turf) => (
                <TurfCard key={turf._id} turf={turf} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Owner CTA */}
      <section className="py-16 px-4">
        <div className="container mx-auto">
          <div className="bg-primary text-primary-foreground rounded-3xl px-8 py-14 md:px-16 text-center">
            <h2 className="font-display text-2xl md:text-4xl font-bold mb-4">Own a turf? Start earning from it.</h2>
            <p className="opacity-85 mb-8 max-w-xl mx-auto">
              List in minutes. We review every listing and handle the booking flow — you focus on the game.
            </p>
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 mb-9 text-sm">
              {['No upfront listing fees', 'Real-time bookings dashboard', 'Reviewed before going live'].map((b) => (
                <span key={b} className="flex items-center gap-2 opacity-90">
                  <Check size={15} /> {b}
                </span>
              ))}
            </div>
            <Button size="lg" variant="secondary" className="h-12 px-9 rounded-full font-bold" onClick={() => navigate('/signup?role=OWNER')}>
              List your turf
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-2xl">
          <div className="text-center mb-10">
            <h2 className="font-display text-2xl md:text-3xl font-bold mb-2">Frequently asked</h2>
          </div>
          <Accordion type="single" collapsible>
            {faqs.map((f, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger className="text-left font-bold">{f.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-10 px-4">
        <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 17L10 5H14L20 17M7 13H17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <span className="font-display font-bold text-sm">Turfly</span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link to="/turfs" className="hover:text-foreground">Explore turfs</Link>
            <Link to="/signup?role=OWNER" className="hover:text-foreground">List your turf</Link>
            <Link to="/login" className="hover:text-foreground">Log in</Link>
            <Link to="/signup" className="hover:text-foreground">Sign up</Link>
          </nav>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Turfly</p>
        </div>
      </footer>
    </div>
  );
}

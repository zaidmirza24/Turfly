import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Eye, EyeOff, User, Building2, ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { UserRole } from '@/types';

const allSports = ['football', 'cricket', 'badminton', 'tennis'];

// Deliberately permissive: this only catches obvious typos. The field is
// optional, and the backend does not treat phone as verified.
const PHONE_RE = /^[0-9+\-\s]{7,15}$/;

function redirectPathForRole(role: string) {
  if (role === 'OWNER') return '/owner';
  // ADMIN used to land on '/', with no link anywhere in the UI to /admin —
  // the admin panel was only reachable by typing the URL.
  if (role === 'ADMIN') return '/admin';
  return '/';
}

/* ---------- Shared two-panel shell ---------- */

function AuthShell({
  brandTitle,
  brandSubtitle,
  brandBullet,
  children,
}: {
  brandTitle: string;
  brandSubtitle: string;
  brandBullet?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full flex bg-background">
      <div className="hidden md:flex w-[420px] lg:w-[480px] flex-shrink-0 flex-col justify-between bg-primary p-12 text-primary-foreground">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary-foreground/15 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 17L10 5H14L20 17M7 13H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <span className="font-display font-bold text-lg">Turfly</span>
        </div>
        <div>
          <h2 className="font-display text-[32px] font-bold leading-tight tracking-tight mb-3">{brandTitle}</h2>
          <p className="text-primary-foreground/75 text-base leading-relaxed max-w-[340px]">{brandSubtitle}</p>
        </div>
        {brandBullet ? (
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md bg-primary-foreground/15 flex items-center justify-center flex-shrink-0">
              <Check size={13} />
            </div>
            <span className="text-xs text-primary-foreground/85">{brandBullet}</span>
          </div>
        ) : <div className="h-6" />}
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-8 sm:p-11">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={cn('h-1 flex-1 rounded-full', i < step ? 'bg-primary' : 'bg-border')} />
      ))}
    </div>
  );
}

/* ---------- Login ---------- */

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Set by the route guards / the 401 interceptor: where the visitor was
  // headed before they were asked to sign in.
  const nextPath = searchParams.get('next');
  const sessionExpired = searchParams.get('expired') === '1';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email) { setError('Email is required'); return; }
    if (!password) { setError('Password is required'); return; }
    setLoading(true);
    const ok = await login(email, password);
    setLoading(false);
    if (ok) {
      toast.success('Welcome back!');
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      // Only follow an in-app path — an attacker-supplied `next` of
      // "https://evil.example" would otherwise be an open redirect off a page
      // the user just typed their password into.
      const safeNext = nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : null;
      navigate(safeNext || redirectPathForRole(stored.role), { replace: true });
    } else {
      setError('Invalid credentials. Please try again.');
    }
  };

  return (
    <AuthShell
      brandTitle="Good to see you again"
      brandSubtitle="Log in to book a slot or check in on your turfs."
      brandBullet="Real-time slots, zero double-bookings"
    >
      <h1 className="font-display text-2xl font-bold tracking-tight mb-1">Log in</h1>
      <p className="text-sm text-muted-foreground mb-7">Welcome back to Turfly.</p>

      {sessionExpired && (
        <div className="bg-warning/10 border border-warning/20 text-warning text-xs font-medium p-3 rounded-lg mb-4" role="status">
          Your session expired. Log in again to pick up where you left off.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs font-semibold">Email</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@email.com" className="h-11 rounded-lg"
            value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <Label htmlFor="password" className="text-xs font-semibold">Password</Label>
            <Link to="/forgot-password" className="text-xs font-semibold text-primary hover:text-primary/80">Forgot?</Link>
          </div>
          <div className="relative">
            <Input id="password" type={showPass ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" className="h-11 rounded-lg pr-11"
              value={password} onChange={e => setPassword(e.target.value)} />
            <button type="button" aria-label={showPass ? 'Hide password' : 'Show password'} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPass(!showPass)}>
              {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" className="bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium p-3 rounded-lg">{error}</div>
        )}

        <Button type="submit" className="w-full h-11 rounded-lg font-semibold" disabled={loading}>
          {loading ? <Loader2 className="animate-spin" size={18} /> : 'Log in'}
        </Button>
      </form>

      <div className="text-center mt-6 text-sm text-muted-foreground">
        New here? <Link to="/signup" className="text-primary font-semibold">Create an account</Link>
      </div>
    </AuthShell>
  );
}

/* ---------- Signup (multi-step) ---------- */

type Step = 'role' | 'account' | 'turf' | 'done';

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState<Step>('role');
  const [role, setRole] = useState<UserRole>(searchParams.get('role') === 'OWNER' ? 'OWNER' : 'USER');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [turfName, setTurfName] = useState('');
  const [turfLocation, setTurfLocation] = useState('');
  const [turfSports, setTurfSports] = useState<string[]>(['football']);
  const [turfPrice, setTurfPrice] = useState('');
  const [turfCreated, setTurfCreated] = useState(false);

  const toggleTurfSport = (sport: string) => {
    setTurfSports(prev =>
      prev.includes(sport) ? prev.filter(s => s !== sport) : [...prev, sport]
    );
  };

  const totalSteps = role === 'OWNER' ? 4 : 3;
  const stepIndex = { role: 1, account: 2, turf: 3, done: totalSteps }[step];

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name) { setError('Name is required'); return; }
    if (!email) { setError('Email is required'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (phone && !PHONE_RE.test(phone)) { setError('Enter a valid phone number'); return; }
    setLoading(true);
    const ok = await signup({ name, email, password, role, phone: phone || undefined });
    setLoading(false);
    if (!ok) { setError('Registration failed. Email might already be in use.'); return; }
    setStep(role === 'OWNER' ? 'turf' : 'done');
  };

  const handleCreateTurf = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!turfName || !turfLocation || !turfPrice) { setError('Please fill in all fields'); return; }
    if (turfSports.length === 0) { setError('Select at least one sport'); return; }
    setLoading(true);
    try {
      await api.post('/turfs', {
        name: turfName,
        location: turfLocation,
        sportsType: turfSports,
        pricePerHour: Number(turfPrice),
      });
      setTurfCreated(true);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create turf — you can add it later from your dashboard.');
    } finally {
      setLoading(false);
    }
  };

  const brandCopy: Record<Step, { title: string; subtitle: string; bullet: string }> = {
    role: role === 'OWNER'
      ? { title: 'Turn empty slots into revenue', subtitle: 'List your venue and start getting discovered by nearby players today.', bullet: 'We review every listing before it goes live' }
      : { title: 'Find your next game in seconds', subtitle: 'Real-time availability, instant confirmation — no back-and-forth calls to a venue.', bullet: 'Cancel anytime, instant refund tracking' },
    account: role === 'OWNER'
      ? { title: 'Set up your partner account', subtitle: "Next you'll tell us about your turf — takes about two minutes.", bullet: 'No listing fees to get started' }
      : { title: 'Almost there', subtitle: "Just the basics — you'll be booking your first slot in under a minute.", bullet: 'No spam — just booking confirmations' },
    turf: { title: 'Tell us the basics', subtitle: 'You can add photos, amenities and slot pricing anytime after this — nothing here is final.', bullet: 'Usually reviewed within a few hours' },
    done: role === 'OWNER'
      ? { title: `Nice work, ${name.split(' ')[0] || ''}`, subtitle: "Head to your dashboard to add photos and set up slots while you wait.", bullet: '' }
      : { title: `You're in, ${name.split(' ')[0] || ''}`, subtitle: 'Your account is ready. Go find a slot for tonight.', bullet: '' },
  };
  const copy = brandCopy[step];

  return (
    <AuthShell brandTitle={copy.title} brandSubtitle={copy.subtitle} brandBullet={copy.bullet || undefined}>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>

          {step !== 'role' && step !== 'done' && (
            <button type="button" onClick={() => setStep(step === 'turf' ? 'account' : 'role')} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground mb-4">
              <ArrowLeft size={14} /> Back
            </button>
          )}

          <ProgressBar step={stepIndex} total={totalSteps} />

          {step === 'role' && (
            <div className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Step 1 of {totalSteps}</div>
          )}
          {step === 'account' && (
            <div className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Step 2 of {totalSteps}</div>
          )}
          {step === 'turf' && (
            <div className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Step 3 of {totalSteps}</div>
          )}

          {/* Step 1: role */}
          {step === 'role' && (
            <>
              <h1 className="font-display text-2xl font-bold tracking-tight mb-1">What brings you here?</h1>
              <p className="text-sm text-muted-foreground mb-6">One quick choice — you can always do the other later.</p>

              <div className="space-y-3 mb-7">
                <button type="button" onClick={() => setRole('USER')} className={cn(
                  'w-full flex items-center gap-3.5 p-4 rounded-xl border-2 text-left transition-colors',
                  role === 'USER' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                )}>
                  <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', role === 'USER' ? 'bg-card text-primary' : 'bg-muted text-muted-foreground')}>
                    <User size={19} />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">I want to play</div>
                    <div className="text-xs text-muted-foreground">Find and book turfs near me</div>
                  </div>
                  <div className={cn('w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0', role === 'USER' ? 'bg-primary text-primary-foreground' : 'border-[1.5px] border-border')}>
                    {role === 'USER' && <Check size={12} strokeWidth={3} />}
                  </div>
                </button>

                <button type="button" onClick={() => setRole('OWNER')} className={cn(
                  'w-full flex items-center gap-3.5 p-4 rounded-xl border-2 text-left transition-colors',
                  role === 'OWNER' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                )}>
                  <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', role === 'OWNER' ? 'bg-card text-primary' : 'bg-muted text-muted-foreground')}>
                    <Building2 size={19} />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">I own a turf</div>
                    <div className="text-xs text-muted-foreground">List my venue and manage bookings</div>
                  </div>
                  <div className={cn('w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0', role === 'OWNER' ? 'bg-primary text-primary-foreground' : 'border-[1.5px] border-border')}>
                    {role === 'OWNER' && <Check size={12} strokeWidth={3} />}
                  </div>
                </button>
              </div>

              <Button type="button" className="w-full h-11 rounded-lg font-semibold" onClick={() => setStep('account')}>Continue</Button>
              <div className="text-center mt-5 text-sm text-muted-foreground">
                Already have an account? <Link to="/login" className="text-primary font-semibold">Log in</Link>
              </div>
            </>
          )}

          {/* Step 2: account */}
          {step === 'account' && (
            <form onSubmit={handleCreateAccount}>
              <h1 className="font-display text-2xl font-bold tracking-tight mb-1">Create your account</h1>
              <p className="text-sm text-muted-foreground mb-6">Just three fields — that's all we need.</p>

              <div className="space-y-4 mb-6">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs font-semibold">Full name</Label>
                  <Input id="name" autoComplete="name" placeholder="Aisha Khan" className="h-11 rounded-lg" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold">Email</Label>
                  <Input id="email" type="email" autoComplete="email" placeholder="aisha@email.com" className="h-11 rounded-lg" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-xs font-semibold">
                    Phone <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="9876543210" className="h-11 rounded-lg" value={phone} onChange={e => setPhone(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground">So a venue can reach you about a booking.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs font-semibold">Password</Label>
                  <div className="relative">
                    <Input id="password" type={showPass ? 'text' : 'password'} autoComplete="new-password" placeholder="At least 6 characters" className="h-11 rounded-lg pr-11" value={password} onChange={e => setPassword(e.target.value)} />
                    <button type="button" aria-label={showPass ? 'Hide password' : 'Show password'} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPass(!showPass)}>
                      {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>
              </div>

              {error && <div role="alert" className="bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium p-3 rounded-lg mb-4">{error}</div>}

              <Button type="submit" className="w-full h-11 rounded-lg font-semibold" disabled={loading}>
                {loading ? <Loader2 className="animate-spin" size={18} /> : 'Create account'}
              </Button>
              <div className="text-center mt-4 text-xs text-muted-foreground">By continuing you agree to our Terms &amp; Privacy Policy</div>
            </form>
          )}

          {/* Step 3 (owner only): turf basics */}
          {step === 'turf' && (
            <form onSubmit={handleCreateTurf}>
              <h1 className="font-display text-2xl font-bold tracking-tight mb-1">Tell us about your turf</h1>
              <p className="text-sm text-muted-foreground mb-6">You can edit everything later.</p>

              <div className="space-y-4 mb-6">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Turf name</Label>
                  <Input placeholder="e.g. Green Arena" className="h-11 rounded-lg" value={turfName} onChange={e => setTurfName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Location</Label>
                  <Input placeholder="e.g. Koramangala, Bangalore" className="h-11 rounded-lg" value={turfLocation} onChange={e => setTurfLocation(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Sports <span className="font-normal text-muted-foreground">(select all that apply)</span></Label>
                  <div className="flex flex-wrap gap-2">
                    {allSports.map(s => (
                      <button key={s} type="button" onClick={() => toggleTurfSport(s)} aria-pressed={turfSports.includes(s)} className={cn(
                        'px-3.5 py-2 rounded-full text-xs font-semibold border-[1.5px] capitalize transition-colors',
                        turfSports.includes(s) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'
                      )}>{s}</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Price per hour</Label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">₹</span>
                    <Input placeholder="1000" className="h-11 rounded-lg pl-7" value={turfPrice} onChange={e => setTurfPrice(e.target.value)} />
                  </div>
                </div>
              </div>

              {error && <div role="alert" className="bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium p-3 rounded-lg mb-4">{error}</div>}

              <Button type="submit" className="w-full h-11 rounded-lg font-semibold mb-3" disabled={loading}>
                {loading ? <Loader2 className="animate-spin" size={18} /> : 'Continue'}
              </Button>
              <button type="button" onClick={() => setStep('done')} className="w-full text-center text-xs font-semibold text-muted-foreground hover:text-foreground">
                Skip for now — I'll add it later
              </button>
            </form>
          )}

          {/* Step 4 / final: done */}
          {step === 'done' && (
            <>
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mb-4">
                <Check size={22} className="text-success" strokeWidth={2.5} />
              </div>

              {role === 'USER' ? (
                <>
                  <h1 className="font-display text-2xl font-bold tracking-tight mb-1">You're all set</h1>
                  <p className="text-sm text-muted-foreground mb-7">Your account is ready — go find a slot.</p>
                  <Button type="button" className="w-full h-11 rounded-lg font-semibold mb-3 gap-2" onClick={() => navigate('/turfs')}>
                    Start exploring turfs <ArrowRight size={16} />
                  </Button>
                  <button type="button" onClick={() => navigate('/')} className="w-full text-center text-xs font-semibold text-muted-foreground hover:text-foreground">
                    Skip for now
                  </button>
                </>
              ) : (
                <>
                  <h1 className="font-display text-2xl font-bold tracking-tight mb-1">
                    {turfCreated ? 'Turf submitted for review' : "You're all set"}
                  </h1>
                  <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                    {turfCreated
                      ? "We'll notify you the moment it's approved — usually within a few hours. It'll stay hidden from players until then."
                      : 'Add your first turf anytime from your dashboard to start getting bookings.'}
                  </p>

                  {turfCreated && (
                    <div className="flex items-center gap-3.5 p-3.5 border border-border rounded-xl mb-6">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/40 to-primary/70 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{turfName}</div>
                        <div className="text-xs text-muted-foreground truncate">{turfLocation} · {turfSports.join(', ')}</div>
                      </div>
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-warning/10 text-warning border border-warning/20 whitespace-nowrap">Pending</span>
                    </div>
                  )}

                  <Button type="button" className="w-full h-11 rounded-lg font-semibold gap-2" onClick={() => navigate('/owner')}>
                    Go to my dashboard <ArrowRight size={16} />
                  </Button>
                </>
              )}
            </>
          )}

        </motion.div>
      </AnimatePresence>
    </AuthShell>
  );
}

/* ---------- Forgot password ---------- */

/**
 * There is no password-reset endpoint on the backend yet (no mail transport
 * either). This page used to accept an address and claim "Check your inbox
 * for a reset link" — a message that is simply untrue, and one that leaves a
 * locked-out user waiting for an email that will never arrive instead of
 * asking for help. Until the flow exists, say so.
 */
export function ForgotPasswordPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm text-center p-9">
        <h1 className="font-display text-2xl font-bold tracking-tight mb-1">Reset password</h1>
        <p className="text-sm text-muted-foreground mb-7">
          Self-service password reset isn't available yet.
        </p>
        <div className="bg-muted border text-sm text-left p-5 rounded-xl leading-relaxed mb-6">
          If you can't get into your account, contact us at{' '}
          <a href="mailto:support@turfly.app" className="font-semibold text-primary underline">
            support@turfly.app
          </a>{' '}
          and we'll help you back in.
        </div>
        <Link to="/login">
          <Button className="w-full h-11 rounded-lg font-semibold">Back to login</Button>
        </Link>
      </div>
    </div>
  );
}

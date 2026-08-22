import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { BookingProvider } from "@/contexts/BookingContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { Navbar } from "@/components/Navbar";
import { RequireRole } from "@/components/RequireRole";
import HomePage from "@/pages/HomePage";
import TurfListingPage from "@/pages/TurfListingPage";
import TurfDetailPage from "@/pages/TurfDetailPage";
import BookingFlowPage from "@/pages/BookingFlowPage";
import UserDashboard from "@/pages/UserDashboard";
import { LoginPage, SignupPage, ForgotPasswordPage } from "@/pages/AuthPages";
import NotFound from "@/pages/NotFound";
import AccountSettingsPage from "@/pages/AccountSettingsPage";
import FavoritesPage from "@/pages/FavoritesPage";
import HelpPage from "@/pages/HelpPage";
import { PrivacyPolicyPage, TermsPage } from "@/pages/LegalPages";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { ErrorBoundary } from "@/components/ErrorBoundary";

/**
 * The owner and admin panels are lazy-loaded.
 *
 * They pull in the heaviest dependencies in the app (Recharts for the revenue
 * charts, the whole slot-management tree) and are reachable by a small
 * fraction of visitors — but as static imports every anonymous person browsing
 * turfs downloaded and parsed them before the home page could render.
 */
const OwnerLayout = lazy(() => import("@/pages/owner/OwnerLayout"));
const OwnerDashboard = lazy(() => import("@/pages/owner/OwnerDashboardPage"));
const ManageTurfsPage = lazy(() => import("@/pages/owner/ManageTurfsPage"));
const SlotManagementPage = lazy(() => import("@/pages/owner/SlotManagementPage"));
const OwnerBookingsPage = lazy(() => import("@/pages/owner/OwnerBookingsPage"));
const OwnerCustomersPage = lazy(() => import("@/pages/owner/OwnerCustomersPage"));
const AdminLayout = lazy(() => import("@/pages/admin/AdminLayout"));
const AdminDashboardPage = lazy(() => import("@/pages/admin/AdminDashboardPage"));
const AdminUsersPage = lazy(() => import("@/pages/admin/AdminUsersPage"));
const AdminTurfsPage = lazy(() => import("@/pages/admin/AdminTurfsPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 401/403/404 is an answer, not a blip — retrying it three times only
      // delays the error the user needs to see. Retry once, for transient
      // network/5xx failures.
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const PlayerLayout = ({ children }: { children: React.ReactNode }) => (
  <>
    <Navbar />
    <div className="pb-16 md:pb-0">{children}</div>
    <MobileBottomNav />
  </>
);

const RouteFallback = () => (
  <div className="flex justify-center py-24" role="status" aria-live="polite">
    <Loader2 className="animate-spin text-primary" aria-hidden="true" />
    <span className="sr-only">Loading…</span>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <BookingProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/" element={<PlayerLayout><HomePage /></PlayerLayout>} />
                  <Route path="/turfs" element={<PlayerLayout><TurfListingPage /></PlayerLayout>} />
                  <Route path="/turfs/:id" element={<PlayerLayout><TurfDetailPage /></PlayerLayout>} />
                  <Route path="/booking/:id" element={<RequireRole roles={["USER"]}><PlayerLayout><BookingFlowPage /></PlayerLayout></RequireRole>} />
                  <Route path="/dashboard" element={<RequireRole><PlayerLayout><UserDashboard /></PlayerLayout></RequireRole>} />
                  <Route path="/login" element={<PlayerLayout><LoginPage /></PlayerLayout>} />
                  <Route path="/signup" element={<PlayerLayout><SignupPage /></PlayerLayout>} />
                  <Route path="/forgot-password" element={<PlayerLayout><ForgotPasswordPage /></PlayerLayout>} />
                  <Route path="/account" element={<RequireRole><PlayerLayout><AccountSettingsPage /></PlayerLayout></RequireRole>} />
                  <Route path="/favorites" element={<RequireRole roles={["USER"]}><PlayerLayout><FavoritesPage /></PlayerLayout></RequireRole>} />
                  <Route path="/help" element={<PlayerLayout><HelpPage /></PlayerLayout>} />
                  <Route path="/privacy" element={<PlayerLayout><PrivacyPolicyPage /></PlayerLayout>} />
                  <Route path="/terms" element={<PlayerLayout><TermsPage /></PlayerLayout>} />
                  {/*
                    Scoped boundaries: a render crash inside the owner or
                    admin panel (e.g. the Recharts revenue chart) used to take
                    down the entire app to the same generic screen. Contained
                    here, it only loses that panel — the rest of the site
                    (and the other role's panel) keeps working.
                  */}
                  <Route path="/owner" element={<RequireRole roles={["OWNER"]}><ErrorBoundary boundary="owner"><OwnerLayout /></ErrorBoundary></RequireRole>}>
                    <Route index element={<OwnerDashboard />} />
                    <Route path="turfs" element={<ManageTurfsPage />} />
                    <Route path="slots" element={<SlotManagementPage />} />
                    <Route path="bookings" element={<OwnerBookingsPage />} />
                    <Route path="customers" element={<OwnerCustomersPage />} />
                  </Route>
                  <Route path="/admin" element={<RequireRole roles={["ADMIN"]}><ErrorBoundary boundary="admin"><AdminLayout /></ErrorBoundary></RequireRole>}>
                    <Route index element={<AdminDashboardPage />} />
                    <Route path="users" element={<AdminUsersPage />} />
                    <Route path="turfs" element={<AdminTurfsPage />} />
                  </Route>
                  <Route path="*" element={<PlayerLayout><NotFound /></PlayerLayout>} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </BookingProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
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
import OwnerLayout from "@/pages/owner/OwnerLayout";
import OwnerDashboard from "@/pages/owner/OwnerDashboardPage";
import ManageTurfsPage from "@/pages/owner/ManageTurfsPage";
import SlotManagementPage from "@/pages/owner/SlotManagementPage";
import OwnerBookingsPage from "@/pages/owner/OwnerBookingsPage";
import AdminLayout from "@/pages/admin/AdminLayout";
import AdminDashboardPage from "@/pages/admin/AdminDashboardPage";
import AdminUsersPage from "@/pages/admin/AdminUsersPage";
import AdminTurfsPage from "@/pages/admin/AdminTurfsPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const PlayerLayout = ({ children }: { children: React.ReactNode }) => (
  <><Navbar />{children}</>
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
              <Routes>
                <Route path="/" element={<PlayerLayout><HomePage /></PlayerLayout>} />
                <Route path="/turfs" element={<PlayerLayout><TurfListingPage /></PlayerLayout>} />
                <Route path="/turfs/:id" element={<PlayerLayout><TurfDetailPage /></PlayerLayout>} />
                <Route path="/booking/:id" element={<PlayerLayout><BookingFlowPage /></PlayerLayout>} />
                <Route path="/dashboard" element={<PlayerLayout><UserDashboard /></PlayerLayout>} />
                <Route path="/login" element={<PlayerLayout><LoginPage /></PlayerLayout>} />
                <Route path="/signup" element={<PlayerLayout><SignupPage /></PlayerLayout>} />
                <Route path="/forgot-password" element={<PlayerLayout><ForgotPasswordPage /></PlayerLayout>} />
                <Route path="/owner" element={<RequireRole roles={["OWNER"]}><OwnerLayout /></RequireRole>}>
                  <Route index element={<OwnerDashboard />} />
                  <Route path="turfs" element={<ManageTurfsPage />} />
                  <Route path="slots" element={<SlotManagementPage />} />
                  <Route path="bookings" element={<OwnerBookingsPage />} />
                </Route>
                <Route path="/admin" element={<RequireRole roles={["ADMIN"]}><AdminLayout /></RequireRole>}>
                  <Route index element={<AdminDashboardPage />} />
                  <Route path="users" element={<AdminUsersPage />} />
                  <Route path="turfs" element={<AdminTurfsPage />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </BookingProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;

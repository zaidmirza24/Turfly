
# Turf Booking Platform — Full MVP

A two-sided marketplace for booking sports turfs, inspired by Playo/Airbnb. All three panels (Player, Owner, Admin) built with realistic mock data, clean mobile-first design, and a polished slot booking experience.

---

## Design System

- **Colors**: Green primary (sports/active feel), neutral grays, semantic colors for slot states (green=available, yellow=locked, red=booked)
- **Typography**: Clean sans-serif, clear hierarchy
- **Components**: Rounded cards, subtle shadows, consistent spacing
- **Loading**: Skeleton loaders on all data-heavy pages
- **Feedback**: Toast notifications for all actions (booking, cancellation, etc.)
- **Dark mode** support via Tailwind class toggle

---

## Player Side (6 pages)

### 1. Home Page
- Hero with search bar (location + sport type)
- Sport category pills (Football, Cricket, Badminton, Tennis, etc.)
- Featured turfs carousel
- "Nearby Turfs" section with placeholder map area
- "Book Now" CTA

### 2. Turf Listing Page
- Filter sidebar/sheet: price range, sport type, time slots
- Sort dropdown: price, rating, distance
- Grid of turf cards (image, name, location, price/hr, rating, "View Details" button)
- Results count and active filter chips

### 3. Turf Detail Page
- Image gallery (thumbnail grid + main image)
- Turf info: name, location, amenities (icons), description
- Ratings and reviews section
- **Slot Booking Section** (core feature):
  - Date picker (horizontal scrollable dates)
  - Time slot grid with color-coded states (available/locked/booked)
  - Click to select → slot locks visually (optimistic UI)
  - Floating summary panel with selected slot, price, "Proceed to Book" button

### 4. Booking Flow (multi-step)
- Step 1: Slot confirmation
- Step 2: Booking summary (turf, date, time, price breakdown with taxes)
- Step 3: Mock payment button
- Step 4: Success screen (with booking ID, confetti) or Failure screen (retry option)

### 5. User Dashboard
- Tabs: Upcoming / Past bookings
- Booking cards with status badges (CONFIRMED / CANCELLED)
- Cancel booking button with confirmation dialog
- Empty states for no bookings

### 6. Auth Pages
- Login, Signup, Forgot Password
- Form validation with error messages
- Toggle between login/signup

---

## Owner Panel (4 pages)

Accessed via `/owner` routes with a sidebar layout.

### 1. Owner Dashboard
- Stats cards: total bookings, revenue, upcoming slots
- Recent bookings table
- Quick actions

### 2. Manage Turfs
- List of owner's turfs with edit/delete
- Add Turf form: name, location, sport type, amenities checkboxes, image upload UI (visual only), pricing
- Edit turf in a dialog/sheet

### 3. Slot Management
- Calendar view (week view)
- Set pricing per time slot
- Toggle slot availability (mark unavailable)

### 4. Booking Management
- Table of all bookings for owner's turfs
- Status column with update capability
- Filter by turf, date, status

---

## Admin Panel (3 pages)

Accessed via `/admin` routes with a sidebar layout.

### 1. Users Management
- Table of all users with search
- Role badges (player/owner)

### 2. Turfs Management
- Table of all turfs
- Approve/Reject pending turfs with action buttons
- Status badges

### 3. Overview Dashboard
- Platform stats: total users, turfs, bookings, revenue

---

## Shared / Reusable Components

- Button, Input, Card, Modal/Dialog, DatePicker, Badge, Tabs
- SlotSelector (the core booking grid component)
- TurfCard (used on home, listing pages)
- BookingCard (used on dashboard)
- FilterSheet (mobile filter drawer)
- Skeleton loaders for cards, tables, and detail pages
- Navbar with role-based navigation
- StarRating display

---

## Mock Data

Realistic mock data for:
- 12+ turfs across multiple cities and sport types
- Time slots for 7 days with mixed availability states
- 10+ bookings with various statuses
- User profiles and reviews
- Owner revenue data

---

## Navigation Structure

```text
/                    → Home
/turfs               → Turf Listing
/turfs/:id           → Turf Detail + Booking
/booking/:id         → Booking Flow
/dashboard           → User Dashboard
/login               → Login
/signup              → Signup
/forgot-password     → Forgot Password
/owner               → Owner Dashboard
/owner/turfs         → Manage Turfs
/owner/slots         → Slot Management
/owner/bookings      → Booking Management
/admin               → Admin Dashboard
/admin/users         → Users Management
/admin/turfs         → Turfs Management
```

---

## Technical Details

- React 18 + Vite + TypeScript + Tailwind CSS
- React Router for all routing
- React Context for auth state and booking cart
- Shadcn UI components as the base (already installed)
- date-fns for date handling
- Lucide icons throughout
- All data from mock JSON — structured to easily swap with real API later
- Mobile-first responsive design (works on 320px+)

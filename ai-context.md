# TURF Booking Platform — AI Context

## Project Overview
A turf/sports-facility booking platform with a phased architecture designed for scalability.  
**Current Phase: Midnight Elite Implementation** — Advanced UI/UX with Obsidian dark theme, enhanced analytics, and 24/7 scheduling engine.

---

## Tech Stack

| Layer     | Technology                              |
|-----------|-----------------------------------------|
| Frontend  | React 18 + TypeScript + Vite + shadcn/ui + Tailwind CSS |
| Backend   | Node.js + Express (ESM) + Mongoose      |
| Database  | MongoDB                                 |
| Auth      | JWT (Bearer tokens) + bcryptjs          |
| UI/UX     | Framer Motion (Animations), Recharts (Analytics), Lucide (Icons) |
| Dev Tools | nodemon, Vitest (frontend tests)        |

---

## Architecture

```
Backend/src/
├── server.js                        # Entry point
├── common/
│   ├── config/
│   │   ├── env.js                   # Centralized env config
│   │   └── db.js                    # MongoDB connection
│   ├── middlewares/
│   │   ├── auth.js                  # JWT protect + role authorize
│   │   └── errorHandler.js          # Global error handler
│   └── utils/
│       ├── ApiError.js              # Custom error class
│       └── ApiResponse.js           # Standardized response wrapper
├── modules/
│   ├── auth/
│   │   ├── auth.service.js          # Register, login, token generation
│   │   ├── auth.controller.js       # Thin HTTP layer
│   │   └── auth.routes.js
│   ├── user/
│   │   └── user.model.js            # User schema + password hashing
│   ├── turf/
│   │   ├── turf.model.js
│   │   ├── turf.service.js
│   │   ├── turf.controller.js
│   │   └── turf.routes.js
│   ├── slot/
│   │   ├── slot.model.js            # ⚡ Future-proofed with LOCKED status
│   │   ├── slot.service.js
│   │   ├── slot.controller.js
│   │   └── slot.routes.js
│   └── booking/
│       ├── booking.model.js
│       ├── booking.service.js       # 🔥 Core booking logic lives HERE
│       ├── booking.controller.js
│       └── booking.routes.js
```

---

## Key Design Decisions

### 1. Service Layer Pattern
- **Controllers are thin** — they only parse req/res and call services
- **Services contain ALL business logic** — validation, DB operations, error throwing
- **Why:** In Phase 2, ONLY `booking.service.js` needs to change for atomic locking

### 2. Future-Proofed Slot Schema
The Slot model already includes fields for Phase 2:
```js
status: "AVAILABLE" | "LOCKED" | "BOOKED"  // LOCKED not used yet
lockedBy: ObjectId | null                    // not used yet
lockExpiresAt: Date | null                   // not used yet
```
**Phase 1** only transitions: `AVAILABLE ↔ BOOKED`  
**Phase 2** will add: `AVAILABLE → LOCKED → BOOKED` with atomic operations

### 3. Role-Based Access
- `USER` — can browse turfs, view slots, book, cancel
- `OWNER` — can create turfs, create slots, view their bookings

### 4. Midnight Elite Design System
- **Aesthetic**: Obsidian dark mode with glassmorphism effects.
- **UX**: Premium micro-animations using Framer Motion for interactive elements.
- **Analytics**: Data-driven dashboards for owners using Recharts to visualize revenue and booking trends.

### 5. Error Handling
- `express-async-errors` — catches all async errors globally
- `ApiError` — throw from anywhere with status code
- `errorHandler` middleware — normalizes Mongoose/JWT/custom errors

---

## API Endpoints

### Auth
| Method | Route               | Auth | Description        |
|--------|---------------------|------|--------------------|
| POST   | `/api/auth/register` | ❌   | Register user      |
| POST   | `/api/auth/login`    | ❌   | Login user         |

### Turfs
| Method | Route             | Auth  | Role  | Description       |
|--------|-------------------|-------|-------|-------------------|
| POST   | `/api/turfs`      | ✅    | OWNER | Create turf       |
| GET    | `/api/turfs`      | ❌    | —     | List all turfs    |
| GET    | `/api/turfs/:id`  | ❌    | —     | Get turf details  |

### Slots
| Method | Route          | Auth  | Role  | Description                  |
|--------|----------------|-------|-------|------------------------------|
| POST   | `/api/slots`   | ✅    | OWNER | Create slots (bulk)          |
| GET    | `/api/slots`   | ❌    | —     | Get slots (query: turfId, date, status) |

### Bookings
| Method | Route                         | Auth | Role  | Description           |
|--------|-------------------------------|------|-------|-----------------------|
| POST   | `/api/bookings`               | ✅   | USER  | Book a slot           |
| GET    | `/api/bookings/me`            | ✅   | —     | My bookings           |
| DELETE | `/api/bookings/:id`           | ✅   | USER  | Cancel booking        |
| GET    | `/api/bookings/turf/:turfId`  | ✅   | OWNER | Turf's bookings       |

---

## Request/Response Shapes

### Register
```json
// POST /api/auth/register
{
  "name": "John",
  "email": "john@test.com",
  "phone": "9876543210",
  "password": "password123",
  "role": "USER"
}
// → { success, message, data: { user, token } }
```

### Create Slots (Bulk)
```json
// POST /api/slots
{
  "turfId": "...",
  "slots": [
    { "startTime": "2026-01-15T06:00:00Z", "endTime": "2026-01-15T07:00:00Z", "price": 500 },
    { "startTime": "2026-01-15T07:00:00Z", "endTime": "2026-01-15T08:00:00Z", "price": 600 }
  ]
}
```

### Book Slot
```json
// POST /api/bookings
{ "slotId": "..." }
// → { success, message, data: booking }
```

---

## Phase 2 Upgrade Path (DO NOT implement yet)

When upgrading to Phase 2, the ONLY changes needed:

1. **`booking.service.js` → `bookSlot()`** — Replace simple check with atomic:
   ```js
   // Atomic lock (Phase 2)
   const locked = await Slot.findOneAndUpdate(
     { _id: slotId, status: "AVAILABLE" },
     { status: "LOCKED", lockedBy: userId, lockExpiresAt: new Date(Date.now() + 5*60*1000) },
     { new: true }
   );
   if (!locked) throw new ApiError(409, "Slot not available");
   ```

2. **Add a lock expiry cron job** — releases `LOCKED` slots where `lockExpiresAt < now`

3. **Add payment integration** — between LOCKED and BOOKED states

4. **No DB schema changes needed** — fields are already there

---

## What's Intentionally NOT Implemented (Currently)

- ❌ Slot locking / concurrency safety (Phase 2 core logic)
- ❌ Payment gateway integration (using simulated checkout)
- ❌ Webhooks / real-time updates (Socket.io)
- ❌ Image uploads for turfs (currently using generated asset URLs)
- ❌ Admin panel (multi-owner management)

---

## Running the Project

```bash
# Backend
cd Backend
npm install
npm run dev       # → localhost:5000

# Frontend
cd Frontend
npm install
npm run dev       # → localhost:5173 (Vite)
```

## Environment Variables (Backend/.env)
```
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/turf_booking
JWT_SECRET=turf_super_secret_key_change_in_production
JWT_EXPIRES_IN=7d
NODE_ENV=development
```

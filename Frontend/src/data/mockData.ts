import { Turf, TimeSlot, Booking, Review, User } from '@/types';

export const mockUsers: User[] = [
  { id: 'u1', name: 'Rahul Sharma', email: 'rahul@example.com', phone: '+91 98765 43210', role: 'player', createdAt: '2024-01-15' },
  { id: 'u2', name: 'Priya Patel', email: 'priya@example.com', phone: '+91 87654 32109', role: 'player', createdAt: '2024-02-20' },
  { id: 'u3', name: 'Amit Kumar', email: 'amit@example.com', phone: '+91 76543 21098', role: 'owner', createdAt: '2024-01-10' },
  { id: 'u4', name: 'Sneha Reddy', email: 'sneha@example.com', phone: '+91 65432 10987', role: 'owner', createdAt: '2024-03-05' },
  { id: 'u5', name: 'Vikram Singh', email: 'vikram@example.com', phone: '+91 54321 09876', role: 'player', createdAt: '2024-04-12' },
  { id: 'u6', name: 'Ananya Gupta', email: 'ananya@example.com', phone: '+91 43210 98765', role: 'player', createdAt: '2024-05-01' },
  { id: 'u7', name: 'Admin User', email: 'admin@turfbook.com', phone: '+91 99999 99999', role: 'admin', createdAt: '2024-01-01' },
  { id: 'u8', name: 'Karthik Nair', email: 'karthik@example.com', phone: '+91 32109 87654', role: 'player', createdAt: '2024-06-15' },
];

const turfImages = [
  'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=800&q=80',
  'https://images.unsplash.com/photo-1575361204480-aadea25e6e68?w=800&q=80',
  'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=800&q=80',
  'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80',
  'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=800&q=80',
  'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=800&q=80',
];

export const mockTurfs: Turf[] = [
  {
    id: 't1', name: 'Green Arena Football Turf', location: 'Koramangala, Bangalore', city: 'Bangalore',
    description: 'Premium 7-a-side football turf with FIFA-approved synthetic grass. Floodlights available for night games. Changing rooms and drinking water provided.',
    sport: ['football'], amenities: ['Floodlights', 'Changing Rooms', 'Parking', 'Drinking Water', 'First Aid'],
    pricePerHour: 1500, rating: 4.5, reviewCount: 128, images: [turfImages[0], turfImages[3], turfImages[5]],
    ownerId: 'u3', approvalStatus: 'approved', isActive: true,
  },
  {
    id: 't2', name: 'Smash Court Badminton', location: 'Indiranagar, Bangalore', city: 'Bangalore',
    description: 'Indoor badminton courts with wooden flooring and professional-grade nets. Air-conditioned for year-round comfort.',
    sport: ['badminton'], amenities: ['Air Conditioning', 'Changing Rooms', 'Pro Shop', 'Parking', 'Cafeteria'],
    pricePerHour: 800, rating: 4.7, reviewCount: 95, images: [turfImages[1], turfImages[2]],
    ownerId: 'u3', approvalStatus: 'approved', isActive: true,
  },
  {
    id: 't3', name: 'Cricket Hub Net Practice', location: 'HSR Layout, Bangalore', city: 'Bangalore',
    description: 'Professional cricket practice nets with bowling machines. 4 nets available for individual or group practice.',
    sport: ['cricket'], amenities: ['Bowling Machine', 'Floodlights', 'Parking', 'Equipment Rental'],
    pricePerHour: 1200, rating: 4.3, reviewCount: 67, images: [turfImages[2], turfImages[4]],
    ownerId: 'u4', approvalStatus: 'approved', isActive: true,
  },
  {
    id: 't4', name: 'Ace Tennis Academy', location: 'Whitefield, Bangalore', city: 'Bangalore',
    description: 'Clay and hard courts available. Professional coaching and equipment rental. Perfect for beginners and advanced players.',
    sport: ['tennis'], amenities: ['Coaching', 'Equipment Rental', 'Changing Rooms', 'Cafeteria', 'Parking'],
    pricePerHour: 1000, rating: 4.6, reviewCount: 53, images: [turfImages[3], turfImages[0]],
    ownerId: 'u4', approvalStatus: 'approved', isActive: true,
  },
  {
    id: 't5', name: 'PowerPlay Sports Arena', location: 'Andheri West, Mumbai', city: 'Mumbai',
    description: 'Multi-sport facility with football turf, basketball court, and volleyball court. Weekend tournaments regularly organized.',
    sport: ['football', 'basketball', 'volleyball'], amenities: ['Floodlights', 'Scoreboard', 'Changing Rooms', 'Parking', 'Cafeteria', 'First Aid'],
    pricePerHour: 2000, rating: 4.8, reviewCount: 210, images: [turfImages[4], turfImages[5], turfImages[0]],
    ownerId: 'u3', approvalStatus: 'approved', isActive: true,
  },
  {
    id: 't6', name: 'Urban Kick Football', location: 'Bandra, Mumbai', city: 'Mumbai',
    description: 'Rooftop football turf with stunning city views. 5-a-side format, perfect for quick after-work games.',
    sport: ['football'], amenities: ['Floodlights', 'Lounge', 'Drinking Water', 'Changing Rooms'],
    pricePerHour: 1800, rating: 4.4, reviewCount: 89, images: [turfImages[5], turfImages[3]],
    ownerId: 'u4', approvalStatus: 'approved', isActive: true,
  },
  {
    id: 't7', name: 'Shuttle Zone', location: 'Jubilee Hills, Hyderabad', city: 'Hyderabad',
    description: 'State-of-the-art badminton facility with 6 courts. Synthetic mat flooring for optimal grip.',
    sport: ['badminton'], amenities: ['Air Conditioning', 'Pro Shop', 'Coaching', 'Parking', 'Cafeteria'],
    pricePerHour: 700, rating: 4.2, reviewCount: 42, images: [turfImages[1], turfImages[2]],
    ownerId: 'u3', approvalStatus: 'approved', isActive: true,
  },
  {
    id: 't8', name: 'The Cricket Ground', location: 'Gachibowli, Hyderabad', city: 'Hyderabad',
    description: 'Full-size cricket ground available for matches and practice. Well-maintained pitch and outfield.',
    sport: ['cricket'], amenities: ['Pavilion', 'Scoreboard', 'Changing Rooms', 'Parking', 'First Aid'],
    pricePerHour: 3000, rating: 4.9, reviewCount: 156, images: [turfImages[2], turfImages[4], turfImages[0]],
    ownerId: 'u4', approvalStatus: 'approved', isActive: true,
  },
  {
    id: 't9', name: 'Hoop Dreams Basketball', location: 'T Nagar, Chennai', city: 'Chennai',
    description: 'Indoor basketball court with NBA-standard flooring. Perfect for pickup games and league matches.',
    sport: ['basketball'], amenities: ['Air Conditioning', 'Scoreboard', 'Changing Rooms', 'Parking'],
    pricePerHour: 900, rating: 4.1, reviewCount: 34, images: [turfImages[3], turfImages[5]],
    ownerId: 'u3', approvalStatus: 'approved', isActive: true,
  },
  {
    id: 't10', name: 'Victory Football Arena', location: 'Salt Lake, Kolkata', city: 'Kolkata',
    description: 'Large 11-a-side football ground with natural grass. Floodlit for evening and night matches.',
    sport: ['football'], amenities: ['Floodlights', 'Changing Rooms', 'Parking', 'First Aid', 'Drinking Water'],
    pricePerHour: 2500, rating: 4.6, reviewCount: 178, images: [turfImages[0], turfImages[4]],
    ownerId: 'u4', approvalStatus: 'approved', isActive: true,
  },
  {
    id: 't11', name: 'Spike Volleyball Club', location: 'Kothrud, Pune', city: 'Pune',
    description: 'Beach-style volleyball court with sand surface. Great for recreational and competitive play.',
    sport: ['volleyball'], amenities: ['Floodlights', 'Changing Rooms', 'Parking', 'Equipment Rental'],
    pricePerHour: 600, rating: 4.0, reviewCount: 22, images: [turfImages[5], turfImages[1]],
    ownerId: 'u3', approvalStatus: 'approved', isActive: true,
  },
  {
    id: 't12', name: 'Pending Turf Request', location: 'MG Road, Bangalore', city: 'Bangalore',
    description: 'A new multi-sport facility awaiting admin approval.',
    sport: ['football', 'cricket'], amenities: ['Floodlights', 'Parking'],
    pricePerHour: 1100, rating: 0, reviewCount: 0, images: [turfImages[2]],
    ownerId: 'u4', approvalStatus: 'pending', isActive: false,
  },
];

function generateSlots(turfId: string, basePrice: number): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const today = new Date();
  for (let d = 0; d < 7; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() + d);
    const dateStr = date.toISOString().split('T')[0];
    for (let h = 6; h <= 22; h++) {
      const rand = Math.random();
      let status: SlotStatus = 'available';
      if (rand < 0.2) status = 'booked';
      else if (rand < 0.3) status = 'locked';
      const priceMultiplier = (h >= 17 && h <= 21) ? 1.5 : (h >= 6 && h <= 9) ? 0.8 : 1;
      slots.push({
        id: `${turfId}-${dateStr}-${h}`,
        turfId,
        date: dateStr,
        startTime: `${h.toString().padStart(2, '0')}:00`,
        endTime: `${(h + 1).toString().padStart(2, '0')}:00`,
        status,
        price: Math.round(basePrice * priceMultiplier),
      });
    }
  }
  return slots;
}

export const mockSlots: TimeSlot[] = mockTurfs.flatMap(t => generateSlots(t.id, t.pricePerHour));

export const mockBookings: Booking[] = [
  { id: 'b1', turfId: 't1', turfName: 'Green Arena Football Turf', userId: 'u1', slotId: 't1-2026-05-02-18', date: '2026-05-02', startTime: '18:00', endTime: '19:00', amount: 2250, tax: 405, totalAmount: 2655, status: 'confirmed', sport: 'football', createdAt: '2026-04-30' },
  { id: 'b2', turfId: 't2', turfName: 'Smash Court Badminton', userId: 'u1', slotId: 't2-2026-05-03-10', date: '2026-05-03', startTime: '10:00', endTime: '11:00', amount: 800, tax: 144, totalAmount: 944, status: 'confirmed', sport: 'badminton', createdAt: '2026-04-29' },
  { id: 'b3', turfId: 't5', turfName: 'PowerPlay Sports Arena', userId: 'u2', slotId: 't5-2026-05-04-17', date: '2026-05-04', startTime: '17:00', endTime: '18:00', amount: 3000, tax: 540, totalAmount: 3540, status: 'confirmed', sport: 'football', createdAt: '2026-04-28' },
  { id: 'b4', turfId: 't3', turfName: 'Cricket Hub Net Practice', userId: 'u5', slotId: 't3-2026-04-25-14', date: '2026-04-25', startTime: '14:00', endTime: '15:00', amount: 1200, tax: 216, totalAmount: 1416, status: 'confirmed', sport: 'cricket', createdAt: '2026-04-20' },
  { id: 'b5', turfId: 't1', turfName: 'Green Arena Football Turf', userId: 'u1', slotId: 't1-2026-04-20-19', date: '2026-04-20', startTime: '19:00', endTime: '20:00', amount: 2250, tax: 405, totalAmount: 2655, status: 'cancelled', sport: 'football', createdAt: '2026-04-18' },
  { id: 'b6', turfId: 't4', turfName: 'Ace Tennis Academy', userId: 'u6', slotId: 't4-2026-05-05-08', date: '2026-05-05', startTime: '08:00', endTime: '09:00', amount: 800, tax: 144, totalAmount: 944, status: 'confirmed', sport: 'tennis', createdAt: '2026-05-01' },
  { id: 'b7', turfId: 't8', turfName: 'The Cricket Ground', userId: 'u8', slotId: 't8-2026-04-28-10', date: '2026-04-28', startTime: '10:00', endTime: '11:00', amount: 3000, tax: 540, totalAmount: 3540, status: 'confirmed', sport: 'cricket', createdAt: '2026-04-25' },
  { id: 'b8', turfId: 't6', turfName: 'Urban Kick Football', userId: 'u2', slotId: 't6-2026-04-22-20', date: '2026-04-22', startTime: '20:00', endTime: '21:00', amount: 2700, tax: 486, totalAmount: 3186, status: 'cancelled', sport: 'football', createdAt: '2026-04-19' },
  { id: 'b9', turfId: 't7', turfName: 'Shuttle Zone', userId: 'u5', slotId: 't7-2026-05-06-16', date: '2026-05-06', startTime: '16:00', endTime: '17:00', amount: 700, tax: 126, totalAmount: 826, status: 'confirmed', sport: 'badminton', createdAt: '2026-05-02' },
  { id: 'b10', turfId: 't9', turfName: 'Hoop Dreams Basketball', userId: 'u6', slotId: 't9-2026-05-07-18', date: '2026-05-07', startTime: '18:00', endTime: '19:00', amount: 1350, tax: 243, totalAmount: 1593, status: 'pending', sport: 'basketball', createdAt: '2026-05-02' },
];

export const mockReviews: Review[] = [
  { id: 'r1', turfId: 't1', userId: 'u1', userName: 'Rahul Sharma', rating: 5, comment: 'Amazing turf! The grass quality is top-notch and the floodlights make evening games perfect.', createdAt: '2026-04-28' },
  { id: 'r2', turfId: 't1', userId: 'u2', userName: 'Priya Patel', rating: 4, comment: 'Great experience overall. Parking could be better but the turf itself is excellent.', createdAt: '2026-04-25' },
  { id: 'r3', turfId: 't1', userId: 'u5', userName: 'Vikram Singh', rating: 4, comment: 'Good turf, fair pricing. Would recommend for weekend games.', createdAt: '2026-04-20' },
  { id: 'r4', turfId: 't2', userId: 'u6', userName: 'Ananya Gupta', rating: 5, comment: 'Best badminton courts in the area! AC works great and the flooring is perfect.', createdAt: '2026-04-22' },
  { id: 'r5', turfId: 't5', userId: 'u8', userName: 'Karthik Nair', rating: 5, comment: 'Multi-sport facility is a game changer. We played football and basketball in one visit!', createdAt: '2026-04-30' },
  { id: 'r6', turfId: 't8', userId: 'u1', userName: 'Rahul Sharma', rating: 5, comment: 'Incredible cricket ground. The pitch is well maintained and the outfield is fast.', createdAt: '2026-04-26' },
  { id: 'r7', turfId: 't3', userId: 'u5', userName: 'Vikram Singh', rating: 4, comment: 'Good nets for practice. The bowling machine could use an upgrade though.', createdAt: '2026-04-15' },
  { id: 'r8', turfId: 't4', userId: 'u6', userName: 'Ananya Gupta', rating: 5, comment: 'Loved the clay court! Coaching is professional and equipment is well maintained.', createdAt: '2026-04-18' },
];

export type SlotStatus = 'available' | 'locked' | 'booked';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-8">
    <h2 className="text-lg font-bold mb-2">{title}</h2>
    <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{children}</div>
  </section>
);

export function PrivacyPolicyPage() {
  return (
    <div className="container mx-auto px-4 py-10 max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Privacy Policy</h1>
      <p className="text-xs text-muted-foreground mb-8">Last updated: this page describes the data this platform actually collects and stores today.</p>

      <Section title="What we collect">
        <p>Account details you provide at signup — name, email, phone, and password (stored hashed, never in plain text). If you use "near me" search, your device's location is used in your browser only to sort results; it isn't stored on our servers.</p>
      </Section>
      <Section title="Booking &amp; review data">
        <p>Your bookings (venue, slot, amount) and any reviews you write are stored to power My Bookings, venue ratings, and owner dashboards. A review requires a confirmed booking, so it's linked to that booking record.</p>
      </Section>
      <Section title="What we don't do">
        <p>We don't sell your data to third parties. We don't process real payments today — checkout on this platform is currently simulated, so no card or bank details are collected or stored anywhere in this system.</p>
      </Section>
      <Section title="Deleting your data">
        <p>You can delete your account from Account Settings. This anonymizes your profile (name, email, phone) — your past bookings remain on record for the venues you visited, the same way a receipt remains valid after a store closes your loyalty account.</p>
      </Section>
      <Section title="Contact">
        <p>Questions about your data — reach out via the Help &amp; Support page.</p>
      </Section>
    </div>
  );
}

export function TermsPage() {
  return (
    <div className="container mx-auto px-4 py-10 max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Terms &amp; Conditions</h1>
      <p className="text-xs text-muted-foreground mb-8">Plain-language terms for using this platform.</p>

      <Section title="Bookings">
        <p>A confirmed booking reserves a specific time slot at a venue. Slots are locked atomically at checkout, so a slot is never double-booked. Checkout on this platform is currently simulated — no real payment is collected.</p>
      </Section>
      <Section title="Cancellation policy">
        <p><strong>Bookings are non-refundable.</strong> Payment secures the slot for you, and the venue holds it open on that basis, so the amount paid is not returned if you cancel or don't attend.</p>
        <p>You may cancel from My Bookings up to 6 hours before the slot's start time. Cancelling releases the slot so the venue can resell it, but does not return your payment. Cancellations inside that window, or after the slot has started, aren't permitted.</p>
        <p>If a venue cancels your booking, contact the venue directly about the amount you paid. If you were charged for a booking that was never confirmed, that payment is refunded automatically.</p>
      </Section>
      <Section title="Venue listings">
        <p>Every venue is reviewed by our team before it appears in search — see the "Verified Venue" badge on a listing. We don't independently verify every detail an owner provides (amenities, photos, house rules); report anything inaccurate via Help &amp; Support.</p>
      </Section>
      <Section title="Reviews">
        <p>Only customers with a confirmed booking at a venue may review it. Reviews should reflect genuine experiences; you may report a review that violates this, and a venue owner may post one public response to a review.</p>
      </Section>
      <Section title="Account conduct">
        <p>Accounts found abusing the platform (fraudulent bookings, fake reviews, harassment) may be suspended by an administrator.</p>
      </Section>
    </div>
  );
}

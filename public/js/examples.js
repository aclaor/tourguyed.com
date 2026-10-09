// Example trip requests — clearly labelled samples that show travelers and guides what a real request looks like.
// They only fill empty slots: as real requests arrive, examples drop off automatically. They are never sent offers.
(function () {
  const d = n => { const t = new Date(); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); }; // dates stay in the future
  window.TG_EXAMPLES = [
    { photo: '/img/examples/traveler-1.jpg', name: 'Kenji T.', city: 'Honolulu', country: 'United States', start: 24, nights: 6, adults: 1, children: 0, budget: 250, currency: 'USD',
      interests: ['Surfing', 'Hiking', 'Local food'], languages: ['English', 'Japanese'], tour_style: 'Adventure', pace: 'Packed', hours_per_day: 6,
      meeting_place: 'Hotel lobby in Waikiki', accommodation: 'Hotel in Waikiki (booked)', transport: 'Guide provides car', notes: 'First time in Hawaii. Want a beginner surf lesson, Diamond Head sunrise and the best poke spots locals go to.' },
    { photo: '/img/examples/traveler-2.jpg', name: 'Liam O.', city: 'Lisbon', country: 'Portugal', start: 31, nights: 4, adults: 2, children: 0, budget: 180, currency: 'EUR',
      interests: ['Food & wine', 'History', 'Street art'], languages: ['English'], tour_style: 'Private', pace: 'Relaxed', hours_per_day: 4,
      meeting_place: 'Praça do Comércio', accommodation: 'Apartment in Alfama', transport: 'Walking', notes: 'Remote worker travelling with my partner. We love hidden tascas, pastel de nata and viewpoints without the crowds.' },
    { photo: '/img/examples/traveler-3.jpg', name: 'Aya R.', city: 'Kyoto', country: 'Japan', start: 45, nights: 5, adults: 2, children: 0, budget: 40000, currency: 'JPY',
      interests: ['Temples', 'Tea ceremony', 'Photography'], languages: ['English', 'Filipino'], tour_style: 'Private', pace: 'Moderate', hours_per_day: 5,
      meeting_place: 'Kyoto Station, central exit', accommodation: 'Ryokan near Gion', transport: 'Public transport', dietary: 'No pork', notes: 'Looking for early-morning temple visits before the tour buses, and a real tea ceremony.' },
    { photo: '/img/examples/traveler-4.jpg', name: 'Sofia M.', city: 'Seoul', country: 'South Korea', start: 18, nights: 7, adults: 1, children: 0, budget: 300000, currency: 'KRW',
      interests: ['Cafés', 'K-culture', 'Shopping', 'Night markets'], languages: ['English', 'Spanish'], tour_style: 'Small group', pace: 'Moderate', hours_per_day: 5,
      meeting_place: 'Hongdae Station exit 9', accommodation: 'Guesthouse in Hongdae', transport: 'Public transport', notes: 'Solo female traveler — prefer a female guide. Would love Seongsu cafés and Gwangjang market food.' , guide_gender: 'Female' },
    { photo: '/img/examples/traveler-5.jpg', name: 'Nia B.', city: 'Cape Town', country: 'South Africa', start: 52, nights: 6, adults: 2, children: 0, budget: 4500, currency: 'ZAR',
      interests: ['Hiking', 'Wildlife', 'Wine'], languages: ['English', 'French'], tour_style: 'Adventure', pace: 'Packed', hours_per_day: 7,
      meeting_place: 'V&A Waterfront', accommodation: 'Not booked yet', accommodation_help: 1, transport: 'Guide provides car', notes: 'Table Mountain hike, penguins at Boulders Beach and a day in the winelands. Need help finding a stay near the waterfront.' },
    { photo: '/img/examples/traveler-6.jpg', name: 'Marco D.', city: 'Ubud, Bali', country: 'Indonesia', start: 38, nights: 5, adults: 1, children: 1, budget: 3500000, currency: 'IDR',
      interests: ['Waterfalls', 'Rice terraces', 'Culture'], languages: ['English', 'Italian'], tour_style: 'Family-friendly', pace: 'Relaxed', hours_per_day: 4,
      meeting_place: 'Our villa in Ubud', accommodation: 'Villa in Ubud (booked)', transport: 'Guide provides car', requirements: 'Travelling with my 4-year-old daughter — short walks and shade breaks please.', notes: 'Kid-friendly waterfalls and a fun cultural activity like batik or a dance show.' },
    { photo: '/img/examples/traveler-7.jpg', name: 'James W.', city: 'El Nido', country: 'Philippines', start: 60, nights: 4, adults: 2, children: 1, budget: 15000, currency: 'PHP',
      interests: ['Island hopping', 'Snorkeling', 'Beaches'], languages: ['English'], tour_style: 'Family-friendly', pace: 'Relaxed', hours_per_day: 6,
      meeting_place: 'El Nido town pier', accommodation: 'Resort in Corong-Corong', transport: 'Boat', dietary: 'Seafood allergy (child)', notes: 'Want a private boat for lagoons and a quiet beach for sunset with our daughter.' }
  ].map((x, i) => ({ ...x, example: true, id: 'ex' + (i + 1), start_date: d(x.start), end_date: d(x.start + x.nights), flexible: 0, offers: 0, student_ok: 1 }));
})();

// Linijske ikonice (stil kao lucide) za osnovne kategorije i račune.
// Kategorije koje korisnik sam napravi zadržavaju svoj emodži.
const P = {
  krediti: '<path d="M3 21h18M5 21V10M19 21V10M9 21v-6M15 21v-6M12 3l9 5H3z"/>',
  racuni: '<path d="M5 3h14v18l-2.5-1.6L14 21l-2-1.6L10 21l-2.5-1.6L5 21z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  hrana: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 12.4A2 2 0 0 0 9.6 17h8.8a2 2 0 0 0 2-1.6L22 7H6"/>',
  auto: '<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M3 21h13M7 8h5M15 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V8l-3-3"/>',
  zdravlje: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  izlasci: '<path d="M8 22h8M12 15v7M7 3h10l-.8 6a4.2 4.2 0 0 1-8.4 0z"/>',
  dom: '<path d="M3 11l9-8 9 8M5 10v11h14V10M10 21v-6h4v6"/>',
  odeca: '<path d="M8 3 3 6l2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0z"/>',
  pokloni: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13M12 8c-2.5 0-4.5-1-4.5-2.6S9.5 3 12 8zM12 8c2.5 0 4.5-1 4.5-2.6S14.5 3 12 8z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  ostalo: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
  iscurelo: '<path d="M12 3s7 7.5 7 12a7 7 0 0 1-14 0c0-4.5 7-12 7-12z"/>',
  plata: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  dodatno: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>',
  stednja: '<path d="M19 9.5c0-3-3-5.5-7.5-5.5S4 6.5 4 10c0 1.8.8 3.3 2 4.3V19h3v-2h4v2h3v-3.2c1-.6 1.8-1.4 2.2-2.3H20v-4z"/><path d="M15.5 9.5h.01M2 9c0 1 .5 1.8 1.5 2"/>',
  investicije: '<path d="M3 17l6-6 4 4 8-8M14 7h7v7"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  cash: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14h.01"/>',
  transfer: '<path d="M7 7h13l-3-3M17 17H4l3 3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  goal: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
};
const ALIAS = { 'licno-dj': 'user', 'licno-m': 'user', dj: 'card', m: 'card', kes: 'cash' };

export const svg = (name) =>
  `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.ostalo}</svg>`;

// Ikonica za kategoriju (ili račun): linijska za poznate, emodži za korisničke.
export function ico(c) {
  const id = typeof c === 'string' ? c : c?.id;
  const key = P[id] ? id : ALIAS[id];
  if (key) return svg(key);
  return (typeof c === 'object' && c?.icon) || svg('ostalo');
}

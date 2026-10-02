// Inline SVG icons (24×24, stroke-based).
import { raw } from "./html.js";

const P = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  camera: '<path d="M14.5 4h-5L7.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.5z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.5-3.5a2 2 0 0 0-2.8 0L5 21"/>',
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  star: '<path d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L12 17.6l-5.8 3 1.1-6.4-4.7-4.6 6.5-.9z"/>',
  bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7.5 16v-4M12 16V8M16.5 16v-6.5"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  flame: '<path d="M12 22c4.2 0 7-2.8 7-6.8 0-3.3-2-5.7-4.3-7.9-.4 2-1.3 3.4-2.6 4 .4-3.6-1.2-6.6-4.1-8.8.1 3.4-1.7 5.8-3.4 7.9C3.3 12.1 5 22 12 22z"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M5.5 6l1 14a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2l1-14"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  cloud: '<path d="M17.5 19H7a5 5 0 1 1 1.1-9.9A6 6 0 0 1 19.6 11a4 4 0 0 1-2.1 8z"/>',
  cloudOff: '<path d="M17.5 19H7a5 5 0 0 1-1.6-9.7M10 6.3A6 6 0 0 1 19.6 11a4 4 0 0 1 1.3 6.5"/><path d="m2 2 20 20"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  upload: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 21h14"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  scale: '<path d="M12 3v18M5 21h14"/><path d="M3 9l3-5 3 5a3 3 0 0 1-6 0zM15 9l3-5 3 5a3 3 0 0 1-6 0z"/><path d="M6 4h12"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  utensils: '<path d="M7 2v8a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V2M9 12v10M17 22V2c-2.2 1.2-3.5 3.8-3.5 7v4H17"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
};

export function icon(name, size = 20, extra = "") {
  return raw(
    `<svg class="icon ${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ""}</svg>`,
  );
}

export function flame(size = 18, lit = true) {
  return raw(
    `<svg class="flame ${lit ? "lit" : ""}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22c4.2 0 7-2.8 7-6.8 0-3.3-2-5.7-4.3-7.9-.4 2-1.3 3.4-2.6 4 .4-3.6-1.2-6.6-4.1-8.8.1 3.4-1.7 5.8-3.4 7.9C3.3 12.1 5 22 12 22z" fill="currentColor"/><path d="M12 21c2 0 3.4-1.3 3.4-3.2 0-1.6-1-2.8-2.1-3.8-.2 1-.7 1.6-1.3 1.9.2-1.7-.6-3.2-2-4.2 0 1.6-.8 2.8-1.6 3.8C7.6 16.6 8.6 21 12 21z" fill="var(--flame-core)"/></svg>`,
  );
}

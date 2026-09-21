// Inline-SVG statt Icon-Font: nichts nachzuladen, faerbt sich per currentColor.
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const IconList = (p) => (
  <svg {...base} {...p}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
  <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
  <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
);

export const IconCalendar = (p) => (
  <svg {...base} {...p}><rect x="3" y="4" width="18" height="18" rx="1" />
  <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
  <line x1="3" y1="10" x2="21" y2="10" /></svg>
);

export const IconGrid = (p) => (
  <svg {...base} {...p}><rect x="3" y="3" width="18" height="18" rx="1" />
  <line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" />
  <line x1="9" y1="9" x2="9" y2="21" /></svg>
);

export const IconPlus = (p) => (
  <svg {...base} {...p}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
);

export const IconMore = (p) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="5" r="1.6" />
  <circle cx="12" cy="19" r="1.6" /></svg>
);

export const IconBack = (p) => (
  <svg {...base} {...p}><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
);

export const IconChevronLeft = (p) => (
  <svg {...base} {...p}><polyline points="15 18 9 12 15 6" /></svg>
);

export const IconChevronRight = (p) => (
  <svg {...base} {...p}><polyline points="9 18 15 12 9 6" /></svg>
);

export const IconClose = (p) => (
  <svg {...base} {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
);

export const IconMapPin = (p) => (
  <svg {...base} {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
  <circle cx="12" cy="10" r="3" /></svg>
);

export const IconUser = (p) => (
  <svg {...base} {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
  <circle cx="12" cy="7" r="4" /></svg>
);

export const IconUsers = (p) => (
  <svg {...base} {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
  <circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" />
  <path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
);

export const IconBuilding = (p) => (
  <svg {...base} {...p}><rect x="4" y="2" width="16" height="20" rx="1" />
  <line x1="9" y1="7" x2="9" y2="7.01" /><line x1="15" y1="7" x2="15" y2="7.01" />
  <line x1="9" y1="12" x2="9" y2="12.01" /><line x1="15" y1="12" x2="15" y2="12.01" />
  <path d="M10 22v-4h4v4" /></svg>
);

export const IconClock = (p) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
);

export const IconEdit = (p) => (
  <svg {...base} {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
  <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
);

export const IconTrash = (p) => (
  <svg {...base} {...p}><polyline points="3 6 5 6 21 6" />
  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
);

export const IconBan = (p) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><line x1="5.6" y1="5.6" x2="18.4" y2="18.4" /></svg>
);

export const IconBell = (p) => (
  <svg {...base} {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
  <path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
);

export const IconLock = (p) => (
  <svg {...base} {...p}><rect x="3" y="11" width="18" height="11" rx="2" />
  <path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
);

export const IconLogout = (p) => (
  <svg {...base} {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
  <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
);

export const IconPhone = (p) => (
  <svg {...base} {...p}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" /></svg>
);

export const IconNote = (p) => (
  <svg {...base} {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
  <polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" />
  <line x1="8" y1="17" x2="13" y2="17" /></svg>
);

export const IconFilter = (p) => (
  <svg {...base} {...p}><polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3" /></svg>
);

export const IconCheck = (p) => (
  <svg {...base} {...p}><polyline points="20 6 9 17 4 12" /></svg>
);

export const IconRefresh = (p) => (
  <svg {...base} {...p}><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
  <path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15" /></svg>
);

export const IconUnlock = (p) => (
  <svg {...base} {...p}><rect x="3" y="11" width="18" height="11" rx="2" />
  <path d="M7 11V7a5 5 0 0 1 9.9-1" /></svg>
);

// VITE_BRAND=neutral builds the same design without the EFESO name and logo (for public previews).
export const BRANDED = import.meta.env.VITE_BRAND !== 'neutral';
export const BRIEF_TITLE = BRANDED ? 'EFESO factory layout brief' : 'Factory layout brief';

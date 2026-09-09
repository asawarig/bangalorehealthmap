/* The six Plum brand colours, one per category, and the thirty sub-category
   groups that sit under them. This is the only place a category is defined:
   the tab bar, the pin colours, the legend and the build-time check all read
   it from here. */

export const VISION = '#571541';   /* Plum Vision  */
export const PROMISE = '#FFEBDB';  /* Plum Promise */

export const CATS = [
  {
    k: 'Activities', label: 'Activities', c: '#92BD33',
    subs: ['run', 'cycle', 'swim', 'badminton', 'padel', 'tennis', 'cricket',
           'turf', 'multisport', 'climb', 'play', 'golf', 'stadium', 'act_gym'],
  },
  {
    k: 'Communities', label: 'Communities', c: '#FF4052',
    subs: ['group', 'hangout', 'account'],
  },
  {
    k: 'Food', label: 'Food', c: '#FFBF21',
    subs: ['healthy', 'indulgent'],
  },
  {
    k: 'Health Centers', label: 'Health centres', c: '#429CD8',
    subs: ['hospital', 'clinic', 'lab', 'newage'],
  },
  {
    k: 'Health Investments', label: 'Health investments', c: VISION,
    subs: ['gym', 'yoga', 'retail', 'bike', 'wearable'],
  },
  {
    k: 'Mental Health', label: 'Mental health', c: PROMISE,
    subs: ['therapy', 'alttherapy'],
  },
];

/* Ink inside a coloured shape is computed, not guessed, so all six brand
   colours stay legible without introducing a seventh. */
export const lum = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.substr(i, 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const glyphOn = (hex) => (lum(hex) > 0.32 ? VISION : PROMISE);
export const edgeOn = (hex) => (lum(hex) < 0.12 ? PROMISE : VISION);

export const COLOUR = {}, CATLABEL = {}, SUBCAT = {};
CATS.forEach((c) => {
  COLOUR[c.k] = c.c;
  CATLABEL[c.k] = c.label;
  c.subs.forEach((s) => { SUBCAT[s] = c.k; });
});

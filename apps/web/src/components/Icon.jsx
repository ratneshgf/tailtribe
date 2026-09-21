import { I } from '../lib/ui.js';

/** Hand-drawn stroke icon set — no emoji, no icon font dependency. */
export function Icon({ n, s = 18, st = 2 }) {
  const d = I[n];
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor"
         strokeWidth={st} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split(' M').map((seg, i) => <path key={i} d={i ? 'M' + seg : seg} />)}
    </svg>
  );
}

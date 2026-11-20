/**
 * A controller's charge, drawn rather than written: at a glance from the sofa a bar that is nearly
 * empty says more than a number does, and the number is there for anyone who wants it.
 */
export function Battery({ percent, size = 18, showText = true }: { percent: number; size?: number; showText?: boolean }) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const state = pct <= 15 ? 'low' : pct <= 30 ? 'half' : '';
  // The inside of the shell runs from x=4 to x=17, so a full charge is 13 wide and an empty one
  // still shows a sliver: a bar that vanishes looks like a missing reading, not a flat battery.
  const width = Math.max(1.5, (13 * pct) / 100);
  return (
    <span className={`pad-batt ${state}`} title={`Controller battery ${pct}%`}>
      <svg width={size * 1.3} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden>
        <rect x="2" y="7" width="17" height="10" rx="2.5" />
        <path d="M21 10.5v3" strokeLinecap="round" />
        <rect x="4" y="9" width={width} height="6" rx="1" fill="currentColor" stroke="none" />
      </svg>
      {showText && <b>{pct}%</b>}
    </span>
  );
}

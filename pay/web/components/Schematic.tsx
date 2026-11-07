import s from "./route.module.css";

interface Geometry {
  size: "wide" | "narrow";
  w: number;
  h: number;
  top: number; // y of the MetaMask line
  bottom: number; // y of the Solflare line
  ring: number; // x of the PayRouter interchange
  end: number; // x of the merchant terminus
  maxChars: number; // merchant label budget before it would reach the terminus
}

// Bends are 45 degrees: the horizontal run before the ring equals the vertical drop.
const WIDE: Geometry = { size: "wide", w: 1000, h: 202, top: 36, bottom: 164, ring: 560, end: 960, maxChars: 30 };
const NARROW: Geometry = { size: "narrow", w: 600, h: 220, top: 40, bottom: 180, ring: 340, end: 560, maxChars: 17 };

const clamp = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** Evenly spaced stops between the line's origin and the start of its bend. */
const stops = (count: number, bendStart: number) =>
  Array.from({ length: count }, (_, i) => Math.round(20 + ((bendStart - 20) * (i + 1)) / (count + 1)));

function Map({ g, merchant }: { g: Geometry; merchant: string }) {
  const mid = (g.top + g.bottom) / 2;
  const bend = g.ring - (mid - g.top);
  return (
    <svg
      viewBox={`0 0 ${g.w} ${g.h}`}
      data-size={g.size}
      role="img"
      aria-label={`MetaMask and Solflare lines meet at the PayRouter interchange and continue to ${merchant}.`}
    >
      <g fill="none" strokeWidth="8" strokeLinejoin="round">
        <path d={`M20 ${g.top}H${bend}L${g.ring} ${mid}`} stroke="var(--cobalt)" />
        <path d={`M20 ${g.bottom}H${bend}L${g.ring} ${mid}`} stroke="var(--green)" />
        <path d={`M${g.ring} ${mid}H${g.end}`} stroke="var(--porcelain)" />
      </g>
      <g fill="var(--porcelain)" stroke="var(--enamel)" strokeWidth="3">
        {stops(3, bend).map((x) => (
          <circle key={`c${x}`} cx={x} cy={g.top} r="7" />
        ))}
        {stops(4, bend).map((x) => (
          <circle key={`g${x}`} cx={x} cy={g.bottom} r="7" />
        ))}
      </g>
      <circle cx={g.ring} cy={mid} r="17" fill="var(--enamel)" stroke="var(--porcelain)" strokeWidth="7" />
      <rect x={g.end - 4} y={mid - 22} width="12" height="44" fill="var(--porcelain)" />
      <g className={s.schematicText}>
        <text x="20" y={g.top - 16}>
          MetaMask
        </text>
        <text x="20" y={g.bottom + 32}>
          Solflare
        </text>
        <text x={g.ring + 30} y={mid - 16}>
          PayRouter
        </text>
        <text x={g.ring + 30} y={mid + 40}>
          {clamp(merchant, g.maxChars)}
        </text>
      </g>
    </svg>
  );
}

/** The network before a line is chosen: two wallet lines meet at PayRouter and run on to the merchant. */
export default function Schematic({ merchant }: { merchant: string }) {
  return (
    <figure className={s.schematic}>
      <Map g={WIDE} merchant={merchant} />
      <Map g={NARROW} merchant={merchant} />
    </figure>
  );
}

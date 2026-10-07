/** The product mark: an "A" whose right leg climbs, drawn in SVG (no logo file exists). Decorative; the name sits beside it. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" className="brand-mark__tile" />
      <path d="M7 24 L15 7 L18 13.5" className="brand-mark__leg-left" />
      <path d="M15 7 L25 24" className="brand-mark__leg-right" />
      <path d="M10.5 19h9.5" className="brand-mark__bar" />
      <circle cx="24.5" cy="8" r="2" className="brand-mark__dot" />
    </svg>
  );
}

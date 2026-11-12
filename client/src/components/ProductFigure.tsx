import { cx } from './ui';

type Kind = 'laptop' | 'phone' | 'headphones' | 'mouse' | 'keyboard' | 'monitor' | 'webcam' | 'board' | 'drive' | 'brick';

function figureKind(product: { category: string; name: string; tags?: string[] }): Kind {
  const text = `${product.name} ${(product.tags ?? []).join(' ')}`.toLowerCase();
  if (product.category === 'laptops') return 'laptop';
  if (product.category === 'smartphones') return 'phone';
  if (product.category === 'headphones') return 'headphones';
  if (text.includes('keyboard')) return 'keyboard';
  if (text.includes('monitor') || text.includes('ultrasharp')) return 'monitor';
  if (text.includes('webcam') || text.includes('brio')) return 'webcam';
  if (text.includes('mouse')) return 'mouse';
  if (product.category === 'electronics') {
    if (text.includes('ssd') || text.includes('nvme')) return 'drive';
    return 'board';
  }
  return 'brick';
}

/**
 * Product renders drawn in code rather than stock imagery, so the catalogue is
 * consistent, offline-safe and never shows a wrong device.
 */
export function ProductFigure({
  product,
  className,
  detail = true,
}: {
  product: { category: string; name: string; brand?: string; tags?: string[] };
  className?: string;
  detail?: boolean;
}) {
  const kind = figureKind(product);

  return (
    <div className={cx('relative overflow-hidden rounded-md bg-raised', className)} aria-hidden>
      <div className="absolute inset-0 grid-plate opacity-70" />
      <svg viewBox="0 0 200 150" className="relative h-full w-full text-ink" fill="none">
        {kind === 'laptop' && (
          <g stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
            <rect x="46" y="26" width="108" height="68" rx="4" fill="#FDFBF7" />
            <rect x="53" y="33" width="94" height="54" rx="2" fill="#E4DED3" stroke="none" />
            <path d="M54 41h30M54 49h46M54 57h22" stroke="#8B8275" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M54 76h34" stroke="#1F3ED9" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M34 101h132l-11 13H45l-11-13Z" fill="#F4EFE6" />
            <path d="M34 101h132" />
            <path d="M92 106h16" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        )}

        {kind === 'phone' && (
          <g stroke="currentColor" strokeWidth="2">
            <rect x="76" y="15" width="48" height="120" rx="9" fill="#FDFBF7" />
            <rect x="81" y="21" width="38" height="106" rx="5" fill="#E4DED3" stroke="none" />
            <rect x="88" y="27" width="14" height="5" rx="2.5" fill="#8B8275" stroke="none" />
            <path d="M87 96h26" stroke="#1F3ED9" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M87 105h16" stroke="#8B8275" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M90 118h20" strokeWidth="3" strokeLinecap="round" />
          </g>
        )}

        {kind === 'headphones' && (
          <g stroke="currentColor" strokeWidth="2">
            <path d="M58 82V64a42 42 0 0 1 84 0v18" fill="none" strokeWidth="7" strokeLinecap="round" />
            <rect x="48" y="74" width="22" height="42" rx="9" fill="#FDFBF7" />
            <rect x="130" y="74" width="22" height="42" rx="9" fill="#FDFBF7" />
            <path d="M56 88v14M144 88v14" stroke="#1F3ED9" strokeWidth="3" strokeLinecap="round" />
          </g>
        )}

        {kind === 'mouse' && (
          <g stroke="currentColor" strokeWidth="2">
            <path d="M100 24c22 0 33 18 33 42v22c0 22-13 38-33 38s-33-16-33-38V66c0-24 11-42 33-42Z" fill="#FDFBF7" />
            <path d="M100 24v34" />
            <rect x="94" y="36" width="12" height="18" rx="6" fill="#1F3ED9" stroke="none" />
            <path d="M67 64h20M113 64h20" stroke="#8B8275" />
          </g>
        )}

        {kind === 'keyboard' && (
          <g stroke="currentColor" strokeWidth="2">
            <rect x="26" y="50" width="148" height="52" rx="5" fill="#FDFBF7" />
            {[0, 1, 2].map((row) =>
              Array.from({ length: 11 }).map((_, column) => (
                <rect
                  key={`${row}-${column}`}
                  x={33 + column * 12.4}
                  y={57 + row * 13}
                  width="10"
                  height="10"
                  rx="2"
                  fill={row === 2 && column > 2 && column < 8 ? '#1F3ED9' : '#E4DED3'}
                  stroke="none"
                />
              )),
            )}
          </g>
        )}

        {kind === 'monitor' && (
          <g stroke="currentColor" strokeWidth="2">
            <rect x="28" y="26" width="144" height="82" rx="4" fill="#FDFBF7" />
            <rect x="34" y="32" width="132" height="70" rx="2" fill="#E4DED3" stroke="none" />
            <path d="M42 44h44M42 54h68M42 64h30" stroke="#8B8275" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M100 108v14" />
            <path d="M74 128h52" strokeWidth="3" strokeLinecap="round" />
            <path d="M42 88h28" stroke="#1F3ED9" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        )}

        {kind === 'webcam' && (
          <g stroke="currentColor" strokeWidth="2">
            <rect x="58" y="46" width="84" height="52" rx="14" fill="#FDFBF7" />
            <circle cx="90" cy="72" r="16" fill="#E4DED3" />
            <circle cx="90" cy="72" r="7" fill="#1F3ED9" stroke="none" />
            <path d="M126 62h8M126 72h8M126 82h8" stroke="#8B8275" strokeLinecap="round" />
            <path d="M100 98v18M82 116h36" />
          </g>
        )}

        {kind === 'board' && (
          <g stroke="currentColor" strokeWidth="2">
            <rect x="48" y="32" width="104" height="82" rx="4" fill="#FDFBF7" />
            <rect x="78" y="54" width="34" height="26" rx="2" fill="#1F3ED9" stroke="none" />
            {Array.from({ length: 7 }).map((_, index) => (
              <g key={index}>
                <rect x={58 + index * 12} y="24" width="7" height="8" fill="#8B8275" stroke="none" />
                <rect x={58 + index * 12} y="114" width="7" height="8" fill="#8B8275" stroke="none" />
              </g>
            ))}
            <circle cx="60" cy="92" r="4" fill="#8B8275" stroke="none" />
          </g>
        )}

        {kind === 'drive' && (
          <g stroke="currentColor" strokeWidth="2">
            <rect x="62" y="44" width="76" height="62" rx="4" fill="#FDFBF7" />
            <rect x="72" y="52" width="56" height="10" rx="2" fill="#E4DED3" stroke="none" />
            <path d="M76 84h48M76 92h26" stroke="#8B8275" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M62 70h76" stroke="#1F3ED9" strokeDasharray="4 4" />
          </g>
        )}

        {kind === 'brick' && (
          <g stroke="currentColor" strokeWidth="2">
            <rect x="52" y="46" width="96" height="58" rx="7" fill="#FDFBF7" />
            <path d="M64 60h28M64 68h18" stroke="#8B8275" strokeWidth="2.5" strokeLinecap="round" />
            <rect x="112" y="72" width="24" height="8" rx="2" fill="#1F3ED9" stroke="none" />
            <path d="M60 104v8M140 104v8" stroke="#8B8275" />
          </g>
        )}
      </svg>
      {detail ? (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-3 pb-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-3">
          <span>{product.brand ?? ''}</span>
          <span aria-hidden>◦</span>
        </div>
      ) : null}
    </div>
  );
}

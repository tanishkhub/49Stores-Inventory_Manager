import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';

// Renders a scannable barcode (Code128 by default, EAN-13 when the product uses it) as crisp SVG,
// which prints sharply on both thermal and laser/inkjet printers.
export default function BarcodeSvg({ value, format = 'CODE128', height = 50, width = 2, fontSize = 14, margin = 4, displayValue = true, className = '' }) {
  const ref = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, { format, height, width, fontSize, margin, displayValue, background: '#ffffff', lineColor: '#000000' });
      setError('');
    } catch {
      setError(`"${value}" is not a valid ${format} value`);
    }
  }, [value, format, height, width, fontSize, margin, displayValue]);

  if (!value) return null;
  return (
    <>
      <svg ref={ref} className={`${error ? 'hidden' : ''} ${className}`} role="img" aria-label={`Barcode ${value}`} />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </>
  );
}

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './print.css';

// Renders children into a top-level node that is the only thing visible when printing.
// `pageCss` sets the @page rule (e.g. "size: 50mm 25mm; margin: 0") for thermal labels / receipts.
export default function PrintPortal({ children, pageCss = 'margin: 10mm' }) {
  useEffect(() => {
    const style = document.createElement('style');
    style.dataset.printPage = 'true';
    style.textContent = `@page { ${pageCss} }`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [pageCss]);

  return createPortal(<div className="print-root">{children}</div>, document.body);
}

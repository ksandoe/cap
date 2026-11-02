import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const FOOTER_ACTIONS_ID = 'screen-footer-actions';

/**
 * Real SAP keeps a screen's action buttons (Save / Cancel, Continue, Execute) in the same bottom
 * bar as the status message, at the right (Kent's 2026-11-02 screenshots). The bar belongs to the
 * app shell, so a screen declares its buttons here and they render into the bar's right-hand slot.
 */
export default function FooterActions({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.getElementById(FOOTER_ACTIONS_ID));
  }, []);
  return target ? createPortal(children, target) : null;
}

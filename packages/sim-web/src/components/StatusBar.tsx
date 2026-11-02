import { Icon } from '@ui5/webcomponents-react';
import { FOOTER_ACTIONS_ID } from './FooterActions';

interface Props {
  message: string | null;
}

/**
 * The quirk: the saved document number appears only here, at the bottom — never a popup. Styled
 * like SAP's own status bar (white, green check, message at the left) per Kent's 2026-11-02
 * screenshot; it is empty until there is something to say.
 */
export default function StatusBar({ message }: Props) {
  return (
    <div className="status-bar">
      {message && (
        <>
          <Icon name="sys-enter-2" className="status-bar-ok" />
          <span>{message}</span>
        </>
      )}
      <div id={FOOTER_ACTIONS_ID} className="status-bar-actions" />
    </div>
  );
}

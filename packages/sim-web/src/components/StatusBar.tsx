import { Icon } from '@ui5/webcomponents-react';
import { FOOTER_ACTIONS_ID } from './FooterActions';

export interface StatusMessage {
  text: string;
  /** 'success' is the green check ("... has been saved"); 'warning' the orange triangle ("Enter Customer Reference"). */
  kind: 'success' | 'warning';
}

interface Props {
  message: StatusMessage | null;
}

/**
 * The quirk: the saved document number appears only here, at the bottom — never a popup. Styled
 * like SAP's own status bar (white, green check, message at the left) per Kent's 2026-11-02
 * screenshot; it is empty until there is something to say. Warnings use the same slot (Kent's
 * VA01 screenshot of "Enter Customer Reference").
 */
export default function StatusBar({ message }: Props) {
  return (
    <div className="status-bar">
      {message && (
        <>
          <Icon
            name={message.kind === 'warning' ? 'message-warning' : 'sys-enter-2'}
            className={message.kind === 'warning' ? 'status-bar-warn' : 'status-bar-ok'}
          />
          <span>{message.text}</span>
        </>
      )}
      <div id={FOOTER_ACTIONS_ID} className="status-bar-actions" />
    </div>
  );
}

interface Props {
  message: string | null;
}

/** The quirk: the saved document number appears only here, at the bottom — never a popup. */
export default function StatusBar({ message }: Props) {
  return <div className="status-bar">{message ?? 'Ready'}</div>;
}

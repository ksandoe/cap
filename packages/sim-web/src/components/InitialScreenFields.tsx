import { useState } from 'react';
import { Icon } from '@ui5/webcomponents-react';
import type { InitialScreenField } from '@sap-sim/shared';

/**
 * The type field (Inquiry/Quotation/Order Type) plus the "Organizational Data" box real SAP shows
 * on every VA1x initial screen — see Kent's screenshots of perth.cob.csuchico.edu, 2026-11-01.
 * Labels sit right-aligned on the same line as their input, ending in a colon, so every input box
 * lines up at a common left edge — not stacked above the input the way `.field-row` renders
 * elsewhere. Only the type field gets the small value-help icon; the org-data codes don't.
 *
 * `editable`: per Kent's 2026-11-01 walkthrough notes, the Inquiry Type / org-data codes are
 * student-typed, not pre-filled — a field whose `value` is non-empty is "required" and must match
 * exactly (case-insensitive) before Continue proceeds; a field with `value: ''` (Sales Office /
 * Sales Group) is optional and never validated. The description ("US East" etc.) only appears once
 * the typed value matches, the way real SAP looks it up after you tab out.
 */
export default function InitialScreenFields({
  fields,
  editable,
  values,
  onChange,
}: {
  fields: InitialScreenField[];
  editable?: boolean;
  values?: Record<string, string>;
  onChange?: (name: string, value: string) => void;
}) {
  const [typeField, ...orgFields] = fields;
  // Real SAP only shows the matchcode icon once you click into the field it belongs to — hidden
  // the rest of the time (Kent, 2026-11-02).
  const [typeFocused, setTypeFocused] = useState(false);

  // Field width follows the expected value's length, not a uniform block — "IN" and "UE00" are
  // visibly different box sizes in real SAP, not identical 100px fields.
  function widthFor(f: InitialScreenField): string {
    const len = f.value ? f.value.length : 4;
    return `${Math.max(4, len + 2)}ch`;
  }

  function renderInput(f: InitialScreenField, focusHandlers?: { onFocus: () => void; onBlur: () => void }) {
    const width = widthFor(f);
    if (!editable) {
      return <input value={f.value} disabled style={{ width }} {...focusHandlers} />;
    }
    const typed = values?.[f.name] ?? '';
    return (
      <input
        value={typed}
        onChange={(e) => onChange?.(f.name, e.target.value)}
        style={{ width }}
        {...focusHandlers}
      />
    );
  }

  function descriptionFor(f: InitialScreenField) {
    if (!f.description) return null;
    if (!editable) return f.description;
    const typed = values?.[f.name]?.trim().toUpperCase();
    return typed === f.value.toUpperCase() ? f.description : null;
  }

  return (
    <div className="initial-screen-fields">
      <div className="initial-field-row">
        <label className="required">{typeField.label}:</label>
        <span className="sap-input-with-icon">
          {renderInput(typeField, { onFocus: () => setTypeFocused(true), onBlur: () => setTypeFocused(false) })}
          {typeFocused && (
            <span
              className="sap-chrome-icon-btn sap-chrome-icon-btn--decorative"
              onMouseDown={(e) => e.preventDefault()}
            >
              <Icon name="duplicate" />
            </span>
          )}
        </span>
        {descriptionFor(typeField) && <span className="org-data-description">{descriptionFor(typeField)}</span>}
      </div>
      <div className="org-data-box">
        <div className="org-data-title">Organizational Data</div>
        {orgFields.map((f) => (
          <div className="initial-field-row" key={f.name}>
            <label>{f.label}:</label>
            {renderInput(f)}
            {descriptionFor(f) && <span className="org-data-description">{descriptionFor(f)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

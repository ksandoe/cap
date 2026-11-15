import { Button } from '@ui5/webcomponents-react';
import type { LeadIn } from '../content/leadIn';

export default function BackgroundBlock({ leadIn, onContinue }: { leadIn: LeadIn; onContinue: () => void }) {
  return (
    <div className="lead-in">
      <h2>{leadIn.title}</h2>
      <p>{leadIn.whereThisSits}</p>
      <ul>
        {leadIn.whatThisIs.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
      <h3>What to watch for</h3>
      <ul>
        {leadIn.whatToWatchFor.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
      <p>
        <em>{leadIn.whyItMattersLater}</em>
      </p>
      <Button design="Emphasized" onClick={onContinue}>
        Continue
      </Button>
    </div>
  );
}

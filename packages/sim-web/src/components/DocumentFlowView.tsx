import { useEffect, useState } from 'react';
import type { SalesDocument } from '@sap-sim/shared';
import { getDocumentFlow } from '../api';
import { CUSTOMERS, getMaterial } from '@sap-sim/engine';

export default function DocumentFlowView({ orderId }: { orderId: string }) {
  const [chain, setChain] = useState<SalesDocument[] | null>(null);

  useEffect(() => {
    getDocumentFlow(orderId).then(setChain);
  }, [orderId]);

  if (!chain) return <p>Loading document flow…</p>;

  const customerName = CUSTOMERS.find((c) => c.id === chain[0]?.customerId)?.name ?? chain[0]?.customerId;

  return (
    <div>
      <h3>Document Flow</h3>
      <p>
        One customer request from <strong>{customerName}</strong>, three linked documents, one dollar value — in
        one view.
      </p>
      <table className="item-table">
        <thead>
          <tr>
            <th>Document</th>
            <th>Number</th>
            <th>References</th>
            <th>Net Value</th>
          </tr>
        </thead>
        <tbody>
          {chain.map((doc) => (
            <tr key={doc.id}>
              <td style={{ textTransform: 'capitalize' }}>{doc.docType}</td>
              <td>{doc.id}</td>
              <td>{doc.predecessorId ?? '—'}</td>
              <td>${doc.netValue.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4>Items (as saved on the order)</h4>
      <ul>
        {chain[chain.length - 1]?.items.map((item) => (
          <li key={item.lineNumber}>
            {item.quantity} × {getMaterial(item.materialId).description} — ${item.itemNetValue.toFixed(2)}
          </li>
        ))}
      </ul>
    </div>
  );
}

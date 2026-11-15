# Reference screenshots

High-fidelity screenshots Kent captured from the real SAP training system
(`perth.cob.csuchico.edu`, UCC's sandbox — no live connection from this repo, see `CLAUDE.md`
constraints) on 2026-11-01, used to tighten the simulator's visual and structural fidelity.
Kent's own exploratory session; no real student data — see `docs/decisions/` for the design
decisions these drove.

Named by transaction and screen, in the order they were captured. Roughly:

- `easy-access-*` — the SAP Easy Access menu tree (Logistics ▸ Sales and Distribution ▸ Sales ▸
  Inquiry/Quotation/Order), at increasing depth as more of the tree got expanded.
- `va11-*` — Create Inquiry: initial screen, Overview, the Sold-to Party / Material value-help
  dialogs, and the item-detail drill-in (Sales A and Conditions tabs).
- `va21-*` — Create Quotation: initial screen, the Create-with-Reference flow, Overview, and
  item-level (K004) and header-level (RA00) Conditions tabs.
- `va01-*` — Create Sales Order: initial screen, the Create-with-Reference flow, and the save
  confirmation.

What these did and didn't change: see `docs/decisions/002-menu-navigation.md` and the commit
history around 2026-11-01. Two things deliberately **not** replicated despite being visible here:
the real system's 500 near-duplicate customer/material records per search term (the exact
ID-collision problem `docs/architecture-proposal.md` §3b already decided to drop), and the nested
Create-with-Reference → Search Criteria → value-help dialog chain (simplified to a single inline
search, same reasoning).

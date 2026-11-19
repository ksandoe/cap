# Request to UCC: allowing our site to frame the SAP WebGUI

**Status:** draft for Kent to send, 2026-11-18. Fill in the two addresses marked below before sending. Evidence behind it: `docs/cap-integration-design.md` §2a point 4.

## What we are trying to do

Students use the SAP web interface (the WebGUI on `perth.cob.csuchico.edu`) while following instructions on our own learning site. We would like the WebGUI to appear in a frame beside the instructions, instead of in a separate window. A separate popup window already works as a fallback, so this is an improvement, not a blocker.

## What we found

We tested from a plain web page, in a browser, signed out.

1. The WebGUI does not refuse framing through an `X-Frame-Options` header. Its own clickjacking framing protection runs instead: the page asks the page around it for its address (`SAPFrameProtection*require-origin`), and our test page answered.
2. SAP then called its allowed-sites service:

   ```text
   GET /sap/public/bc/uics/whitelist/service?parentOrigin=<our address>&appl=/sap/bc/gui/sap/its/webgui/
   ```

   and received **403 Forbidden**. That happened both for a local test file and for a real `https` address on another host. The frame stayed blank.
3. A popup window with the same address loads the login page and login works.

## What we are asking

1. Can you add these addresses to the clickjacking framing allowed list (the HTTP whitelist, entry type 30, or the equivalent in your UCON setup) for the student instance?
   - Production: `<CAP production address, for example https://…>`
   - Development: `http://localhost:3000` and `http://localhost:5173` (the ports our two development servers use)
   - Optional, for a one-time test: `<temporary test address, if you are willing>`
   Entries match the exact address, including `https` and any port number.
2. Will that setting still be there when you provision the new instance each semester, or do we need to ask again?
3. Which SAP release is the student instance? (It helps us find the right SAP guidance.)
4. Two smaller questions for the view-only exercise: can many students use one display-only account at the same time, and what does the semester reset do to accounts and data?

## What we are not asking

We are not asking you to change anything about accounts, roles or data, and we do not need any connection from our servers to SAP. Students keep logging in to SAP themselves, with the account ID we give them.

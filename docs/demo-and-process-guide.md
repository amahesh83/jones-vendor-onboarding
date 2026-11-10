# Demo examples and the onboarding process

Run `npm run demo`, open the staff app and select a synthetic persona. No SAP connection or real email is used.

## Example controls

- Invite dialog: **Fill for me** fills a unique synthetic company, a `.test` email and a clear demo business reason. Choose Ireland or the UK first to obtain the matching currency.
- Vendor welcome: **Fill the whole form for me** fills the data sections and uploads generated PDFs for required document types. It opens review; the tester must still read the declaration and submit.
- The welcome screen has an explicit **deliberate duplicate VAT example** option. Normal examples use request-specific VAT and IBAN values.
- Each data/document step has **Fill this step**. Account holder matches the company, IBAN has correct check digits, and BIC matches the bank country. Examples use valid-format IE/GB tax and registration identifiers and postcodes, not verified real registrations.
- Bank callback: **Fill for me** fills clearly synthetic call evidence and selects Confirmed. The tester must still press **Record call-back** and approve. No call is made.

These controls require the development authentication implementation and are absent in production. Server guards reject the example endpoints in the production profile or when `NODE_ENV=production`, even if a caller guesses the URL.

## Process explanations

Home navigation links to `/how-it-works.html`, a responsive visual sequence covering invitation, vendor submission, automatic checks, the current configured routes and SAP creation. A request's **How it works** link displays its saved route. It explains reminder/escalation targets and send-back, rejection and SAP-error paths.

Every staff request has a **What happens next** panel based on its current status. Vendor status pages describe the process without disclosing internal notes or rejection reasons. Working-day targets exclude weekends; they are not promised completion dates.

## Approval routes (ADR-003)

Open **Staff app → Administration → Approval routes** as a Master data admin. Edit the route cards; lower priority numbers match first. Tick conditions to narrow a route; none selected means any. Use the step dropdown and arrow/remove buttons to arrange checks, keeping Finance last. Always retain an active default with no conditions. Use **Which route would this vendor get?** to test the cards, then **Save routes**.

Starting routes: sub-contractors (YBCS/YBSP/YBVE) go to Procurement → Bank check → Finance; 30 EOM goes through the same checks; other vendors go to Bank check → Finance. Requester review precedes each route by default. The global checkbox affects new submissions only. Default vendors therefore need one business approval; sub-contractors need two.

For a low-risk route, **Finance approver performs the call-back** removes the separate bank step and displays a warning about losing the two-person bank check. Finance must record a confirmed call-back and run a successful simulation before approving. The requester cannot approve later steps, even when requester review is off.

The request displays **Route: … → …**. It keeps that route, labels, roles and reminder targets after configuration edits or send-back. Resubmission restarts all saved steps and requires a fresh call-back, including when bank details change. Progress, emails, reminders, next-step text and the FIN-010 audit page follow the saved route.

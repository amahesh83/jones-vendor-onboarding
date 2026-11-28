# ADR-003: Configurable approval routes, bank call-back as its own step by default

| | |
|---|---|
| Status | **Accepted** |
| Date | 2026-11-10 |
| Decided by | Project owner |
| Amends | Design §6.1/§6.2 (the fixed five-step chain). ADR-001 platform unchanged |

## Decision

1. **Requester review stays first.** The person who invited the vendor checks the details. An admin may switch it off globally, but it is on by default.
2. **Approvals after that are configurable: usually one or two steps.** Admins maintain a simple **Approval routes** table:
   - each route has a priority, a name, conditions (account type, payment terms, company code, country; empty = any) and an ordered list of steps;
   - the first route that matches (by priority) is used; a default route must always exist;
   - steps are picked from a fixed list: Requester review, Purchasing, Procurement, Bank call-back, Finance; Finance is always last.
3. **Bank call-back: option 1 is the default, option 3 is available.**
   - **Default (option 1):** the bank call-back is a **separate step done by a different person** (Bank verifier / AP) before Finance. Segregation of duties is kept: the person who confirms the bank details is not the person who gives final approval.
   - **Configurable (option 3):** per route, an admin may instead set the call-back to be **done inside the Finance step**. The Finance approver must then record the call-back before approving. Use only for low-risk routes; the admin screen shows a warning that this removes the two-person check on bank details.
   - Option 2 (always inside Finance, for every vendor) is not offered as a global setting.
4. **Each request keeps the route it got at submission** (a snapshot). Rule changes never affect requests already in flight. The request page shows "Route: … → …".
5. **Configuration must be simple:** route cards with step "chips" (add from a dropdown, reorder, remove), tick-box conditions, plain-English summary ("Sub-contractors: Procurement, then Bank call-back, then Finance"), and a "Which route would this vendor get?" tester.

## Starting routes (seed, changeable by admin)

| Priority | Route | When | Steps after requester review |
|---|---|---|---|
| 10 | Sub-contractors | Account type YBCS, YBSP, YBVE | Procurement → Bank call-back → Finance |
| 20 | Short payment terms | Payment terms 30EOM | Procurement → Bank call-back → Finance |
| 99 | Default | Any | Bank call-back → Finance |

## Why

- The fixed chain (up to five approvals) was too many for most vendors.
- Different vendor types carry different risk; the business should be able to change routes without a code change or transport.
- The bank call-back is the main protection against invoice/bank-detail fraud, so it stays a separate two-person check unless an admin knowingly relaxes it for a low-risk route.

## Rules that do not change

- One person can act on at most one step of a request; the requester never approves later steps.
- Any bank-detail change after a send-back always requires a new call-back.
- Send back / reject / SAP-error handling are unchanged.

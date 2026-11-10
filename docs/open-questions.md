# Open questions at Claude Code takeover

The detailed questions and provisional defaults remain in solution design §13. Do not invent Jones SAP values. Use its documented defaults while working with synthetic data, and record confirmed answers here.

- Q1–Q8: actual SAP term keys, reconciliation accounts, purchasing organisation, payment methods, WHT/RCT/CIS mapping, registration/tax field mapping, bank-key rules and CVI status remain unconfirmed.
- Q9–Q10: the fixed-chain/order choice is superseded by ADR-003. Separate bank verification before Finance is the default; per-route IN_FINANCE is allowed with its warning. Procurement/Purchasing appear only when configured. Business owners still need to confirm role membership and their operating routes.
- Q11: required documents/RCT1 policy remains provisional.
- Q12: application landscape uses shared Jones Applications Non-Prod/Prod subaccounts, project spaces and separate instances. Actual HANA, scanner and write-capable Audit Log provisioning still needs environment verification.
- Q13–Q14: IAS/Entra trust and role mapping, Graph sender/app registration and approved test identities remain external prerequisites.
- Q15: EY may require destination routing via CPI; no CPI build or BPA approvals are authorised.
- Q16–Q17: retention, approved branding and vendor-facing domain remain to be confirmed.

No business answers or production integration results have been fabricated. Claude should maintain this log as answers arrive and update the design/runbook accordingly.

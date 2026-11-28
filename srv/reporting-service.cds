using { jones.vob as db } from '../db/schema';

/**
 * Read-only OData V4 service for reporting (Excel, Power BI, a future Fiori
 * elements list). Bank and personal contact data are left out on purpose.
 * The app itself uses the JSON APIs under /api.
 */
@requires: ['VOB_Auditor', 'VOB_MasterDataAdmin', 'VOB_FinancialController']
@path: '/odata/v4/reporting'
service ReportingService {

  @readonly
  entity VendorRequests as projection on db.VendorRequests {
    ID, requestNumber, companyCode, status, currentStep, stepSince, round, submittedAt, createdInSapAt, closedAt,
    requesterName, accountType, paymentTerms, currency, companyName, country, city, postCode,
    sapVendorNumber, duplicateBlocking, createdAt, modifiedAt
  };

  @readonly
  entity ApprovalSteps as projection on db.ApprovalSteps {
    ID, request.ID as request_ID, round, step, decision, userName, decidedAt
  };
}

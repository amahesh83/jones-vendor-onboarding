namespace jones.vob;

using { cuid, managed } from '@sap/cds/common';

// ---------------------------------------------------------------------------
// Vendor requests: one row per onboarding request (replaces one FIN-010 form)
// ---------------------------------------------------------------------------

type Status : String(30) enum {
  INVITED; IN_PROGRESS; SUBMITTED; PENDING_REQUESTER; PENDING_PURCHASING;
  PENDING_PROCUREMENT; PENDING_BANK_CHECK; PENDING_FINANCE; RETURNED;
  CREATING; SAP_ERROR; CREATED; REJECTED; CANCELLED; EXPIRED;
}

entity VendorRequests : cuid, managed {
  requestNumber          : String(20) @assert.unique;
  companyCode            : String(4) default 'IE01';
  status                 : Status default 'INVITED';
  currentStep            : String(20);
  stepSince              : Timestamp;
  round                  : Integer default 0; // number of submissions
  submittedAt            : Timestamp;
  createdInSapAt         : Timestamp;
  closedAt               : Timestamp;
  anonymisedAt           : Timestamp; // retention job removed personal and bank data (design §10)

  // set by the Jones requester
  requesterId            : String(255);
  requesterName          : String(120);
  requesterEmail         : String(255);
  businessReason         : String(500);
  accountType            : String(4);
  paymentTerms           : String(10);
  currency               : String(3);
  vendorContactName      : String(120);
  vendorEmail            : String(255);
  inviteExpiresAt        : Timestamp;

  // completed by the vendor (FIN-010 page 1)
  @PersonalData.IsPotentiallyPersonal
  companyName            : String(140);
  country                : String(2);
  street                 : String(60);
  district               : String(40);
  city                   : String(40);
  postCode               : String(10);
  phone                  : String(30);
  @PersonalData.IsPotentiallyPersonal
  accountsContactName    : String(80);
  @PersonalData.IsPotentiallyPersonal
  accountsEmail          : String(241);
  @PersonalData.IsPotentiallyPersonal
  salesContactName       : String(80);
  @PersonalData.IsPotentiallyPersonal
  salesEmail             : String(241);
  companyRegNo           : String(20);
  vatNumber              : String(20);
  notVatRegistered       : Boolean default false;
  rctNumber             : String(20);
  cisNumber              : String(20);
  utrNumber              : String(13);
  @PersonalData.IsPotentiallySensitive
  iban                   : String(34);
  bic                    : String(11);
  bankName               : String(60);
  bankAddress            : String(120);
  @PersonalData.IsPotentiallySensitive
  bankAccountNo          : String(18);
  sortCode               : String(10);
  accountHolder          : String(60);
  @PersonalData.IsPotentiallyPersonal
  bankContactName        : String(80);
  @PersonalData.IsPotentiallyPersonal
  bankContactPhone       : String(30);
  declarationName        : String(120);
  declarationAt          : Timestamp;
  declarationIp          : String(64);
  vendorStartedAt        : Timestamp;
  lastSavedAt            : Timestamp;

  // send back / reject
  returnMessage          : String(1000);
  returnSections         : String(200);
  rejectReason           : String(500);

  // automatic checks
  duplicatesJson         : LargeString;
  duplicateBlocking      : Boolean default false;
  duplicateJustification : String(500);
  checksJson             : LargeString;

  // finance data (Financial Controller)
  reconAccount           : String(10);
  paymentMethods         : String(10);
  whtType                : String(2);
  whtCode                : String(2);
  purchasingOrg          : String(4);
  grBasedIv              : Boolean default true;
  createMissingBank      : Boolean default false;

  // SAP
  sapSimulatedOk         : Boolean default false;
  sapSimulatedAt         : Timestamp;
  sapSimulationJson      : LargeString;
  sapVendorNumber        : String(10);
  sapMessagesJson        : LargeString;
  sapAttempts            : Integer default 0;
  pdfAttached            : Boolean default false;

  // reminders
  lastReminderAt         : Timestamp;
  escalatedAt            : Timestamp;

  steps                  : Composition of many ApprovalSteps on steps.request = $self;
  bankChecks             : Composition of many BankVerifications on bankChecks.request = $self;
  documents              : Composition of many RequestDocuments on documents.request = $self;
  versions               : Composition of many RequestVersions on versions.request = $self;
  events                 : Association to many AuditEvents on events.request = $self;
}

entity ApprovalSteps : cuid {
  request   : Association to VendorRequests;
  round     : Integer;
  step      : String(20);  // REQUESTER, PURCHASING, PROCUREMENT, BANK_CHECK, FINANCE
  decision  : String(20);  // APPROVED, SENT_BACK, REJECTED
  userId    : String(255);
  userName  : String(120);
  comment   : String(1000);
  decidedAt : Timestamp;
}

entity BankVerifications : cuid {
  request        : Association to VendorRequests;
  round          : Integer;
  ibanChecked    : String(34);
  numberCalled   : String(30);
  numberSource   : String(30); // INDEPENDENT_BANK, INDEPENDENT_WEBSITE, EXISTING_RECORD, VENDOR_PROVIDED
  personSpokenTo : String(80);
  calledAt       : Timestamp;
  outcome        : String(20); // CONFIRMED, NOT_CONFIRMED
  notes          : String(1000);
  userId         : String(255);
  userName       : String(120);
  recordedAt     : Timestamp;
}

entity RequestDocuments : cuid {
  request    : Association to VendorRequests;
  docType    : String(20);
  fileName   : String(200);
  mimeType   : String(60);
  size       : Integer;
  sha256     : String(64);
  content    : LargeBinary;
  validUntil : Date;
  scanStatus : String(12); // CLEAN, INFECTED, PENDING
  uploadedAt : Timestamp;
  uploadedBy : String(255);
}

entity RequestVersions : cuid {
  request   : Association to VendorRequests;
  round     : Integer;
  snapshot  : LargeString;
  createdAt : Timestamp;
}

/** Append-only business audit trail (there is no update/delete path in the app). */
entity AuditEvents : cuid {
  request   : Association to VendorRequests;
  at        : Timestamp;
  actorType : String(10); // USER, VENDOR, SYSTEM
  actorId   : String(255);
  actorName : String(120);
  event     : String(40);
  message   : String(500);
  details   : LargeString;
}

// ---------------------------------------------------------------------------
// Vendor access: hashed secrets only
// ---------------------------------------------------------------------------

entity InviteTokens : cuid {
  request   : Association to VendorRequests;
  tokenHash : String(64) @assert.unique;
  expiresAt : Timestamp;
  revoked   : Boolean default false;
  createdAt : Timestamp;
  lastUsedAt: Timestamp;
}

entity OtpChallenges : cuid {
  request     : Association to VendorRequests;
  tokenHash   : String(64);
  codeHash    : String(64);
  expiresAt   : Timestamp;
  attempts    : Integer default 0;
  lockedUntil : Timestamp;
  consumedAt  : Timestamp;
  createdAt   : Timestamp;
}

entity PortalSessions : cuid {
  request     : Association to VendorRequests;
  sessionHash : String(64) @assert.unique;
  csrfHash    : String(64);
  expiresAt   : Timestamp;
  createdAt   : Timestamp;
  lastSeenAt  : Timestamp;
  ip          : String(64);
}

/** Outgoing email log. Bodies are kept only by the local (development) mail adapter. */
entity Notifications : cuid {
  request   : Association to VendorRequests;
  toAddress : String(1000);
  subject   : String(255);
  template  : String(40);
  html      : LargeString;
  text      : LargeString;
  actionUrl : String(500);
  code      : String(10);
  channel   : String(10);
  status    : String(10); // SENT, FAILED
  error     : String(500);
  createdAt : Timestamp;
}

entity Counters {
  key name  : String(40);
      value : Integer;
}

// ---------------------------------------------------------------------------
// Configuration (design section 8). Seeded with placeholders, see open questions.
// ---------------------------------------------------------------------------

entity CompanyCodes {
  key code          : String(4);
      name          : String(80);
      purchasingOrg : String(4);
      active        : Boolean default true;
}

entity AccountTypes {
  key code          : String(4);
      label         : String(60);
      shortLabel    : String(30);
      numberRange   : String(20);
      subcontractor : Boolean default false;
      help          : String(500);
      question      : String(200);
      icon          : String(20);
      reconAccount  : String(10);
      whtType       : String(2);
      sortOrder     : Integer;
}

entity PaymentTerms {
  key code                : String(10);
      label               : String(60);
      sapKey              : String(4);
      requiresProcurement : Boolean default false;
      isDefault           : Boolean default false;
      sortOrder           : Integer;
}

entity Countries {
  key code            : String(2);
      name            : String(60);
      defaultCurrency : String(3);
      eu              : Boolean default false;
      sortOrder       : Integer;
}

entity Currencies {
  key code   : String(3);
      name   : String(40);
      symbol : String(5);
}

entity DocumentTypes {
  key code            : String(20);
      label           : String(60);
      help            : String(300);
      needsValidUntil : Boolean default false;
      requiredFor     : String(40); // ALL, SUB (sub-contractor account types), NONE, or a comma list of account types
      countries       : String(20); // empty = all countries, else comma list (e.g. IE)
      sortOrder       : Integer;
}

entity WithholdingCodes {
  key companyCode : String(4);
  key whtType     : String(2);
  key code        : String(2);
      label       : String(60);
      rate        : Decimal(5, 2);
}

entity RoleDirectory {
  key role  : String(40);
  key email : String(255);
      name  : String(120);
}

entity Settings {
  key name        : String(40);
      value       : String(255);
      description : String(255);
}

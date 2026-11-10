// Persist queued SAP creation and audit deliveries in the application database.
using from '@sap/cds/srv/outbox';

namespace jones.vob;
entity SapCreationJobs {
 key requestId : UUID;
 state : String(10);
 attempts : Integer default 0;
 nextAttemptAt : Timestamp;
 leaseUntil : Timestamp;
 owner : UUID;
 lastError : String(500);
}

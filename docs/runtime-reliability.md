# SAP creation and audit delivery

## Creation outbox

Final approval and administrator retry both write a `SapCreationJobs` row in the same database transaction as the change to `CREATING`. A rollback removes both changes. The queue payload holds only the request UUID; it does not copy bank details or credentials.

The worker claims due work with a conditional update and a five-minute lease. SAP is called outside a database transaction. A transient failure stores the next-attempt timestamp; the delays are configurable (development: 1.5 and 3 seconds, normal default: 2 and 5 seconds). Business errors go directly to `SAP_ERROR`. Exhausted unexpected failures leave a failed job and an auditable administrator retry path.

The server drains due work on startup and once per second. Expired leases allow recovery after a process dies. SAP uses the same request number on every attempt and must enforce idempotency in ECC. This is at-least-once delivery, not an exactly-once network guarantee. A durable database is essential: the demo's in-memory database intentionally resets on restart. The process-restart test uses a file-backed SQLite database.

The same job retries created-number notices after SAP reaches `CREATED`; it checks that each template is not already `SENT` before delivery, so a mail retry never calls SAP again. Failed notices are retained in `Notifications`; after automatic retries exhaust, Admin → Email failures can requeue the job using a conditional FAILED→READY update. If a worker crashes after a template becomes SENT but before stale failed attempts are cleared, recovery reconciles the notification state without re-sending that template. Only the administrator retry path can restart a terminal job. The Graph client timeout is 30 seconds, below the five-minute worker lease. Delivery remains at-least-once: network/process failure after Graph accepts a message but before the SENT row commits could still cause a duplicate; SAP and Graph delivery are not exactly-once transactions. Other Graph mail failures fail the initiating action with HTTP 424, which tells the user that the action did not complete.

This is a small application outbox rather than CAP's generic queued-service dispatcher. It keeps the existing creation logic and avoids holding a SQLite transaction during SAP and PDF processing. CAP's native persistent outbox remains available for the audit plugin.

The mock SAP adapter is process-local. The restart test exercises recovery of unprocessed work and repeated worker starts; only SAP DEV can prove ECC idempotency across a crash after a successful remote commit.

## Audit plugin

`@cap-js/audit-logging` is pinned as a runtime dependency. Development/test use its console implementation; production selects its REST v2 implementation and needs an existing bound Audit Log service named `vob-audit-log`. Basis must provision a write-capable service instance supported by the account; an entitlement for retrieval alone is insufficient.

The application keeps its business timeline with event-specific labels rather than free-text payloads. Retention scrubs older event details and vendor actor identifiers while preserving event type, timestamp and staff actor. Custom Express routes bypass generic CAP service handlers, so authorized bank-data reveals, bank-letter opens and full FIN-010 downloads explicitly call `SensitiveDataRead`, identifying the actor, request and field names without including bank values. Personal-data annotations remain on the model, with the vendor request identified as the data subject.

Local tests verify plugin invocation. Real BTP Audit Log delivery and operational retrieval are go-live checks and have not been exercised here.

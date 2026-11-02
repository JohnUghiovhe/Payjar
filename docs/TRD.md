# PAYJAR Technical Requirements Document (TRD)

**Version:** 0.2  
**Date:** 2 November 2026  
**Status:** Proposed technical design  
**Applies to:** Stage 1 non-custodial web MVP and staged hybrid architecture  
**Existing repository:** https://github.com/JohnUghiovhe/Payjar

## 1. Purpose

This document defines the technical design for PAYJAR's mobile-first responsive web MVP and the architectural boundaries needed for a later partner-enabled hybrid product. Stage 1 stores user-entered plans and records. Later real-money pots and payment controls must be delivered through a suitable regulated provider after legal, partner, security and operational review. PAYJAR must not imply that a virtual jar is a bank account or that an in-app lock blocks external payments.

## 2. Current repository assessment

The current repository already contains:
- Node.js and TypeScript.
- Express API.
- PostgreSQL access through pg.
- SQL schema for wallets, transactions, ledger entries and idempotency keys.
- Zod request validation.
- Swagger / OpenAPI.
- Jest, Supertest and pg-mem tests.
- Paystack webhook signature verification.
- Wallet deposit and transfer flows.

### What is reusable

- TypeScript and Express foundation.
- PostgreSQL and parameterised SQL approach.
- Zod validation.
- OpenAPI documentation.
- Jest and Supertest test setup.
- Transaction and idempotency concepts, after review and hardening.
- General project conventions and deployment scripts, after cleanup.

### What does not yet match the proposed product

The current code is a wallet/payment API, not a spending planner. The current domain model has wallet, transaction and ledger entities, but no user authentication, budgets, income records, expense categories, commitments, planning periods or safe-to-spend calculation.

### Security and correctness issues to address before extending

1. **No authentication or ownership enforcement is visible.** Routes accept userId in path/body/query. A caller may be able to read or act on another user's data. Add authentication and derive user identity from a verified session/token, not from a caller-controlled userId.
2. **No complete user model.** Add users and identity mapping, or use a trusted identity provider with a local user record.
3. **Wallet/payment scope is premature.** Do not expose deposit, transfer or Paystack webhook functions in the spending-planner MVP. Keep them isolated or remove them from the active product API until a separate regulated-money product is approved.
4. **Idempotency has concurrency concerns.** A read-before-insert pattern can race. Enforce a unique database constraint and perform idempotency claim, business write and stored response in one transaction. Handle conflict safely.
5. **Idempotency hash uses a hard-coded HMAC secret.** Do not use a constant embedded in source. Use a proper keyed secret or canonical request hash, and compare request payloads consistently.
6. **Money is converted to JavaScript Number.** Use integer minor units or decimal-safe arithmetic end-to-end. Do not rely on Number for financial calculations.
7. **Webhook amount and state need stronger validation.** If the payment module is ever reactivated, verify event identity, reference, expected amount, currency, status and replay handling. Do not trust the event's amount alone.
8. **No migrations strategy.** Applying the whole schema at application startup is not a safe long-term migration process. Introduce versioned migrations.
9. **Error handler leaks internal error messages.** Return safe public errors and log internal details separately.
10. **No rate limiting or security headers are visible.** Add appropriate limits, Helmet, strict CORS and request-size controls.
11. **No account-level privacy lifecycle is visible.** Add data export, deletion and retention policies.
12. **Repository hygiene:** remove node_modules from Git history/current tree, ensure .env and secrets are ignored, and rotate any secret that may have been committed.

Treat this as a review of the retrieved source files, not a full penetration test or production audit.

## 3. Recommended architecture

Use a **modular monolith** for the MVP. It is easier to build, test and deploy than microservices, while keeping clear module boundaries for future growth.

### Logical architecture

    Mobile-first Web Client
            |
         HTTPS / JSON
            |
      Express API Layer
      - Authentication middleware
      - Request validation
      - Rate limiting
      - Error handling
            |
       Application Layer
      - Users / Profiles
      - Planning Periods
      - Income
      - Expenses
      - Budgets / Jars
      - Commitments
      - Safe-to-Spend Engine
      - Reports
      - Notifications
            |
       Domain Layer
      - Money value object
      - Period rules
      - Budget rules
      - Allocation rules
      - Calculation policies
            |
       Persistence Layer
      - PostgreSQL
      - Versioned migrations
      - Audit records
            |
       External services (optional)
      - Email / push provider
      - Error monitoring
      - Analytics with privacy controls

### Deployment units

For Stage 1:
- One stateless API service.
- One PostgreSQL database.
- One responsive web frontend deployment.
- Optional background worker when scheduled reminders or recurring jobs are introduced.
- Object storage only if receipt uploads are added later.

For the future hybrid stages, add a provider integration module and reconciliation worker only when a real provider has been selected and its capabilities are understood. Keep partner-specific APIs behind an adapter; do not spread provider SDK calls through budget or transaction modules.

Do not add Kafka, RabbitMQ, Redis or microservices without a demonstrated need. A relational database and a modular API are enough for the first cohort.

## 4. Proposed technology stack

| Layer | Recommendation | Reason |
|---|---|---|
| Language | TypeScript / Node.js 20+ LTS (use a currently supported LTS at implementation time) | Existing skill and repository |
| API | Express.js or NestJS | Express can continue the current code; NestJS is an option if stronger module structure is desired |
| Validation | Zod | Already present and suitable for runtime validation |
| Database | PostgreSQL | Strong relational integrity and exact NUMERIC types |
| Data access | pg with repository layer, or a typed query builder | Keep SQL explicit and testable |
| Authentication | Managed OIDC provider or secure first-party auth | Avoid building password/session security casually |
| Frontend | React + TypeScript, responsive mobile-first | Broad ecosystem and practical web MVP |
| API contract | OpenAPI 3 | Existing Swagger setup |
| Tests | Jest + Supertest; add property-based tests for calculations | Existing tools and high-value financial logic tests |
| Migrations | node-pg-migrate, Knex migrations or another versioned migration tool | Reproducible schema changes |
| Hosting | Managed app hosting plus managed PostgreSQL | Reduce operational burden |
| Monitoring | Structured logs, error monitoring and uptime checks | Find failures without collecting unnecessary financial detail |

Keep the backend independent of the frontend framework. Do not choose a framework only because it is fashionable.

## 5. Domain model

All records are scoped to an authenticated user. Use UUID primary keys. Include created_at and updated_at where relevant. Store timestamps in UTC and use the user's timezone for period calculations.

### 5.1 users
- id UUID primary key
- auth_subject text unique (identity provider subject)
- email text nullable / unique where verified
- phone text nullable
- display_name text
- currency char(3), default NGN
- timezone text, default Africa/Lagos
- week_starts_on smallint
- created_at, updated_at, deleted_at

### 5.2 income_sources
- id UUID
- user_id UUID foreign key
- name text
- source_type text (salary, business, freelance, gift, other)
- active boolean
- created_at, updated_at

### 5.3 income_records
- id UUID
- user_id UUID
- income_source_id UUID nullable
- amount_minor bigint (or NUMERIC exact representation)
- currency char(3)
- status text (expected, received, cancelled)
- expected_at timestamptz nullable
- received_at timestamptz nullable
- note text nullable
- created_at, updated_at, deleted_at

### 5.4 planning_periods
- id UUID
- user_id UUID
- name text
- period_type text (daily, weekly, monthly, yearly, custom)
- starts_at timestamptz
- ends_at timestamptz
- timezone text
- status text (draft, active, completed, archived)
- rollover_policy text
- created_at, updated_at

### 5.5 budgets
- id UUID
- user_id UUID
- planning_period_id UUID
- parent_budget_id UUID nullable
- category_id UUID nullable
- name text
- budget_type text (overall, category, jar)
- planned_amount_minor bigint
- currency char(3)
- rollover_enabled boolean
- status text (active, paused, archived)
- created_at, updated_at

### 5.6 categories
- id UUID
- user_id UUID nullable for system categories
- name text
- icon_key text nullable
- is_system boolean
- created_at, updated_at

### 5.7 expenses
- id UUID
- user_id UUID
- category_id UUID
- budget_id UUID nullable
- amount_minor bigint
- currency char(3)
- merchant text nullable
- note text nullable
- payment_method text nullable
- occurred_at timestamptz
- source text (manual, imported)
- created_at, updated_at, deleted_at

### 5.8 commitments
- id UUID
- user_id UUID
- planning_period_id UUID
- name text
- amount_minor bigint
- due_at timestamptz
- status text (planned, paid, cancelled)
- recurrence_rule text nullable
- created_at, updated_at

### 5.9 allocations
- id UUID
- user_id UUID
- planning_period_id UUID
- budget_id UUID
- amount_minor bigint
- allocation_type text (commitment, savings, flexible)
- created_at, updated_at

### 5.10 plan_change_events / audit_events
- id UUID
- user_id UUID
- entity_type text
- entity_id UUID
- action text
- before_state jsonb nullable
- after_state jsonb nullable
- occurred_at timestamptz
- request_id text nullable

### 5.11 idempotency_records
- id UUID
- user_id UUID
- idempotency_key text
- request_hash text
- response_status integer nullable
- response_body jsonb nullable
- created_at timestamptz
- expires_at timestamptz nullable
- unique(user_id, idempotency_key)

### Future-only entities (do not build for Stage 1)

When a provider is selected, model real-money features separately from virtual budgets:
- **provider_connections:** provider identifier, external customer reference, consent state, connection status and timestamps. Never store provider secrets or raw credentials here.
- **money_pots:** internal ID, user ID, provider connection ID, external pot/account reference, currency, status and display metadata.
- **money_movements:** requested amount, currency, direction, provider reference, idempotency key, state, failure code and timestamps.
- **provider_events:** provider event ID, event type, signature verification result, received time and processing state.
- **reconciliation_records:** expected versus provider-confirmed balances/movements, discrepancy state and resolution metadata.

Treat these as a future design sketch, not approved Stage 1 schema. The exact entities depend on the selected provider's product and contract.

Indexes:
- income_records(user_id, received_at DESC)
- expenses(user_id, occurred_at DESC)
- expenses(user_id, category_id, occurred_at DESC)
- planning_periods(user_id, starts_at, ends_at)
- budgets(user_id, planning_period_id, status)
- commitments(user_id, due_at, status)
- audit_events(user_id, occurred_at DESC)

Use database constraints for positive amounts, valid statuses, valid date ranges and foreign keys. Use partial indexes for active records if query patterns justify them.

## 6. Monetary and calculation design

### Monetary representation

For NGN, represent amounts in kobo as integer minor units where practical. Example: ₦1,250.50 = 125050 kobo. The API may accept decimal strings for readability, but convert and validate them into integer minor units at the boundary.

Never use JavaScript floating point for financial arithmetic. Use bigint carefully or a decimal library for calculations and serialise amounts as strings in JSON to avoid precision loss.

### Safe-to-spend engine

Implement as a pure domain service with no direct database calls. Inputs should be explicit and testable:

- Period start and end.
- User timezone.
- Current period date.
- Confirmed available starting amount (manual in MVP).
- Received income counted in the period.
- Expenses in the period.
- Unpaid commitments due in the period.
- Protected savings allocations.
- Other reservations.
- Rollover policy.
- Number of remaining spending days.

Suggested model:

    flexible_remaining =
      starting_available
      + received_income_included
      + permitted_rollover
      - period_expenses
      - unpaid_commitments_reserved
      - protected_savings_reserved
      - other_reservations

    daily_guide = max(0, flexible_remaining / remaining_spending_days)

Avoid double counting: if the starting available amount already includes income or prior transactions, do not add them again. Define a single ledger-like source of truth for the plan calculation and test it with examples.

Return a calculation breakdown:
- amount available at start
- income included
- expenses counted
- commitments reserved
- savings reserved
- flexible amount remaining
- remaining days
- daily guide
- calculation timestamp
- data confidence/source label

If flexible_remaining is negative, return zero safe-to-spend and an overspend/shortfall status, not a negative allowance. If no days remain, return a period-complete state rather than divide by zero.

### Period boundaries

Use IANA timezone data. Determine local calendar-day boundaries in the user's timezone, then convert to UTC for queries. Store the timezone used when the plan was created so later profile changes do not silently alter an existing plan.

## 7. API design

Base path: /api/v1

All routes require authenticated identity except health and auth callback routes. Derive user_id from verified auth context. Never accept a user_id from request payload as authority.

### Authentication / profile
- GET /me
- PATCH /me
- DELETE /me (or initiate deletion workflow)
- GET /me/export

### Planning periods
- POST /planning-periods
- GET /planning-periods
- GET /planning-periods/:periodId
- PATCH /planning-periods/:periodId
- POST /planning-periods/:periodId/activate
- POST /planning-periods/:periodId/complete

### Income
- POST /income
- GET /income
- GET /income/:incomeId
- PATCH /income/:incomeId
- DELETE /income/:incomeId

### Expenses
- POST /expenses
- GET /expenses
- GET /expenses/:expenseId
- PATCH /expenses/:expenseId
- DELETE /expenses/:expenseId

### Budgets and commitments
- POST /budgets
- GET /budgets
- PATCH /budgets/:budgetId
- DELETE /budgets/:budgetId
- POST /commitments
- GET /commitments
- PATCH /commitments/:commitmentId
- DELETE /commitments/:commitmentId

### Dashboard and reports
- GET /dashboard
- GET /planning-periods/:periodId/safe-to-spend
- GET /reports/summary
- GET /reports/categories
- GET /reports/trends

### Notifications / preferences
- GET /notification-preferences
- PATCH /notification-preferences

### API conventions

- JSON request and response bodies.
- ISO 8601 timestamps.
- Amounts represented as integer minor units or decimal strings, with currency.
- Cursor or page-based pagination for history.
- Filter by date range, category, budget and type.
- Consistent error format with machine-readable code, safe message and request ID.
- Validate all path, query and body data with Zod.
- Use idempotency keys on create operations that may be retried.
- Document auth scopes, status codes and schemas in OpenAPI.
- Return 404 for resources not owned by the authenticated user to avoid disclosing their existence.

Example expense request:

    POST /api/v1/expenses
    Idempotency-Key: <unique-client-generated-key>

    {
      "amountMinor": 250000,
      "currency": "NGN",
      "categoryId": "uuid",
      "occurredAt": "2026-11-02T11:30:00+01:00",
      "merchant": "Example shop",
      "note": "Groceries"
    }

The amount above is ₦2,500.00 when NGN is stored in kobo.

## 8. Security and privacy requirements

- HTTPS only; HSTS in production.
- Use a trusted OIDC provider or a well-reviewed authentication implementation.
- Validate token issuer, audience, signature, expiry and subject.
- Use secure, HttpOnly, SameSite cookies for browser sessions where applicable; protect state-changing cookie-authenticated requests against CSRF.
- Never trust user IDs supplied by the client.
- Enforce ownership checks on every read and write.
- Use parameterised SQL only.
- Store secrets in a secret manager or deployment environment, never in Git.
- Apply rate limits to authentication, expense writes and export endpoints.
- Set strict CORS allowlists and security headers.
- Limit request body size and validate uploaded file types if uploads are later added.
- Encrypt backups and sensitive data at rest through the managed database provider.
- Avoid logging amounts, notes, tokens, passwords or full financial records unless strictly necessary.
- Keep audit logs access-controlled and tamper-resistant.
- Define retention, export and deletion workflows.
- Use least-privilege database credentials.
- Run dependency scanning, static analysis and secret scanning in CI.
- Complete a security review before inviting external users.

Nigeria-specific privacy and financial regulation must be reviewed with qualified counsel. The Nigeria Data Protection Act 2023 and applicable NDPC guidance may apply to personal data processing. If PAYJAR later holds funds, initiates payments, provides account information services or controls cards, assess applicable CBN rules and partner licensing requirements before implementation.

## 9. Reliability and consistency

- Use PostgreSQL transactions for multi-row financial changes.
- Enforce idempotency at the database level, not only in application memory.
- A repeated idempotency key with the same request returns the original result.
- A repeated key with a different request returns HTTP 409.
- Apply optimistic concurrency/version checks to edits where stale updates are possible.
- Use soft deletion or reversal records for financial records where auditability matters.
- Use database constraints to protect referential and amount integrity.
- Run automated backups and test restore at least before pilot and periodically thereafter.
- Use health and readiness endpoints.
- Gracefully handle database timeouts and transient failures.

## 10. Background jobs and notifications

The initial MVP can send in-app reminders or email summaries. Add a worker when scheduled jobs are required.

Requirements:
- Store notification preferences and timezone.
- Schedule reminders using local user time.
- Deduplicate jobs with a unique event key.
- Retry transient provider failures with bounded exponential backoff.
- Do not retry permanent failures forever.
- Track queued, sent, failed and suppressed states.
- Respect quiet hours and opt-outs.
- Do not include sensitive financial amounts in lock-screen notifications by default.

A PostgreSQL-backed job queue may be sufficient initially. Redis or a dedicated queue can be introduced when load and delivery needs justify it.

## 11. Testing strategy

### Unit tests
- Safe-to-spend calculation.
- Daily and weekly period boundaries.
- Timezone and daylight-saving cases.
- Rollover rules.
- Income received versus expected.
- Expense create/edit/delete effects.
- Commitment reservation.
- Refund and transfer classification.
- Monetary parsing and rounding.

### Integration tests
- Database constraints and migrations.
- Authenticated ownership checks.
- Expense and income CRUD.
- Budget recalculation.
- Idempotent create requests.
- Concurrent duplicate requests.
- Audit event creation.
- Data export and deletion workflow.

### API / end-to-end tests
- New user onboarding to first plan.
- Record expense and see dashboard update.
- Record income and reallocate.
- Overspend and revise plan.
- User A cannot read or update User B's records.
- Timezone rollover at midnight.
- Period end and next-period creation.

### Quality gates
- No critical or high severity security issue open before pilot.
- Core domain calculation test coverage target: 95% or higher.
- Overall backend coverage target: 80% or higher as a working target.
- CI must run lint, type-check, tests and migration checks.
- Load test agreed pilot workload and record p95 latency.

## 12. Observability and operations

- Structured JSON logs with request ID, route, status and latency.
- Error monitoring with personally identifiable information scrubbed.
- Metrics: request rate, error rate, p95 latency, DB pool saturation, job failures and active users.
- Uptime and readiness monitoring.
- Alerts for sustained API errors, database failures and backup failures.
- Runbooks for outage, data restore, compromised secret and account deletion.
- Separate development, staging and production environments.
- Use safe synthetic data in non-production environments.

## 13. Deployment and environments

Suggested environments:
- Local development with Docker Compose and PostgreSQL.
- Shared staging with synthetic/test data.
- Production with managed PostgreSQL, TLS, backups and secret management.

CI/CD:
1. Install locked dependencies.
2. Run formatting/lint and TypeScript checks.
3. Run unit and integration tests.
4. Build application.
5. Run dependency and secret scans.
6. Deploy to staging.
7. Run smoke tests.
8. Apply backward-compatible database migrations.
9. Deploy production.
10. Monitor health and error rates.

Never run destructive schema changes automatically without a reviewed migration and recovery plan.

## 14. Performance and scale targets

Initial pilot targets:
- p95 read API latency below 500 ms under agreed load.
- p95 write API latency below 800 ms under agreed load.
- 99.5% monthly API availability target for pilot.
- Paginated transaction history.
- Database indexes based on real query plans.
- Stateless API instances so they can scale horizontally.

These are proposed targets, not measured performance claims. Establish a baseline load test before public beta.

## 15. Migration plan from current code

1. Create a product-discovery branch and preserve current main branch.
2. Remove node_modules from version control and add/verify .gitignore.
3. Review and rotate any credentials or secrets ever committed.
4. Introduce versioned SQL migrations.
5. Add authentication and user ownership before exposing financial data.
6. Add the new product domain tables: users, planning_periods, income, expenses, budgets, categories, commitments, allocations and audit events.
7. Implement a pure safe-to-spend domain service with unit tests.
8. Add authenticated REST endpoints and OpenAPI schemas.
9. Build a mobile-first frontend.
10. Keep wallet/payment routes disabled or isolated from the MVP API.
11. Add observability, backup/restore and security tests.
12. Run internal testing, then a closed pilot.

Do not attempt a large rewrite of every existing file in one step. Make small, reviewed changes. The wallet ledger can remain as an isolated experimental module or be removed from the active build if it creates confusion.

## 16. Hybrid expansion: partner integration design gate

PAYJAR's long-term direction includes real-money pots and genuine spending controls. These must remain outside the Stage 1 money model.

### Provider selection requirements
Evaluate providers against:
- Their legal authorisation and permitted activities in Nigeria.
- Whether they support the exact product: named pots, sub-accounts, virtual accounts, card controls or payment initiation.
- Settlement and balance semantics, fees, limits and service availability.
- Webhook signing, event delivery guarantees, idempotency and reconciliation tools.
- Dispute, reversal, refund and customer-support responsibilities.
- Data protection, consent, retention and incident obligations.
- Sandbox quality, documentation and commercial terms.

Do not assume that a provider's ability to create virtual accounts means it can enforce a spending cap or create a true locked pot.

### Integration architecture
- Create a dedicated provider adapter interface.
- Keep provider-specific IDs and event formats inside the integration module.
- Use a durable outbox/inbox pattern for movement requests and provider events when money movement is introduced.
- Verify webhook signatures and deduplicate provider event IDs.
- Treat provider-confirmed state as authoritative for actual funds; PAYJAR's local state is a projection.
- Reconcile movements and balances on a schedule and surface unresolved discrepancies.
- Model states such as requested, pending, successful, failed, reversed and disputed.
- Never mark a transfer successful merely because the API request was accepted.
- Require explicit user consent and provide revocation where applicable.
- Keep a safe failure mode: budgeting and manual tracking continue if a partner is down.

### Real spending controls
A genuine restriction requires enforcement at the payment instrument, account or provider layer. An in-app countdown, reminder or hidden button is not a financial restriction. Only expose a control if the provider confirms that it supports it and the legal and operational model has been approved.

Potential future capabilities include:
- Read-only bank transaction import through an approved provider and explicit consent.
- Money pots or sub-accounts held/operated by an appropriately authorised provider.
- Payment initiation through a licensed provider.
- Card or merchant-category controls through a regulated partner.
- Scheduled allocations where supported by provider APIs.
- Receipt scanning and transaction categorisation.

Before any integration:
- Confirm the legal role of PAYJAR and the provider.
- Review CBN and NDPC requirements with counsel.
- Define explicit consent and revocation.
- Threat-model tokens, webhooks and account linking.
- Design reconciliation, reversals, disputes and failure handling.
- Define customer support and incident response.
- Update the PRD and TRD with the exact provider contract.

Do not describe an in-app jar lock as a real restriction on external payments.

## 17. Staged implementation boundaries

**Stage 1 — build now:** responsive web frontend, authenticated API, PostgreSQL domain model, manual income/expense records, virtual budgets/jars, safe-to-spend engine, reminders and basic reports.

**Stage 2 — design after validation:** provider adapter, consent records, real-money pot mapping, movement state machine, signed webhooks, reconciliation and operational support. Implement only after provider and legal review.

**Stage 3 — provider-dependent controls:** card/account limits and merchant/category restrictions only where the partner supports enforceable controls. Include emergency access, user confirmation and recovery processes.

Do not create a generic wallet ledger and assume it can represent provider-held funds. The provider contract determines the actual money model.

## 18. Technical decisions summary

| Decision | Choice | Reason |
|---|---|---|
| Architecture | Modular monolith | Fast to build and maintain |
| API | TypeScript + Express | Reuse current code and skills |
| Database | PostgreSQL | Relational integrity and exact money types |
| Money | Integer minor units / exact decimal | Avoid floating-point errors |
| Auth | Trusted OIDC or reviewed auth | Secure identity and access control |
| Budget calculation | Pure domain service | Deterministic and testable |
| Jobs | Add worker only when needed | Avoid early infrastructure overhead |
| Payments | Out of MVP | Keep product scope and regulatory risk controlled |
| Bank integrations | Later, opt-in | Requires partner and compliance review |

## 19. References

- Current repository: https://github.com/JohnUghiovhe/Payjar
- Node.js releases: https://nodejs.org/en/about/previous-releases
- PostgreSQL documentation: https://www.postgresql.org/docs/
- Express security best practices: https://expressjs.com/en/advanced/best-practice-security.html
- OWASP Application Security Verification Standard: https://owasp.org/www-project-application-security-verification-standard/
- Nigeria Data Protection Commission: https://ndpc.gov.ng/
- Central Bank of Nigeria: https://www.cbn.gov.ng/

This TRD is a proposed MVP design. Confirm framework versions, hosting, identity provider, security controls and legal requirements before production implementation.

# PAYJAR Implementation Roadmap

**Version:** 0.1  
**Date:** 2 November 2026  
**Product direction:** Hybrid personal finance and spending-control platform  
**Initial market:** Nigeria  
**Initial platform:** Responsive web, mobile-first

## Guiding strategy

Build the product in stages. Prove that people use and value the daily spending plan before taking on real-money movement, custody, payment controls or native mobile apps.

## Phase 0 — Product discovery and technical safety
**Indicative duration:** 2–3 weeks

### Product work
- Interview 15–25 salaried early-career adults in Nigeria.
- Ask how they plan spending, track expenses and handle overspending today.
- Test whether daily safe-to-spend guidance changes a real decision.
- Test willingness to record expenses manually.
- Walk through PreSpend and at least two budgeting products.
- Prototype onboarding, plan creation, dashboard, quick expense entry and weekly review.
- Test the prototype with 5–8 users.

### Engineering work
- Preserve the current main branch and work on a feature branch.
- Remove tracked node_modules and verify .gitignore.
- Review repository history for committed secrets; rotate any exposed credentials.
- Add versioned database migrations.
- Decide authentication provider and session approach.
- Write down the exact safe-to-spend calculation and examples before coding.
- Establish development, staging and production configuration.

### Exit criteria
- At least 15 interviews completed.
- At least 10 people describe a recent, specific spending-control problem.
- Users understand the difference between virtual jars and real-money pots.
- Prototype usability issues are recorded and prioritised.
- No unresolved critical security or secret-management issue in the foundation.

## Phase 1 — Non-custodial web MVP
**Indicative duration:** 4–6 weeks, depending on scope and availability

### Product features
- Responsive, mobile-first web app.
- Sign-up, sign-in, account recovery and profile.
- NGN and Africa/Lagos defaults, editable by the user.
- Onboarding and one active monthly plan.
- Income records with expected and received states.
- Expense entry, categories, notes and transaction history.
- Commitments and savings allocations.
- Virtual jars and category budgets.
- Daily and weekly views derived from the same monthly flexible pool.
- Safe-to-spend calculation with a visible breakdown.
- Dashboard and basic reports.
- Clear labels that balances are based on manual entries and are not bank-verified.
- In-app reminders and budget threshold alerts if time permits.

### Engineering order
1. Authentication and user ownership.
2. Migrations and core domain schema.
3. Money value object and amount parsing.
4. Planning period and timezone rules.
5. Income and expense CRUD.
6. Budget, category and virtual jar logic.
7. Safe-to-spend domain service and test suite.
8. Dashboard and report endpoints.
9. Responsive frontend.
10. Security, observability, backup and deployment checks.

### Exit criteria
- A user can complete onboarding and create a monthly plan.
- A user can record income and expenses.
- The daily guide recalculates correctly after relevant changes.
- Edits and deletes do not corrupt historical totals.
- Internal transfers are not treated as expenses.
- Ownership tests prove that one user cannot access another user's records.
- Core calculations have strong automated test coverage.
- Backup restore and basic operational alerts are tested.

## Phase 2 — Closed pilot and retention work
**Indicative duration:** 4–6 weeks

- Recruit 30–50 users from the primary segment.
- Observe onboarding and first-plan completion.
- Ask users to use PAYJAR during a real pay cycle.
- Interview users who stop logging expenses.
- Track weekly active planners, first expense, repeat use and plan review.
- Ask whether the safe-to-spend figure changed a spending decision.
- Reduce expense-entry steps and add requested templates or recurring items.
- Improve plan edits, mid-period income handling, reminders and history.

Working validation thresholds, not industry benchmarks:
- At least 20 users activate and create a plan.
- At least 50% of activated users return in week two.
- At least 40% of activated users record expenses on three or more days in a week.
- Users can explain why the daily guide is useful.
- The team has evidence about the biggest retention barriers.

If users sign up but do not record expenses or return, improve the core loop before adding financial integrations.

## Phase 3 — Partner and regulatory discovery for real-money pots
**Indicative duration:** 3–6 weeks of discovery; implementation depends on partner

- Define the intended legal and operational role of PAYJAR.
- Get qualified Nigerian legal and compliance advice.
- Identify licensed providers that support the exact desired pot/account/payment features.
- Verify provider authorisation, product scope and restrictions.
- Review fees, limits, settlement, reversals, disputes and support responsibilities.
- Confirm API, sandbox, webhook, idempotency and reconciliation capabilities.
- Conduct privacy and security impact reviews.
- Test user demand for real-money pots and willingness to move funds.

Exit only when provider capability is demonstrated, legal review supports the model, commercial and operating responsibilities are clear, and a threat model and reconciliation design are approved.

## Phase 4 — Partner-enabled money pots

Provider-dependent features:
- Explicit account/provider linking and consent.
- Provider-backed pots or sub-accounts where supported.
- Movement requests with idempotency and state tracking.
- Signed webhook processing and event deduplication.
- Reconciliation and discrepancy handling.
- Provider-confirmed balances clearly separated from manual estimates.
- Refund, reversal, failed transfer and support flows.
- Safe behaviour when provider services are unavailable.

Do not label a virtual jar as a real pot until funds are actually held or allocated by the provider under the agreed model.

## Phase 5 — Enforceable spending controls

Explore card or account controls only if a partner supports the exact restriction: daily and category limits, merchant/category controls, scheduled release, cooling-off and emergency override. Include user confirmation, dispute and recovery paths.

A UI lock alone is not a real payment control. Never promise that external payments are blocked unless the provider enforces it.

## Phase 6 — Scale and platform expansion

Consider only after product-market evidence:
- Native Android and iOS apps.
- Read-only bank transaction imports.
- Shared plans and accountability features.
- Additional currencies and countries.
- Employer or campus financial-wellness distribution.
- Advanced insights and automation.

## Delivery practices

- Work in small feature branches and reviewed pull requests.
- Keep the PRD, TRD and API contract in sync.
- Add tests with each financial rule.
- Never use floating-point arithmetic for money.
- Use feature flags for partner-dependent functionality.
- Do not store provider secrets in the application database or repository.
- Keep test data synthetic.
- Run security and dependency scans in CI.
- Keep a release checklist and rollback plan.

## First two weeks: concrete work plan

| Week | Focus | Deliverable |
|---|---|---|
| 1 | User interviews, competitor walkthrough, scope decisions | Research notes and prioritised MVP |
| 1 | Repository audit, secrets and dependency hygiene | Safe development baseline |
| 2 | User flows and clickable mobile-first prototype | Tested prototype |
| 2 | Calculation examples, schema and API contract | Reviewed technical design |

## What not to build yet

- A custom bank or stored-value wallet.
- Payment initiation or card issuance.
- Real-money locked savings.
- Bank account aggregation.
- Microservices, Kafka or RabbitMQ without a measured need.
- Native apps before web retention is proven.
- AI features before the core planning and tracking loop works.

The first success milestone is not moving money. It is proving that users repeatedly plan, record and make better daily spending decisions with PAYJAR.
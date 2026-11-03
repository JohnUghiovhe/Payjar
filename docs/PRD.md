# PAYJAR Product Requirements Document (PRD)

**Version:** 0.2  
**Date:** 2 November 2026  
**Status:** Discovery draft  
**Owner:** Product / Founder  
**Initial market:** Nigeria  
**Product:** PAYJAR hybrid personal finance and spending-control platform

## 1. Product overview

PAYJAR helps people plan how to use income, understand spending and stay within self-defined limits. The long-term product is hybrid: it combines a planning and tracking experience with optional real-money allocation and payment controls delivered through suitable regulated financial partners. The initial release is non-custodial. It records user-entered information and provides planning guidance; it does not hold funds, execute payments or block external transactions.

## 2. Problem statement

People often know their income but lack a simple way to turn it into a safe daily spending plan. Monthly budgets can be hard to follow in daily life. Small purchases go unrecorded, fixed commitments compete with flexible spending, and users discover overspending too late.

PAYJAR should connect three jobs in one simple loop:
1. Plan: assign income to commitments, savings and flexible spending.
2. Act: see today's guide and record spending with low effort.
3. Learn: review actual spending and adjust the next plan.

## 3. Vision and goals

### Vision
Make disciplined spending clear, practical and sustainable.

### Product goals
- Help users create a realistic plan for a defined period.
- Show a clear, explainable safe-to-spend figure.
- Make expense recording fast and reliable.
- Help users spot budget pressure before the period ends.
- Give users useful income, expense and category reports.
- Build trust through clear handling of financial data.

### Non-goals for MVP
- PAYJAR independently holding customer funds or operating an unlicensed stored-value wallet.
- PAYJAR directly initiating transfers, deposits, withdrawals or bill payments in the initial release.
- Claiming that an in-app lock blocks bank, card, USSD or cash spending.
- Credit, lending, investment advice or savings custody.
- Open banking or automatic bank transaction import.
- Business accounting, tax filing or bookkeeping.
- Shared family accounts or multi-user approval flows.
- AI financial advice.
- Multi-currency support beyond a later planned expansion.

## 4. Target users and personas

### Primary: salaried early-career adult
Receives income on a regular schedule, pays recurring bills, spends across several categories and wants to make money last until the next payday.

Needs: quick setup, monthly plan, daily safe-to-spend, expense logging and clear warnings.

### Secondary: irregular-income worker
Receives freelance, contract or gig income at uneven times.

Needs: record income as it arrives, create custom planning periods, protect commitments and recalculate the flexible allowance.

### Secondary: student / allowance-based user
Receives a fixed allowance and needs a simple daily or weekly limit.

Needs: easy allowance setup, low-friction tracking and reminders.

## 5. Product principles

- Today's decision should be obvious within seconds.
- Do not make users do complex accounting to get value.
- Never present an estimate as a verified bank balance.
- Do not shame users for overspending.
- Make every budget rule visible and editable.
- Keep expense entry short.
- Keep the product useful without bank integrations.
- Explain how a daily allowance is calculated.

## 6. Core concepts and definitions

- **Income:** Money received by the user, such as salary, business income or gifts.
- **Expense:** Money spent by the user.
- **Transfer:** Movement between the user's own accounts or jars. It is not income or expense.
- **Commitment:** Money the user plans to use for a bill or obligation.
- **Savings allocation:** Money the user intends to set aside. In MVP this is a plan, not a transfer or locked deposit.
- **Budget:** A spending plan for a defined period or category.
- **Budget period:** Daily, weekly, monthly, yearly or custom date range.
- **Safe-to-spend:** A planning estimate of flexible money available per remaining day or period, based on recorded and user-entered information.
- **Jar:** A named allocation or purpose for money. In MVP it is a virtual planning bucket, not a bank account.

## 7. MVP scope

### 7.1 Account and profile
- Sign up and sign in securely.
- Verify email or phone using a chosen authentication provider.
- Create a profile with display name, preferred currency (NGN initially), timezone and start-of-week preference.
- Support account recovery and sign out.
- Allow user data export and account deletion requests.

### 7.2 Onboarding and first plan
- Explain that PAYJAR is a planning and tracking tool, not a bank.
- Ask for income pattern: regular or irregular.
- Allow one or more income sources and expected dates.
- Ask the user to create a plan period and set expected income.
- Allow allocation to commitments, savings goals and flexible spending.
- Show a preview of the daily safe-to-spend amount before saving.
- Let users skip optional setup and start with a simple daily or monthly cap.

### 7.3 Income management
- Add, view, edit and delete income records.
- Fields: amount, source, date received or expected, recurrence (optional), note and status.
- Distinguish expected income from received income.
- Do not count expected income as available cash by default. Let the user opt in to a forecast view and label it clearly.
- Support multiple income sources.
- Prevent negative or zero amounts.

### 7.4 Expense management
- Add, view, edit and delete an expense.
- Required fields: amount, date/time and category.
- Optional fields: note, merchant, payment method, jar/budget and attachment in a later release.
- Provide common categories such as food, transport, housing, utilities, health, education, shopping, subscriptions, family, entertainment and other.
- Allow custom categories.
- Allow quick-add from the dashboard.
- Support search, date filters and category filters.
- Make manual entries clearly identifiable as user-entered.
- Editing/deleting an expense must recalculate affected budget totals.

### 7.5 Budgets and jars
- Create budgets for daily, weekly, monthly, yearly or custom periods.
- Create category budgets and an overall flexible-spend budget.
- Create named virtual jars with target amounts and periods.
- Support planned allocations for bills, savings and flexible spending.
- Clearly label virtual jars as planning allocations, not separate bank balances or deposits.
- Show planned, spent and remaining values.
- Allow pause, archive and edit.
- Preserve history when a budget changes. Do not rewrite old transactions.
- Define rollover behaviour explicitly. Default: unused funds remain in the period pool; the daily guide recalculates based on remaining flexible funds and remaining days. Users can choose no rollover or a custom rule.
- Warn when category budgets exceed the overall flexible pool.
- Do not allow allocations to silently exceed the plan's available amount; explain the difference and let the user revise.

### 7.6 Daily safe-to-spend
- Show today's amount on the home dashboard.
- Show the inputs used: available funds entered by user, received income, commitments remaining, savings allocation, flexible pool and days remaining.
- Support fixed daily cap and dynamically calculated daily guide.
- Show spent today, remaining today and period progress.
- Recalculate when an income, expense, commitment or budget changes.
- Explain whether the number is based on manual data or a future connected source.
- Clearly state that PAYJAR cannot stop payments made outside the app.
- Do not count transfers between the user's own jars as expenses.
- Do not treat expected income as received funds unless user chooses a forecast.

### 7.7 Alerts and discipline tools
- Optional reminders to log expenses.
- Alerts at configurable budget thresholds (default suggestions: 75%, 90%, 100%).
- Daily summary and weekly review reminders.
- Optional user-created cooling-off period for a virtual jar or category. In Stage 1 this is an in-app friction tool only, not a bank or card restriction.
- User can snooze or disable notifications.
- No shame-based language or manipulative streak mechanics.

### 7.8 Reports and history
- Dashboard: income, expenses, planned commitments, flexible balance and safe-to-spend.
- Reports by day, week, month and custom range.
- Category breakdown and trend comparison.
- Budget adherence and overspend days.
- Income versus expenses over time.
- CSV export in a later MVP milestone if schedule allows.
- Empty states should teach users how to begin.

## 8. User journeys

### Journey A: New user creates a monthly plan
1. User creates an account.
2. User chooses NGN and timezone.
3. User enters monthly take-home income and payday.
4. User adds bills and savings allocations.
5. PAYJAR calculates flexible money.
6. User chooses fixed daily cap or calculated guide.
7. Dashboard displays today's safe-to-spend and remaining monthly amount.

### Journey B: User records a purchase
1. User taps “Add expense”.
2. User enters amount, category and optional note.
3. User selects date/time (defaults to now).
4. User saves.
5. PAYJAR updates today's spend, category budget and period balance.
6. If a threshold is crossed, PAYJAR shows a clear alert.

### Journey C: User receives extra income
1. User records income and marks it received.
2. User chooses how much goes to commitments, savings and flexible spending.
3. PAYJAR updates the plan and explains the new safe-to-spend value.
4. The app keeps the original plan history for review.

### Journey D: User overspends
1. User records an expense that takes them above the daily guide.
2. PAYJAR shows the amount over the guide without shaming the user.
3. PAYJAR explains the impact on the remaining period.
4. User can accept the revised daily guide or adjust their plan.
5. PAYJAR records the adjustment in plan history.

## 9. Functional requirements

Priority: P0 = required for MVP; P1 = important next; P2 = later.

| ID | Requirement | Priority |
|---|---|---|
| FR-001 | User can register, authenticate and recover access | P0 |
| FR-002 | User can manage profile, currency and timezone | P0 |
| FR-003 | User can create and edit a planning period | P0 |
| FR-004 | User can record received and expected income separately | P0 |
| FR-005 | User can add, edit, delete and list expenses | P0 |
| FR-006 | User can categorise expenses and create custom categories | P0 |
| FR-007 | User can define overall and category budgets | P0 |
| FR-008 | User can add commitments and savings allocations | P0 |
| FR-009 | System calculates and explains safe-to-spend | P0 |
| FR-010 | Dashboard shows today's and period-level position | P0 |
| FR-011 | System recalculates budgets after relevant changes | P0 |
| FR-012 | User can view filtered transaction history | P0 |
| FR-013 | User can view basic income and expense reports | P0 |
| FR-014 | User can configure budget threshold alerts | P1 |
| FR-015 | User can configure expense logging reminders | P1 |
| FR-016 | User can use custom budget periods | P1 |
| FR-017 | User can export financial records | P1 |
| FR-018 | User can create an in-app cooling-off lock | P1 |
| FR-019 | User can request data export and account deletion | P0 |
| FR-020 | System maintains a history of plan changes | P1 |

## 10. Business rules

### 10.1 Money representation
- Store monetary values as integer minor units (kobo for NGN) or exact database NUMERIC values. Never use binary floating point for financial calculations.
- Store currency code with each monetary record.
- Validate amount > 0.
- Round only for display, using currency-specific rules.
- Keep all calculations on the server as the source of truth.

### 10.2 Safe-to-spend calculation

For a selected plan period:

    flexible_pool = available_funds + received_income_added_to_period
                    - unpaid_commitments - protected_savings - other_reservations

    daily_guide = max(0, flexible_pool_remaining / remaining_spending_days)

This is a simplified model. The implementation must define how the initial available funds, period boundaries, expenses already incurred, and future commitments are counted to avoid double subtraction.

The MVP should persist plan inputs and compute a deterministic result. Display:
- Calculation timestamp.
- Period start/end.
- Amounts included and excluded.
- Manual/estimated/connected data status.

### 10.3 Periods and time
- Store timestamps in UTC.
- Store the user's IANA timezone, such as Africa/Lagos.
- Calculate day and period boundaries in the user's timezone.
- Define whether a week begins Monday or Sunday in profile settings.
- Yearly plans use calendar years unless user selects a custom date range.
- Handle leap years and daylight-saving changes for future regions.

### 10.4 Transaction classification
- Income increases the plan's available funds.
- Expense reduces the relevant budget.
- Internal transfer moves allocation but does not change total net worth or count as income/expense.
- Refunds should be represented as linked refund records or negative expense adjustments with audit history; never silently delete the original purchase.
- Expected income is forecast only, not actual available funds.

### 10.5 Edits and history
- Every update to a financial record records actor, time and changed fields.
- Budget changes affect future guidance, not historical transaction facts.
- Deleting a record should use soft-delete or an auditable reversal where appropriate.
- Duplicate submissions should be prevented using idempotency keys.

## 11. UX requirements

Core navigation:
- Home
- Activity
- Budgets / Jars
- Reports
- Profile / Settings

Home should prioritise:
1. Today's safe-to-spend.
2. Spent today and remaining guide.
3. Period flexible balance.
4. Upcoming commitments.
5. Quick-add expense and income.

Important UX states:
- No plan yet.
- No expenses recorded.
- Budget nearly used.
- Budget exceeded.
- Income expected but not received.
- Offline or sync pending.
- Data not verified by bank.
- Period ended.
- User has changed a plan mid-period.

Accessibility:
- Strong contrast and readable text.
- Do not use colour alone to signal budget status.
- Screen-reader labels for amounts and charts.
- Support dynamic text size and keyboard navigation where applicable.

## 12. Non-functional requirements

| Area | Requirement |
|---|---|
| Security | TLS in transit; strong password hashing or trusted identity provider; secure session handling |
| Privacy | Collect minimum data; clear consent and privacy notices; export/delete flows |
| Availability | MVP target 99.5% monthly service availability, excluding planned maintenance |
| Performance | p95 API read response under 500 ms and write under 800 ms under agreed pilot load |
| Reliability | Financial writes use database transactions and idempotency |
| Integrity | Server-side validation and exact monetary arithmetic |
| Scalability | Modular monolith that can scale horizontally; avoid premature microservices |
| Observability | Structured logs, error tracking, metrics and health checks |
| Accessibility | WCAG 2.2 AA target for web interface |
| Compatibility | Current and previous major versions of supported browsers; mobile-first responsive layout |
| Backup | Automated encrypted database backups and tested restore procedure |
| Maintainability | Typed interfaces, API documentation, migrations and automated tests |
| Auditability | Record material financial and plan changes with timestamps |

## 13. Success metrics

### North-star metric
**Weekly Active Planners:** users who have an active plan and record at least one expense or review their plan during a week.

### Activation
- Percentage completing onboarding.
- Percentage creating first plan.
- Time to first expense.
- Percentage reaching a useful safe-to-spend view.

### Engagement
- Weekly active planners.
- Expenses recorded per active user per week.
- Weekly plan reviews.
- Percentage of active users returning in week two and week four.

### Outcome
- Share of active users who finish a period within their chosen flexible-spend budget.
- Reduction in unplanned overspend reported by users over time.
- User-reported confidence in daily spending decisions.

### Guardrails
- Expense entry abandonment.
- Notification opt-out rate.
- Data correction rate.
- Support complaints about incorrect balances or misleading restrictions.
- Account deletion rate.

Do not optimise for raw expense volume or notification opens alone.

## 14. MVP release acceptance criteria

The MVP is ready for a closed pilot when:
- A new user can create an account and a first plan.
- A user can add income, commitments, savings allocations and expenses.
- The dashboard shows an explainable safe-to-spend value.
- Budget totals update correctly after create, edit and delete actions.
- Internal transfers are not counted as expenses.
- Period calculations use the user's timezone.
- Duplicate write requests do not create duplicate financial records.
- A user can view transaction history and basic reports.
- Security checks, automated tests and backup/restore checks pass.
- The UI clearly states that PAYJAR does not block external payments.

## 15. Risks, assumptions and open questions

Assumptions:
- First market is Nigeria.
- NGN is the initial currency.
- Users will accept manual entry in the first release.
- Initial release is non-custodial.
- Initial experience is mobile-first web or responsive app.

Open questions:
- Is the first customer segment salaried workers, students or irregular-income earners?
- Should the first plan be monthly, weekly or user-selected?
- Does a user think of “daily limit” as a fixed cap or a dynamic safe-to-spend guide?
- What expense-entry method will users tolerate?
- Do users want to track all income or only the income used for a plan?
- Is the strongest differentiator the daily calculation, the jars, or the discipline tools?
- Which notification channel do users prefer?

## 16. Product stages and roadmap

PAYJAR is a hybrid product by design, but the stages are deliberately separated.

### Stage 0: Discovery and validation
- Interview 15–25 people in the primary segment: salaried early-career adults in Nigeria.
- Validate the daily safe-to-spend problem and manual expense-entry willingness.
- Compare PreSpend and at least two budgeting products.
- Test a clickable mobile-first web prototype.
- Confirm that users understand the difference between virtual jars and real-money pots.

### Stage 1: Non-custodial web MVP
- Responsive web app, designed mobile-first.
- Authentication, profile, NGN and Africa/Lagos defaults.
- Income, expenses, categories, commitments and virtual jars.
- Monthly planning with daily and weekly views of the same allocation pool.
- Explainable safe-to-spend calculation.
- In-app cooling-off tools and threshold alerts.
- Basic reports and transaction history.
- No custody, payment initiation, bank linking or claims of external payment blocking.

### Stage 2: Partner-enabled money movement and pots
Only after user validation, partner due diligence and legal review:
- Explore a licensed provider that can offer named accounts, sub-accounts, virtual accounts or equivalent segregated allocations.
- Let users opt in to move funds into real-money pots where the provider supports the exact use case.
- Show provider-confirmed balances separately from PAYJAR's manual planning estimates.
- Support reconciliation, failed transfers, reversals, disputes, fees and consent revocation.
- Keep PAYJAR's planning experience useful if the partner is unavailable.

### Stage 3: Genuine spending controls
Subject to provider capabilities and regulatory approval:
- Card-linked controls, merchant/category restrictions or configurable spending limits.
- Scheduled allocations and controlled disbursements.
- Strong user confirmation, emergency access and recovery paths.
- Clear disclosures of what is and is not blocked.

### Stage 4: Scale
- Native mobile apps if usage data supports the investment.
- Additional currencies and markets after local legal and payment reviews.
- Shared plans, advanced insights and optional read-only account aggregation.

Do not commit to custody or payment restrictions until the legal role, provider contract, security model and operating responsibilities are clear.

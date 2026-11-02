# PAYJAR Go-to-Market Research

**Version:** 0.1  
**Date:** 2 November 2026  
**Status:** Discovery draft  
**Initial market hypothesis:** Nigeria  
**Product category:** Personal finance / budgeting / spending control

## 1. Executive summary

PAYJAR addresses a familiar problem: people know they should manage their money, but often struggle to decide what is safe to spend today, record spending consistently, and stay within a plan.

The opportunity is not simply to build another expense tracker. The stronger product proposition is a spending-control companion that helps users plan what is available, understand what has been spent, and take action before they overspend.

The idea is viable as a software product, but the core proposition already has close competitors. In particular, PreSpend in Nigeria appears to overlap with spending wallets, daily limits and money-locking features. PAYJAR must therefore validate a distinct reason for users to choose it.

**Recommended initial positioning:** “Know what you can spend. Know what you've spent. Stay within your plan.”

Start as a non-custodial planning and tracking app. Do not hold user money, initiate payments, issue cards or claim to block spending in the MVP. A budget warning is not a payment restriction. Actual restriction requires control at the account, card or payment layer, usually through regulated partners.

## 2. Problem definition

People may receive income monthly, weekly, irregularly or from several sources. Their fixed bills, savings goals and daily needs compete for the same pool of money. A monthly budget alone can be hard to translate into a safe daily decision.

Common pain points to validate:
- Users lose track of small, frequent purchases.
- Users spend money intended for bills or savings.
- Monthly budgets do not clearly answer “How much can I spend today?”
- Expense entry feels like work, so records become incomplete.
- Users do not know whether an overspend is a one-off event or a repeated habit.
- Irregular income makes fixed monthly plans hard to follow.
- Users want discipline but do not want to move all their money to a new provider.

These are hypotheses, not yet proven customer findings. Conduct interviews and observe current workarounds before finalising the product.

## 3. Market and target customer

### Initial geography

Nigeria is a sensible first market for discovery because the founder understands the local context and can recruit early interviewees. Treat mobile-first usage, NGN support, local date/time, local payment habits and variable income as design requirements.

EFInA's 2026 Access to Financial Services in Nigeria survey reports that 64% of Nigerian adults use digital financial services and 38% use a mobile phone or tablet to manage their finances. It also reports mobile money use rising from 12% in 2023 to 38% in 2026. These figures support a mobile-first distribution hypothesis, but they do not prove demand for PAYJAR. Source: https://a2f.ng/a2f-2026-report/

### Initial customer segments

1. **Early-career salaried workers (primary hypothesis):** Receive regular pay, face recurring bills and daily discretionary spending, and want to make salary last until payday.
2. **Young professionals with side income:** Have multiple income streams and need one view of cash flow.
3. **Students and NYSC members:** Often work with a fixed allowance and need clear daily limits.
4. **Freelancers and gig workers:** Have irregular income and need flexible budget periods.
5. **Households and couples (later):** Need shared plans and clear accountability.

Start with one primary segment: salaried early-career adults who manually manage money across one or more bank accounts. This gives the MVP a clear use case and an accessible recruitment group.

### Jobs to be done

- When I receive income, help me assign it to bills, savings and flexible spending.
- When I plan today's spending, show me a realistic amount I can use without harming the rest of my plan.
- When I spend, make it quick to record the amount and purpose.
- When I approach a limit, warn me early enough to change my choice.
- At the end of a week or month, show me what worked and what needs to change.

## 4. Competitive landscape

This is a directional desk review, not a complete feature audit. Product features, prices, availability and regulatory status can change. Re-check official product pages and app stores before launch.

| Product | Main proposition | Relevance to PAYJAR |
|---|---|---|
| PreSpend (Nigeria) | Spending controls, spending wallets, daily limits and money allocation | Closest direct overlap. PAYJAR needs a distinct user experience or audience. https://useprespend.com/ |
| PiggyVest | Savings goals, automated savings and locked savings | Competes for financial-discipline use cases, but focuses on saving. https://www.piggyvest.com/ |
| Cowrywise | Savings and investment products | Competes for users seeking structured financial habits. https://cowrywise.com/ |
| Spendee | Budgets, expense tracking, shared wallets and spending insights | Strong benchmark for budget and tracking UX. https://www.spendee.com/ |
| YNAB | Zero-based budgeting and assigning money jobs | Strong benchmark for planning methodology and behaviour change. https://www.ynab.com/ |
| Wallet by BudgetBakers | Expense tracking, budgets and account aggregation | Benchmark for reports, categories and connected accounts. https://budgetbakers.com/ |

### Competitive conclusion

The market already contains:
- Expense trackers.
- Envelope and category budgeting tools.
- Savings locks and goal products.
- Daily spending limits and spending-wallet products.

Therefore, “set a daily limit” alone is not a durable differentiator.

Potential areas to test:
- A useful daily safe-to-spend calculation that accounts for upcoming bills and remaining days.
- A fast, low-friction manual expense flow that works even without bank connections.
- A flexible plan for salary plus irregular income.
- A clear separation between committed money and flexible money.
- A non-custodial experience that does not require moving funds.
- Localised product language, categories and onboarding for Nigerian spending patterns.
- A respectful discipline system: user-chosen alerts, cooling-off periods and reflections rather than shame or punitive streaks.

Do not claim these features are unique until competitor research confirms it.

## 5. Product strategy and positioning

### Proposed value proposition

PAYJAR helps people turn their income into a clear spending plan, see what is safe to spend today, and stay accountable for where their money goes.

### Product principles

1. **Clarity before complexity:** A user should understand today's safe-to-spend amount in seconds.
2. **User control:** Users decide their budgets and can revise them with a clear audit trail.
3. **Honest controls:** Distinguish reminders and app-level locks from real bank/card payment restrictions.
4. **Low effort:** Logging an expense should take only a few taps.
5. **No shame:** Explain trade-offs and offer recovery plans after overspending.
6. **Privacy by default:** Collect only the data needed to deliver the service.
7. **Trust:** Never imply that a manually entered transaction is bank-verified.

### Suggested message

“Make your money last longer. Plan your spending, track every expense, and know what is safe to spend today.”

Avoid promising that PAYJAR can stop every overspend unless a regulated payment-control integration actually enforces the restriction.

## 6. Product model: how the allowance should work

A simple daily limit can mislead users if it ignores bills and future obligations. Use a “safe to spend” model.

At a chosen point in time:

**Available flexible money** = current available funds + expected income included by the user - unpaid commitments - protected savings - other reserved amounts.

**Daily safe-to-spend** = available flexible money / remaining spending days in the selected planning period.

This is a planning estimate, not a bank balance or guarantee. The UI must show which inputs are manual, estimated or connected.

Example:
- Available funds: ₦200,000
- Bills still due: ₦50,000
- Savings commitment: ₦30,000
- Flexible money: ₦120,000
- Days remaining: 20
- Indicative daily amount: ₦6,000

Users should be able to choose:
- A fixed daily cap.
- A category budget.
- A weekly allowance.
- A monthly flexible-spend pool.
- A custom period.

Do not silently roll unused daily allowance forward or erase overspending. Make rollover a visible user choice. A suggested default is to allow unused funds to remain in the period's flexible pool, while showing the daily guide recalculated from the remaining balance and days.

## 7. Go-to-market plan

### Phase 0: Problem discovery (2–3 weeks)

- Interview 15–25 people in the primary segment.
- Ask how they currently plan, record and review spending.
- Ask for examples of the last time they overspent and what caused it.
- Test willingness to log expenses manually.
- Ask what would make them trust or reject a finance app.
- Show a clickable prototype only after discussing current behaviour.
- Recruit a small group for a follow-up test.

Do not lead interviews with “Would you use my app?” Ask about actual past behaviour.

### Phase 1: Closed MVP pilot (4–6 weeks)

Recruit 30–50 testers from the target segment. Use a waitlist, personal networks, professional communities and relevant Nigerian online communities. Avoid paid ads until activation and retention are understood.

Measure:
- Onboarding completion.
- First budget created.
- First expense recorded.
- Percentage of active users recording at least three expenses per week.
- Weekly return rate.
- Budget review completion.
- User-reported usefulness of the daily allowance.
- Reasons users stop recording.

### Phase 2: Public beta

- Publish a clear landing page and product demo.
- Use short educational content about salary planning and daily spending.
- Share real product walkthroughs, not unsupported savings claims.
- Build referral prompts around inviting an accountability partner, only if users ask for it.
- Work with small creators who discuss personal finance, with clear sponsorship disclosure.
- Gather testimonials with explicit consent.

### Phase 3: Growth experiments

Test one channel at a time:
- Short-form video demos.
- Search content: salary budgeting, daily allowance planning, expense tracking.
- Community partnerships.
- Referral incentives that do not encourage spam.
- Employer or campus financial-wellness pilots.

### Messaging experiments

A. “Make your salary last until payday.”  
B. “Know what you can safely spend today.”  
C. “Stop guessing where your money went.”  
D. “A spending plan you can actually stick to.”

Test which message earns sign-ups and sustained use, not just likes.

## 8. Business model hypotheses

Do not charge before the product has clear repeat value.

Potential model:
- **Free:** Manual income and expense logging, one active monthly plan, basic daily safe-to-spend and simple reports.
- **Plus:** Multiple plans, custom periods, advanced reports, recurring rules, exports, shared plans and richer reminders.
- **Future partnerships:** Employer financial-wellness packages or compliant integrations, subject to user demand and legal review.

Avoid monetising through sale of personal financial data. Be transparent about any future referral or partner revenue.

## 9. Risks and responses

| Risk | Response |
|---|---|
| Strong existing competitors | Validate a specific unmet need and differentiate on daily decision support and usability |
| Manual entry fatigue | Fast add flow, defaults, templates and later optional account imports |
| Incorrect safe-to-spend figure | Show assumptions, last-updated time and manual/connected status |
| Users treat estimates as guaranteed balances | Clear wording and disclaimers |
| Sensitive financial data exposure | Minimise data, encrypt it, restrict access and test security |
| Regulatory scope expands | Keep MVP non-custodial; get Nigerian legal advice before money movement or account access |
| Low retention | Build a useful daily loop and weekly review; measure actual repeat use |
| Irregular income | Support income events and flexible planning periods |

## 10. Validation questions and go/no-go criteria

Proceed to a wider beta only if discovery shows:
- The problem happens often enough to matter.
- Users already use workarounds, even if they are spreadsheets, notes or mental calculations.
- Users can explain why current tools do not solve the problem.
- A meaningful share can complete manual expense entry during a one-week test.
- The safe-to-spend view changes a real spending decision.
- Users return without repeated founder prompting.

Suggested early evidence targets (working thresholds, not industry benchmarks):
- At least 15 interviews completed.
- At least 10 interviewees describe a recent, concrete spending-control problem.
- At least 20 pilot users complete onboarding.
- At least 50% of activated pilot users return in week two.
- At least 40% of activated users record expenses on three or more days in a week.

If the product gets sign-ups but users do not record spending or return, fix the core loop before spending on acquisition.

## 11. Research sources and caveats

Primary product and market references:
- PreSpend official product site and company page: https://useprespend.com/ and https://useprespend.com/company
- PreSpend Google Play listing (wallets, daily limits and waiting periods): https://play.google.com/store/apps/details?id=com.useprespend.app
- EFInA A2F 2026 report: https://a2f.ng/a2f-2026-report/
- EFInA research archive: https://efina.org.ng/research/
- Nigeria Data Protection Commission, Nigeria Data Protection Act 2023: https://ndpc.gov.ng/ndp-act-2023/
- Central Bank of Nigeria payment service provider categories: https://www.cbn.gov.ng/PaymentsSystem/PSPs.html
- PiggyVest SafeLock: https://www.piggyvest.com/safelock
- PiggyVest: https://www.piggyvest.com/
- Cowrywise: https://cowrywise.com/
- Spendee: https://www.spendee.com/
- YNAB: https://www.ynab.com/
- BudgetBakers: https://budgetbakers.com/
- EFInA: https://efina.org.ng/

This document is a first-pass market map, not a commissioned market-size report. It does not claim a verified TAM/SAM/SOM, competitor revenue, market share or user count. Those figures require current, reliable data and a defined market scope.

## 12. Recommended next actions

1. Interview 15–25 target users.
2. Run a competitor walkthrough of PreSpend and two expense/budget products.
3. Prototype onboarding, plan creation, today's allowance, quick expense entry and weekly review.
4. Test the prototype with 5–8 users.
5. Freeze the MVP scope in the PRD only after these tests.
6. Build the non-custodial MVP and run a closed pilot.

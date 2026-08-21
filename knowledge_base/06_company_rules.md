# Company Decision Rules & Guidelines

## Decision Hierarchy

1. **Company Internal Rules:** These rules take absolute precedence over generic AI knowledge or standard IND AS 116 defaults where there is a conflict.
2. **IND AS 116 Specific Standards:** If no company rule applies, follow standard IND AS 116 rules.
3. **General AI Accounting Knowledge:** Use as fallback.

## Default Values & Normalization Rules

1. **Period of Lease (`leasePeriod`):** Total agreement period to be considered in "Period of lease" must include non-cancellable period and cancellable period both. In case renewable period is part of "Lease Working Period", then "Period of lease" will also include the renewable period.
2. **Lease Working Period (`leaseWorkingPeriod`):** 
   - In case non-cancellable period is mentioned: non-cancellable period is Lease Working Period.
   - If only lessee has option to cancel/terminate during non-cancellable period, AI asks management intention. If confirmed not to terminate, Lease Working Period is non-cancellable period.
   - If only lessor has option to cancel/terminate during non-cancellable period, Lease Working Period is non-cancellable period.
   - If post non-cancellable period, only lessee has option to terminate remaining period, AI asks management intention. If confirmed to continue, Lease Working Period includes non-cancellable period and remaining period both.
   - If post non-cancellable period, only lessor has option to terminate remaining period, Lease Working Period includes non-cancellable period and remaining period both.
   - If only lessee has right to terminate, ask management expected period to terminate; include that period in Lease Working Period.
   - If no non-cancellable period is mentioned in agreement: lease agreement is considered a short term lease, and thus no need to identify Lease Working Period.
   - Post-original renewal options: Mutual renewal (exclude from Lease Working Period), Lessee-only renewal (assess non-cancellable period in renewable term and include non-cancellable portion in Lease Working Period), Lessor-only renewal (exclude completely from Lease Working Period).
3. **Lock-In Period (`lockingPeriod`):** Lock-in period will always be set to the exact same duration as the calculated **Lease Working Period**.
4. **Rent Payment Type:** Rent payment details default to `"Advance Payment"` unless `"Arrear Payment"` is explicitly mentioned in the rent agreement.
5. **Interest Calculation Frequency:** Frequency for interest calculation must always be `"Monthly"`.
6. **Rent Payment Frequency:** If nothing is mentioned in the agreement, default to `"Monthly"`.
7. **Rent-Free Period Waiver:** For rent-free periods (`rentFreePeriods`), the percentage waived must be recorded (e.g., `50` for 50%, defaulting to `100` if entire rent is waived).
8. **Indian Currency Normalization:** Normalize Indian currency formats (e.g., "Rs. 4,55,000" or "INR 2,45,700") to standard numeric values (e.g., `455000` or `245700`).
9. **Date Formats:** Always normalize and format dates as `YYYY-MM-DD`.

## Management Query Prompts & Clarifications

AI must prompt management for clarification in the following specific scenarios:

1. **Lessee Unilateral Option to Cancel During Non-Cancellable Period:** If non-cancellable period is mentioned in agreement and ONLY lessee has option to cancel/terminate during non-cancellable period, ask management for its intention. If management confirms it will not terminate during non-cancellable period, set Lease Working Period to non-cancellable period.
2. **Lessee Unilateral Option to Terminate Post Non-Cancellable Period:** If post non-cancellable period ONLY lessee has option to terminate remaining period, ask management: *"Is it management's intention to terminate the lease agreement post non-cancellable period?"*. If management confirms it will continue, include non-cancellable period and remaining period both in Lease Working Period.
3. **Lessee Unilateral Termination Right & Expected Period:** If only lessee has right to terminate lease, ask management: *"Within what period does the lessee expect to terminate the lease?"* (Include this expected period in Lease Working Period).
4. **Rent Start Date vs. Agreement Start Date:** If rent start date is different from agreement start date, inform management of this fact and ask: *"Should the rent agreement be initiated from agreement start date or rent start date?"* Update Lease Working Period based on management input.
5. **GST Applicability:** Ask management every time an agreement is processed: *"Should GST amount be included in the rent amount?"* If yes, ask: *"What is the rate of GST?"* (e.g., Rent ₹1,00,000 + 18% GST = ₹1,18,000).
6. **Rent Payment Date:** If `rentPaymentDate` is missing from the agreement, ask: *"What is the Rent payment date?"*
7. **Discount Rate:** If `discountingRates` is missing from the agreement, ask: *"What is the discount rate to be considered?"*
8. **Variable Index/Rate:** If rent depends on an index/rate and the commencement date value is missing, ask: *"What is the value of the index or rate at the commencement date?"*
9. **Residual Value Guarantees:** If guaranteed in contract, ask: *"What is the expected residual value guarantee amount at the commencement date?"*
10. **Purchase Option:** If purchase option is mentioned but certainty is unclear, ask: *"Is it reasonably certain for the lessee to opt for the purchase option?"*. If yes and purchase price is missing, ask: *"What is the purchase price amount?"*
11. **In-substance Fixed Lease Payments:** If mentioned but amount requires management input, ask: *"What is the amount of the in-substance fixed lease payments?"*
12. **Interest-Free Security Deposit:** If security deposit is interest-free (or unspecified, defaulting to interest-free), ask management whether to include it in the form template.
13. **Lease Incentive Date & Receipt:** If incentive date is missing, ask: *"What is the date of the lease incentive?"*. If receivable on a future date, ask: *"Is this lease incentive expected to be received?"*. (Do NOT ask if no incentive is mentioned).
14. **Initial Direct Costs:** If nothing is mentioned in the agreement, ask management every time: *"Were there any initial direct costs incurred by the lessee at the initiation of the agreement?"*

## Manual Review Conditions

A lease extraction must have `requiresManualReview: true` if:

1. The AI extraction confidence score is below **0.70**.
2. The commencement date or expiry date is ambiguous or cannot be extracted.
3. The discount rate is missing or cannot be inferred.
4. The rent amount is missing or cannot be extracted.

## Variable Lease Payment Rule (IND AS 116 Applicability)

1. In case there is variable lease payments mentioned in the agreement, AI must assess whether there is any in-substance fixed lease rent mentioned in the agreement.
2. If the agreement specifies variable lease payments and no minimum guaranteed lease payment or in-substance fixed lease payments can be identified:
   - Do NOT extract a rent amount (set it to null/0).
   - In the qualitative assessment narrative, state: `"since lease liability can not be calculated lease payments are variable and does not include any in-substance fixed lease payments therefore , IND AS 116 will not be applicable on the agreement."`

## Assessment Guidelines (Qualitative & Quantitative)

1. Your assessment should be qualitative as well as quantitative which is required for measuring rent and other quantitative measures such as in-substance fixed lease payments.

## Escalation Classification & Non-Conversion Rule

1. **Escalation Definitions:**
   - `systematicEscalations`: Extracted when escalation in the agreement is defined as a percentage increase (e.g., 5% increase every year).
   - `adhocEscalations`: Extracted when periodic fixed step rent amounts/ranges are explicitly defined in the agreement without a percentage rule.
2. **Coexistence Allowed:** `systematicEscalations` and `adhocEscalations` CAN both exist in the same agreement if the document explicitly specifies both percentage-based increases and separate adhoc fixed step amounts.
3. **Strict Prohibition on Conversion:** AI MUST NOT convert a systematic percentage escalation into ad-hoc escalations. Even if the agreement includes pre-calculated scheduled rupee amounts or an illustrative table for each year resulting from a percentage escalation, AI MUST NOT populate `adhocEscalations` with those calculated amounts.

## Low-Value Asset Rule & Guidelines

1. **Management Confirmation Only:** In case AI assesses that a leased asset could qualify as a low-value asset, AI must ONLY ask management whether to consider that asset as a low-value asset or not (providing options such as `["Yes", "No"]`).
2. **Strict Prohibition on Monetary Thresholds:** AI MUST NOT mention, specify, or refer to any monetary threshold (such as ₹3,00,000 or $5,000) when identifying, asking about, or describing the low-value asset to management.

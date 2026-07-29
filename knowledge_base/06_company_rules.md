# Company Decision Rules & Guidelines

## Decision Hierarchy

1. **Company Internal Rules:** These rules take absolute precedence over generic AI knowledge or standard IND AS 116 defaults where there is a conflict.
2. **IND AS 116 Specific Standards:** If no company rule applies, follow standard IND AS 116 rules.
3. **General AI Accounting Knowledge:** Use as fallback.

## Default Values & Normalization Rules

1. **Working and Locking Periods:** If `leaseWorkingPeriod` or `lockingPeriod` are not explicitly stated in the document, they must default to the exact same dates as `leasePeriod`. If a renewable period is part of the `leaseWorkingPeriod`, then `leasePeriod` will also include the renewable period.
2. **Lock-In Period:** Lock-in period must always be set to the exact same duration as the calculated `leaseWorkingPeriod`.
3. **Rent Payment Type:** Rent payment details default to `"Advance Payment"` unless `"Arrear Payment"` is explicitly mentioned in the rent agreement.
4. **Interest Calculation Frequency:** Frequency for interest calculation must always be `"Monthly"`.
5. **Rent Payment Frequency:** If nothing is mentioned in the agreement, default to `"Monthly"`.
6. **Rent-Free Period Waiver:** For rent-free periods (`rentFreePeriods`), the percentage waived must be recorded (e.g., `50` for 50%, defaulting to `100` if entire rent is waived).
7. **Indian Currency Normalization:** Normalize Indian currency formats (e.g., "Rs. 4,55,000" or "INR 2,45,700") to standard numeric values (e.g., `455000` or `245700`).
8. **Date Formats:** Always normalize and format dates as `YYYY-MM-DD`.

## Management Query Prompts & Clarifications

AI must prompt management for clarification in the following specific scenarios:

1. **Lessee Unilateral Termination Right:** If only the lessee has the right to terminate the lease, ask: *"Within what period does the lessee expect to terminate the lease?"*
2. **GST Applicability:** Ask management every time an agreement is processed: *"Should GST amount be included in the rent amount?"* If yes, ask: *"What is the rate of GST?"* (e.g., Rent ₹1,00,000 + 18% GST = ₹1,18,000).
3. **Rent Payment Date:** If `rentPaymentDate` is missing from the agreement, ask: *"What is the Rent payment date?"*
4. **Discount Rate:** If `discountingRates` is missing from the agreement, ask: *"What is the discount rate to be considered?"*
5. **Variable Index/Rate:** If rent depends on an index/rate and the commencement date value is missing, ask: *"What is the value of the index or rate at the commencement date?"*
6. **Residual Value Guarantees:** If guaranteed in contract, ask: *"What is the expected residual value guarantee amount at the commencement date?"*
7. **Purchase Option:** If purchase option is mentioned but certainty is unclear, ask: *"Is it reasonably certain for the lessee to opt for the purchase option?"*. If yes and purchase price is missing, ask: *"What is the purchase price amount?"*
8. **In-substance Fixed Lease Payments:** If mentioned but amount requires management input, ask: *"What is the amount of the in-substance fixed lease payments?"*
9. **Interest-Free Security Deposit:** If security deposit is interest-free (or unspecified, defaulting to interest-free), ask management whether to include it in the form template.
10. **Lease Incentive Date & Receipt:** If incentive date is missing, ask: *"What is the date of the lease incentive?"*. If receivable on a future date, ask: *"Is this lease incentive expected to be received?"*. (Do NOT ask if no incentive is mentioned).
11. **Initial Direct Costs:** If nothing is mentioned in the agreement, ask management every time: *"Were there any initial direct costs incurred by the lessee at the initiation of the agreement?"*

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

## Low-Value Asset Rule & Guidelines

1. **Management Confirmation Only:** In case AI assesses that a leased asset could qualify as a low-value asset, AI must ONLY ask management whether to consider that asset as a low-value asset or not (providing options such as `["Yes", "No"]`).
2. **Strict Prohibition on Monetary Thresholds:** AI MUST NOT mention, specify, or refer to any monetary threshold (such as ₹3,00,000 or $5,000) when identifying, asking about, or describing the low-value asset to management.

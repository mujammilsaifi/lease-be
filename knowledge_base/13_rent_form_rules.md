# Rent Form and Extraction Rules (Ind AS 116)

category: EXTRACTION_RULES
topic: Rent Form Field Mapping & Extraction Rules
subtopic: Regulatory Audit & Form Alignment
priority: 1
keywords: rent, period, gst, working period, lock-in, incentive, direct cost, purchase option, systematic escalation, adhoc escalation, rent free, discount rate, security deposit, rent payment date

## Assessment Scope (Qualitative & Quantitative)
1. Your assessment should be qualitative as well as quantitative which is required for measuring rent and other quantitative measures such as in-substance fixed lease payments.

## Period of Lease and Working Period (`leasePeriod` & `leaseWorkingPeriod`)
1. **Total Lease Period (`leasePeriod`):** The total agreement period to be considered in "Period of lease" must include both the non-cancellable period and the cancellable period. In case a renewable period is part of the "Lease Working Period", then the "Period of lease" will also include the renewable period.
2. **Lease Working Period (`leaseWorkingPeriod`) Determination:**
   - Include the non-cancellable period of the lease.
   - Include periods covered by an extension option if the lessee is reasonably certain to exercise it.
   - Include periods covered by a termination option if the lessee is reasonably certain NOT to exercise it.
   - **Enforceability Limit:** A lease is no longer enforceable when both the lessee and the lessor each have the unilateral right to terminate the lease without permission from the other party and with no more than an insignificant penalty.
   - **Lessee Unilateral Termination Right:** If only the lessee has the right to terminate the lease, it is treated as an option to terminate the lease. Under this condition, the tool/AI MUST ask management: *"Within what period does the lessee expect to terminate the lease?"*
   - **Lessor Unilateral Termination Right:** If only the lessor has the right to terminate, the non-cancellable period of the lease includes the entire period covered by the option to terminate.
3. **Lock-In Period (`lockingPeriod`):**
   - The lock-in period must be set to the exact same duration as the calculated **Lease Working Period**.

## Payment Details and Frequencies
1. **Rent Payment Type (`rentPaymentType`):**
   - Rent payment details should default to **"Advance Payment"** unless **"Arrear Payment"** is explicitly mentioned in the rent agreement.
2. **Interest Calculation Frequency (`frequencyForInterestCalculation`):**
   - Must always be set to **"Monthly"**.
3. **Rent Payment Frequency (`rentPaymentFrequency`):**
   - Must be as specified in the agreement (`Monthly`, `Quarterly`, `Semi-Annual`, `Yearly`). If nothing is specified in the agreement, default to **"Monthly"**.

## Rent Amount Components & Clarifications (`rentAmount`)
1. **Rent Amount Calculations:**
   - Include the base rent amount as mentioned in the agreement. If any lease incentive is given in the agreement, deduct that lease incentive from the Right of Use (ROU) Asset (`rouAdjustments`).
   - **Variable Index/Rate Payments:** Variable lease payments depending on an index or rate must be initially measured using the index or rate as at the commencement date. If the value of that index or rate at the commencement date is NOT specified in the agreement, the tool/AI MUST ask management: *"What is the value of the index or rate at the commencement date?"*
   - **Residual Value Guarantees:** If residual value guarantees are specified in the agreement, the tool/AI MUST ask management: *"What is the expected residual value guarantee amount at the commencement date?"*
   - **Purchase Options (`otherLeaseInformations.purchaseOption`):** If a purchase option is mentioned in the agreement but certainty is not specified, ask management: *"Is it reasonably certain for the lessee to opt for the purchase option?"*. If the answer is "Yes" and the purchase price is missing from the contract, ask management: *"What is the purchase price amount?"*
   - **Termination Penalties:** Include payments of penalties for terminating the lease if the lease term reflects the lessee exercising an option to terminate.
   - **In-substance Fixed Payments:** These are payments that contain variability in form but are unavoidable in substance. In case in-substance fixed lease payments are mentioned in the agreement but management inputs are required to identify the amount, ask management: *"What is the amount of the in-substance fixed lease payments?"*

## GST Applicability on Rent
1. **GST Calculation Rule:**
   - Ask management **every time** an agreement is processed: *"Should GST amount be included in the rent amount?"*
   - If management confirms GST should be included, ask: *"What is the rate of GST?"*
   - **Example:** If rent as per agreement is ₹1,00,000 and management confirms GST is to be considered at 18%, the tool/AI should set the total rent amount as **₹1,18,000**.

## Rent Payment Date (`rentPaymentDate`)
1. **Rent Payment Date Rule:**
   - Rent payment date will be as mentioned in the agreement (e.g. day `1` to `31` or `'endOfPeriod'`).
   - In case nothing is mentioned in the agreement, the tool/AI MUST ask management: *"What is the Rent payment date?"*

## Rent-Free Periods (`rentFreePeriods`)
1. **Form Entry & Percentage Rules:**
   - If a rent-free period is mentioned in the agreement, fill it out under the **"Rent-Free Periods"** (`rentFreePeriods`) caption.
   - In this section, along with the date range (`dateRange`), the percentage of rent waived (`percentage`) is also required to be filled.
   - **Example:** If 50% rent is free from 1 April 2025 to 30 June 2025, enter `50` in the percentage field.
   - **Multiple Periods:** In case there are multiple rent-free periods mentioned in the agreement, all periods should be added by adding new rows (`Add New`).

## Systematic Escalation (`systematicEscalations`)
1. **Applicability:** Use when escalation in the agreement is given as a percentage increase (e.g., 5% increase every year, or 5% in first year and 10% in second year).
2. **Form Fields:**
   - `dateRange` (Select Date): The date from which escalation initiates.
   - `frequency`: Options: `Monthly`, `Quarterly`, `Semi-Annual`, `Yearly`.
   - `percentage` (% Increase): Percentage of escalation (e.g., enter `10` for 10%).
3. **Examples:**
   - **Example 1:**
     - Lease working period: 1 April 2025 to 31 March 2028
     - Escalation in agreement: 5% increase every year
     - Entry: Date = `1 April 2026`, Frequency = `Yearly`, % Increase = `5`
   - **Example 2:**
     - Lease working period: 1 April 2025 to 31 March 2030
     - Escalation in agreement: 5% increase for 2 years, 10% increase for remaining 2 years
     - Entry:
       - Row 1: Date = `1 April 2026`, Frequency = `Yearly`, % Increase = `5`
       - Row 2: Date = `1 April 2027`, Frequency = `Yearly`, % Increase = `5`
       - Row 3: Date = `1 April 2028`, Frequency = `Yearly`, % Increase = `10`
       - Row 4: Date = `1 April 2029`, Frequency = `Yearly`, % Increase = `10`

## Adhoc Escalation (`adhocEscalations`)
1. **Applicability:** Use when periodic fixed rent amounts are mentioned in the agreement instead of a percentage escalation.
2. **Form Fields:**
   - `dateRange`: Start Date and End Date for the specific rental step.
   - `frequency`: Frequency of payment.
   - `amount`: Fixed rental amount for that period.
3. **Frequency Inheritance Rule:**
   - In the `frequency` column of Adhoc Escalation, the AI MUST take the input filled in **"Frequency of Rent Payment"** (`rentPaymentFrequency`). For example, if rent payment frequency is "Monthly", select "Monthly".
4. **Example:**
   - Lease working period: 1 April 2025 to 31 March 2030
   - Rent: ₹1,00,000 monthly
   - Escalation in agreement: 2nd year ₹1,10,000, 3rd year ₹1,20,000, 4th year ₹1,30,000, 5th year ₹1,40,000
   - Entry:
     - Row 1: Start Date = `1 April 2026`, End Date = `31 March 2027`, Frequency = `Monthly`, Amount = `1,10,000`
     - Row 2: Start Date = `1 April 2027`, End Date = `31 March 2028`, Frequency = `Monthly`, Amount = `1,20,000`
     - Row 3: Start Date = `1 April 2028`, End Date = `31 March 2029`, Frequency = `Monthly`, Amount = `1,30,000`
     - Row 4: Start Date = `1 April 2029`, End Date = `31 March 2030`, Frequency = `Monthly`, Amount = `1,40,000`

## Discount Rate (`discountingRates`)
1. **Discount Rate Rule:**
   - Discount rate to be taken as mentioned in the agreement (`dateRange`, `rate`).
   - If nothing is mentioned in the agreement, the tool/AI MUST ask management for the discount rate.

## Security Deposit (`securityDeposit`)
1. **Interest-Free Confirmation Rules:**
   - In case security deposit is mentioned in the agreement and specified as interest-free: AI will ask management whether to include the security deposit in the form template. If management confirms, AI will include the security deposit amount.
   - In case whether security deposit is interest-free is NOT mentioned in the agreement: AI will consider the security deposit as interest-free and accordingly ask management to confirm if the same should be considered in the form.

## ROU Adjustments (`rouAdjustments`)
1. **Lease Incentives (Negative Balance):**
   - Negative balance will come in case of any lease incentive received/receivable as per agreement. Date (`adjustmentDate`) should be as per agreement.
   - In case lease incentive is mentioned in the agreement but date is not mentioned, the tool/AI MUST ask management: *"What is the date of the lease incentive?"*
   - In case lease incentive is receivable on a certain date, confirm with management: *"Is this lease incentive expected to be received?"*
   - **Strict Restriction:** If nothing is mentioned in the agreement about lease incentives, do NOT ask management for lease incentives or date of lease incentive.
2. **Initial Direct Costs (Positive Balance):**
   - Positive balance will come for the amount of any initial direct costs incurred by the lessee as per agreement or as communicated by management.
   - If nothing is mentioned in the agreement, the tool/AI MUST ask management **every time** an agreement is shared: *"Were there any initial direct costs incurred by the lessee at the initiation of the agreement?"*

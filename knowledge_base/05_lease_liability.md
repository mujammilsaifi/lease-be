# Lease Liability Calculations

## Present Value Formula
At the commencement date, a lessee shall measure the lease liability at the present value of the lease payments that are not paid at that date.
The present value (PV) is calculated using the discount rate (r) and the payments (P_t) at each period (t):

$$	ext{Lease Liability} = \sum_{t=1}^{N} rac{	ext{Payment}_t}{(1 + r)^t}$$

Where:
- $P_t$: Lease payment in period $t$
- $r$: Periodic discount rate (annual rate divided by number of periods per year)
- $t$: Period number (1, 2, ..., N)
- $N$: Total number of rent payment periods over the lease term

## Included Payments
Lease payments include:
1. **Fixed payments** (including in-substance fixed payments), less any lease incentives receivable.
2. **Variable lease payments** that depend on an index or a rate, initially measured using the index or rate as at the commencement date (e.g., systematic escalations).
3. **Amounts expected to be payable** by the lessee under residual value guarantees.
4. **Exercise price of a purchase option** if the lessee is reasonably certain to exercise that option.
5. **Payments of penalties for terminating the lease**, if the lease term reflects the lessee exercising an option to terminate the lease.

## Treatment of Security Deposits
- Refundable security deposits are NOT part of lease payments because they are expected to be returned at the end of the lease.
- However, security deposits are financial assets and should be recorded at fair value (present value of the refund amount discounted using the market rate), with the difference between the face value and present value treated as prepaid rent (added to the Right-of-Use Asset cost).

## Amortization Schedule
The lease liability is amortized over the lease term:
- **Opening Balance:** Liability at start of period.
- **Interest Expense:** Opening Balance × periodic discount rate.
- **Lease Payment:** Paid rent amount (reduces liability).
- **Closing Balance:** Opening Balance + Interest - Payment.

## Module 3: Lease Rental

category: LEASE_LIABILITY
topic: Lease Rental Components & Liability Calculation
subtopic: Included payments, RVG, purchase options, and in-substance fixed payments
priority: 1
keywords: lease rental, lease payments, fixed payments, variable payments, CPI, interest rate, MCLR, market rent, residual value guarantee, RVG, purchase option, bargain purchase, in-substance fixed payments, minimum guaranteed rent, usage-based rent, take or pay

### Step 1: Lease Payments
Under Ind AS 116 (Paragraph 27), at the commencement date, the lease payments included in the measurement of the lease liability comprise the following payments for the right to use the underlying asset during the lease term that are not paid at the commencement date:
- (a) fixed payments (including in-substance fixed payments as described in paragraph B42), less any lease incentives receivable;
- (b) variable lease payments that depend on an index or a rate, initially measured using the index or rate as at the commencement date (as described in paragraph 28);
- (c) amounts expected to be payable by the lessee under residual value guarantees;
- (d) the exercise price of a purchase option if the lessee is reasonably certain to exercise that option (assessed considering the factors described in paragraphs B37–B40); and
- (e) payments of penalties for terminating the lease, if the lease term reflects the lessee exercising an option to terminate the lease.

Variable lease payments that depend on an index or a rate include, for example, payments linked to a consumer price index (CPI), payments linked to a benchmark interest rate (such as LIBOR or MCLR) or payments that vary to reflect changes in market rental rates.

**Fixed Payments and Lease Incentives (Example 1)**
A company leases an office building for 5 years:
- Monthly rent: ₹1,00,000 payable at the end of each month.
- Lease incentive receivable from lessor: ₹2,00,000 (fit-out contribution).

**Analysis:**
The lease payments for liability calculation are the monthly rents of ₹1,00,000 payable for 60 months. The lease incentive of ₹2,00,000 is not deducted from the lease liability directly if it is received at or before commencement (instead it reduces the initial measurement of the Right-of-Use Asset under Paragraph 24). If it is a receivable after commencement, it reduces the lease payments.

| Particulars | Amount |
| :--- | :--- |
| Total fixed rent (₹1,00,000 × 60 months) | ₹60,00,000 |
| Less: Lease incentive receivable | (₹2,00,000) |
| **Lease payments considered** | **₹58,00,000** |

**Variable Payments Linked to CPI (Example 2)**
A warehouse lease provides:
- Year 1 rent: ₹10,00,000.
- Thereafter rent increases based on the Consumer Price Index (CPI).
- CPI at commencement is 200.

**Analysis:**
At commencement, the lessee measures the lease liability using the current CPI of 200. Future CPI increases are ignored initially. The lease liability is initially calculated based on the starting rent of ₹10,00,000 per year for all years. If CPI later increases, the lease liability will be remeasured at that future date.

| Year | Rent |
| :--- | :--- |
| 1 | ₹10,00,000 |
| 2 | ₹10,00,000 |
| 3 | ₹10,00,000 |
| 4 | ₹10,00,000 |
| 5 | ₹10,00,000 |

**Variable Payments Linked to Interest Rate (Example 3)**
A lease payment is linked to the Marginal Cost of Funds Based Lending Rate (MCLR):
- Annual lease rent: MCLR + 2%
- Current MCLR at commencement: 8%

**Analysis:**
At commencement, the annual rent is calculated using the initial rate of 10% (8% MCLR + 2%). The lease liability is measured based on this current rate. If MCLR later changes (e.g., becomes 9%), the lease liability is remeasured when the payment change takes effect.

**Variable Payments Based on Market Rent (Example 4)**
A lease agreement states:
- Rent will be revised every 3 years to prevailing market rental rates.
- Current market rent at commencement is ₹5,00,000 per month.

**Analysis:**
The lease liability is initially measured using ₹5,00,000 per month for all periods. Future market rent changes are ignored initially and considered only when the rent resets occur.

**Residual Value Guarantee (RVG) (Example 5)**
A company leases a machine on 1 April 2025:
- Lease term: 5 years.
- Annual lease rent: ₹10,00,000 payable at year-end.
- Incremental Borrowing Rate (IBR): 10%.
- Residual Value Guarantee (RVG) given by lessee: ₹4,00,000.
- Expected residual value at commencement: ₹3,50,000.

**Analysis:**
As per Paragraph 27(c), only the amount *expected to be payable* under the guarantee is included in the lease payments. 
Expected payment under RVG = Guaranteed amount (₹4,00,000) - Expected residual value (₹3,50,000) = ₹50,000.
This ₹50,000 is included as a cash outflow at the end of Year 5 for calculating the present value of the lease liability.

| Year | Lease Rent / Outflow |
| :--- | :--- |
| 1 | ₹10,00,000 |
| 2 | ₹10,00,000 |
| 3 | ₹10,00,000 |
| 4 | ₹10,00,000 |
| 5 | Rent: ₹10,00,000 + RVG Payment: ₹50,000 = ₹10,50,000 |
| **Total Cash Flows** | **₹50,50,000** |

**Purchase Option (Example 6)**
On 1 April 2025, Company A leases a machine:
- Lease term: 5 years.
- Annual lease rental: ₹10,00,000 payable at year-end.
- Purchase option at the end of Year 5: ₹1,00,000.
- Expected fair value of the machine at the end of Year 5: ₹8,00,000.
- Incremental Borrowing Rate (IBR): 10%.

**Analysis:**
At the end of Year 5, the lessee can buy an ₹8,00,000 asset for only ₹1,00,000. Since this is a bargain purchase option, the lessee is reasonably certain to exercise it. Thus, the purchase option price of ₹1,00,000 must be included as a cash outflow at the end of Year 5 in the lease liability calculation.

| Particulars | Amount |
| :--- | :--- |
| Purchase price under option | ₹1,00,000 |
| Expected market value at Year 5 | ₹8,00,000 |

### Step 2: Variable Lease Payments (In-Substance Fixed Payments)
Under Paragraph B42(c) of Ind AS 116, lease payments include in-substance fixed lease payments. In-substance fixed lease payments are payments that may, in form, contain variability but that, in substance, are unavoidable. In-substance fixed lease payments exist, for example, if there is more than one realistic set of payments that a lessee could make, but it must make at least one of those sets of payments. In this case, the entity considers the set of payments that aggregates to the lowest amount (on a discounted basis) to be lease payments.

**Higher of Fixed Amount or Sales-Based Rent (Example 1)**
A retail store lease requires payment of:
- ₹1,00,000 per month, OR
- 5% of monthly sales,
- Whichever is higher.

**Analysis:**
Although the rent has a variable sales component, the lessee cannot avoid paying the minimum ₹1,00,000 per month.
Unavoidable payment = ₹1,00,000 per month (in-substance fixed payment).
Lease liability must include the present value of ₹1,00,000 per month. Any additional sales-based variable rent is recognized in the P&L as an expense in the month it is incurred.

| Option | Amount |
| :--- | :--- |
| Unavoidable Fixed Minimum | ₹1,00,000 / month |
| Sales-based amount | Variable (not certain at commencement) |

**Minimum Guaranteed Rent (Example 2)**
A warehouse lease states:
- Rent = ₹50 per unit produced.
- Minimum annual payment = ₹5,00,000.

**Analysis:**
Even if production is zero, the lessee must pay at least ₹5,00,000. Therefore, ₹5,00,000 is an in-substance fixed payment.
Lease liability must include the present value of ₹5,00,000 per year. Additional variable rent based on actual production is recognized in the P&L when incurred.

**Usage-Based Rent with Minimum Commitment (Example 3)**
A photocopier lease requires:
- Rent = ₹2 per copy made.
- Minimum annual payment = ₹1,20,000.

**Analysis:**
The lessee cannot avoid paying ₹1,20,000 annually. Therefore, the lease liability must include the present value of ₹1,20,000 per year. Any payments for copies exceeding the minimum threshold are recognized in the P&L when incurred.

**"Take or Pay" Arrangement (Example 4)**
A storage facility lease requires:
- Rent = ₹1,000 per pallet stored.
- Minimum commitment = Payment for 500 pallets per month.

**Analysis:**
The lessee must pay for at least 500 pallets (i.e., ₹5,00,000 per month) even if fewer pallets are stored.
Unavoidable payment = ₹5,00,000 per month.
Lease liability must include the present value of ₹5,00,000 per month.

**Machinery Lease with Use/No-Use Monthly Rates (Example 5)**
Entity X (lessee) enters into a five-year lease for a machinery. The contract sets out the lease payments as follows:
- If Entity X uses the machinery within a given month, an amount of INR 20,000 accrues for that month.
- If Entity X does not use the machinery within a given month, an amount of INR 10,000 accrues for that month.
- Payments are made at the end of the year.

**Analysis:**
The lessee must evaluate if there is a realistic possibility that it may not use the machinery in some months. If it evaluates that it is possible, then a monthly payment of INR 10,000 is unavoidable. This unavoidable payment of INR 10,000 per month is an in-substance fixed payment and must be considered in measuring the lease liability. The variable portion (up to INR 10,000 extra per month of use) is expensed when incurred.


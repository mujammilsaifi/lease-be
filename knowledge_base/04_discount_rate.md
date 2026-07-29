# Discount Rate / Incremental Borrowing Rate (IBR)

category: DISCOUNT_RATE
topic: Rate of Interest & Incremental Borrowing Rate
priority: 1
keywords: discount rate, incremental borrowing rate, ibr, implicit rate, rate of interest, discountingRates

## Definition

Under IND AS 116, the lessee shall discount the lease payments using the interest rate implicit in the lease if that rate can be readily determined. If that rate cannot be readily determined, the lessee shall use the lessee’s incremental borrowing rate (IBR).

## Incremental Borrowing Rate (IBR)
The Incremental Borrowing Rate is the rate of interest that a lessee would have to pay to borrow over a similar term, and with a similar security, the funds necessary to obtain an asset of a similar value to the right-of-use asset in a similar economic environment.

## Key Considerations & Extraction Guidelines
1. **Agreement Extraction (`discountingRates`):** Discount rate should be extracted as specified in the agreement (with `dateRange` and `rate`).
2. **Missing Rate Rule:** If nothing is mentioned in the lease agreement regarding the discount rate, the tool/AI MUST ask management: *"What is the discount rate to be considered?"*
3. **Lease Term Match:** The discount rate must match the lease tenure (e.g., a 5-year lease should use a 5-year borrowing rate).
4. **Security & Asset Class:** The rate should reflect the collateral/security profile of the asset being leased.
5. **Economic Environment:** The rate should be currency-specific and location-specific (e.g., Indian Rupee borrowing rates for leases in India).
6. **Changes in Rate:** The discount rate is re-assessed only upon specific trigger events like lease modifications, changes in the lease term, or changes in purchase options.

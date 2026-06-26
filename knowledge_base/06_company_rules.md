# Company Decision Rules & Guidelines

## Decision Hierarchy
1. **Company Internal Rules:** These rules take absolute precedence over generic AI knowledge or standard IND AS 116 defaults where there is a conflict.
2. **IND AS 116 Specific Standards:** If no company rule applies, follow standard IND AS 116 rules.
3. **General AI Accounting Knowledge:** Use as fallback.

## Default Values & Normalization Rules
1. **Working and Locking Periods:** If `leaseWorkingPeriod` or `lockingPeriod` are not explicitly stated in the document, they must default to the exact same dates as `leasePeriod`.
2. **Rent-Free Period Waiver:** For rent-free periods, the percentage waived must default to 100% unless a partial waiver is explicitly specified.
3. **Indian Currency Normalization:** Normalize Indian currency formats (e.g., "Rs. 4,55,000" or "INR 2,45,700") to standard numeric values (e.g., `455000` or `245700`).
4. **Date Formats:** Always normalize and format dates as `YYYY-MM-DD`.

## Manual Review Conditions
A lease extraction must have `requiresManualReview: true` if:
1. The AI extraction confidence score is below **0.70**.
2. The commencement date or expiry date is ambiguous or cannot be extracted.
3. The discount rate is missing or cannot be inferred.
4. The rent amount is missing or cannot be extracted.

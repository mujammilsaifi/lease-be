# Real Extraction Examples

## Example 1: Office Lease (Building)
- **Input Text Snippet:** "The lease of Office No. 402 on the 4th floor of Building A is for a period of 5 years starting from 1st April 2025. Rent is Rs. 1,00,000 per month, payable in advance by the 5th of each month. A security deposit of Rs. 6,000,000 is paid."
- **Extracted JSON:**
```json
{
  "lessorName": "Owner of Building A",
  "natureOfLease": "Building",
  "leasePeriod": { "start": "2025-04-01", "end": "2030-03-31" },
  "rentPaymentType": "Advance Payment",
  "rentPaymentFrequency": "monthly",
  "rentAmount": 100000,
  "rentPaymentDate": 5,
  "securityDeposit": 6000000
}
```

## Example 2: Land Lease with Rent-Free Period
- **Input Text Snippet:** "This agreement between Landlord X and Tenant Y is for open plot Z. Effective 2025-01-01 for 3 years. Rent is Rs. 50,000 monthly, with first 3 months rent-free."
- **Extracted JSON:**
```json
{
  "lessorName": "Landlord X",
  "natureOfLease": "Leasehold land",
  "leasePeriod": { "start": "2025-01-01", "end": "2027-12-31" },
  "rentPaymentFrequency": "monthly",
  "rentAmount": 50000,
  "rentFreePeriods": [
    { "dateRange": ["2025-01-01", "2025-03-31"], "percentage": 100 }
  ]
}
```

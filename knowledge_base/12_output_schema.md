# JSON Output Schema Documentation

## Schema Fields Description
- `lessorName` (string | null): The lessor or landlord name.
- `natureOfLease` (string | null): Nature of lease, restricted to: `'Leasehold land'`, `'Building'`, `'Warehouse'`, `'Plant and Machinery'`, `'Vehicle'`, `'Office Equipments'`, `'Computer and Peripherals'`, `'Furniture and fixtures'`, `'Security Deposit'`, `'Other'`.
- `leasePeriod` (object): Start and end dates.
  - `start` (string YYYY-MM-DD)
  - `end` (string YYYY-MM-DD)
- `leaseWorkingPeriod` (object): Same structure as leasePeriod. If not specified, defaults to leasePeriod.
- `lockingPeriod` (object): Same structure as leasePeriod. If not specified, defaults to leaseWorkingPeriod.
- `rentPaymentType` (string | null): `'Advance Payment'` or `'Arrear Payment'`.
- `rentPaymentFrequency` (string | null): `'monthly'`, `'quarterly'`, `'semi-annual'`, `'annual'`.
- `rentAmount` (number): Rental amount per frequency.
- `rentPaymentDate` (number | string): Date of payment, e.g., `1` to `31` or `'endOfPeriod'`.
- `securityDeposit` (number): Security deposit amount.
- `discountingRates` (array): List of discount rates with range.
- `systematicEscalations` (array): Escalation percent with start date.
- `adhocEscalations` (array): Specific rent amounts per date range.
- `rentFreePeriods` (array): Rent-free waivers with date range and percentage.

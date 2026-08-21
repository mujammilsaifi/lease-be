# Data Extraction Logic & Rules

## Assessment & Measurement Guidelines
1. **Qualitative & Quantitative Assessment:** Your assessment should be qualitative as well as quantitative which is required for measuring rent and other quantitative measures such as in-substance fixed lease payments.

## Digital vs. OCR Extraction Heuristics
1. **Initial Pass:** Extract digital text using `pdf-parse`.
2. **Quality Heuristics:**
   - If total characters extracted < 1500, OR
   - If average characters per page < 500,
   - **Action:** Trigger OCR fallback (`tesseract.js`) to parse the document as a scanned PDF.

## Fields Extraction Logic
- **Lessor Name (`lessorName`):** Extract lessor / licensor / landlord / service provider names.
- **Nature of Lease (`natureOfLease`):** Classify the lease type into one of these exact categories:
  - `Leasehold land`: for open land, bare plot, or bare land.
  - `Building`: for office space, shop, warehouse floor, apartment, or flat.
  - `Warehouse`: for godowns, storage, or industrial sheds.
  - `Plant and Machinery`
  - `Vehicle`
  - `Office Equipments`
  - `Computer and Peripherals`
  - `Furniture and fixtures`
  - `Security Deposit`
  - `Other`
- **Lease Period (`leasePeriod`):** Total agreement period to be considered in "Period of lease" must include non-cancellable period and cancellable period both. If a renewable period is part of "Lease Working Period", then "Period of lease" will also include the renewable period.
- **Lease Working Period (`leaseWorkingPeriod`):** 
  - Non-cancellable period is Lease Working Period (where both lessee and lessor cannot cancel).
  - If only lessee has option to cancel/terminate during non-cancellable period, prompt management for intention; if confirmed not to terminate, set to non-cancellable period.
  - If only lessor has option to cancel/terminate during non-cancellable period, set to non-cancellable period.
  - If post non-cancellable period only lessee has option to terminate remaining period, prompt management intention; if confirmed to continue, include non-cancellable + remaining period both.
  - If post non-cancellable period only lessor has option to terminate remaining period, include non-cancellable + remaining period both.
  - If only lessee has right to terminate, prompt management for expected period within which lessee expects to terminate; include that period in Lease Working Period.
  - If no non-cancellable period is mentioned: treat agreement as a short-term lease (no need to identify Lease Working Period).
  - Renewal options: Mutual renewal (exclude from Lease Working Period), Lessee-only renewal (assess non-cancellable period in renewable term and include non-cancellable portion in Lease Working Period), Lessor-only renewal (exclude completely).
  - If rent start date is different from agreement start date, inform management and prompt whether agreement initiates from agreement start date or rent start date, updating Lease Working Period based on input.
- **Lock-in Period (`lockingPeriod`):** Must be exact same duration as `leaseWorkingPeriod`.
- **Rent Payment Details (`rentPaymentType`):** `'Advance Payment'` (default) or `'Arrear Payment'`.
- **Interest Calculation Frequency (`frequencyForInterestCalculation`):** Always `'Monthly'`.
- **Rent Payment Frequency (`rentPaymentFrequency`):** `'Monthly'`, `'Quarterly'`, `'Semi-Annual'`, `'Yearly'`. Default: `'Monthly'`.
- **Rent Amount (`rentAmount`):**
  - Standard monthly/yearly fee or subscription (adjusted for GST if management confirms).
  - For seat-based rentals, calculate the total rent (e.g. "35 seats x Rs. 7,020" = `245700`).
- **Rent Payment Date (`rentPaymentDate`):**
  - Day of month (e.g. 5th day = `5`). If end of month/period, return `'endOfPeriod'`.
  - If missing from agreement, ask management for the Rent payment date.
- **Discount Rate (`discountingRates`):** Extract rate and date range. If missing from agreement, ask management for the discount rate.
- **Security Deposit (`securityDeposit`):** Extract amount. If interest-free (or unspecified, defaulting to interest-free), ask management to confirm inclusion in form.
- **Rent Free Periods (`rentFreePeriods`):** Extract date range (`dateRange`) and percentage waived (`percentage`, e.g. `50`). If rent initiation date is after agreement start date, notify management and ask whether lease initiates from agreement start date or rent initiation date (updating `leaseWorkingPeriod` accordingly if chosen).
- **Systematic Escalations (`systematicEscalations`):** Extract initiation date (`dateRange`), frequency (`Monthly`, `Quarterly`, `Semi-Annual`, `Yearly`), and percentage (`percentage`).
- **Adhoc Escalations (`adhocEscalations`):** Extract date range (`dateRange`), frequency (inherits `rentPaymentFrequency`), and fixed amount (`amount`). **Non-Conversion Rule:** Do NOT populate `adhocEscalations` with calculated rupee amounts derived from a percentage escalation or from reference tables illustrating a systematic percentage increase. Both systematic and adhoc escalations can coexist only if the agreement explicitly specifies both types.
- **ROU Adjustments (`rouAdjustments`):** Extract adjustment date (`adjustmentDate`) and amount (`adjustmentAmount`: negative for lease incentives, positive for initial direct costs). If initial direct costs are unspecified in agreement, ask management if incurred; if "Yes", ask for amount and enter in `rouAdjustments` using the lease working initiation date.

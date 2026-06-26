# Data Extraction Logic & Rules

## Digital vs. OCR Extraction Heuristics
1. **Initial Pass:** Extract digital text using `pdf-parse`.
2. **Quality Heuristics:**
   - If total characters extracted < 1500, OR
   - If average characters per page < 500,
   - **Action:** Trigger OCR fallback (`tesseract.js`) to parse the document as a scanned PDF.

## Fields Extraction Logic
- **Lessor Name:** Extract lessor / licensor / landlord / service provider names.
- **Lessee Name:** Extract lessee / licensee / tenant / customer names.
- **Nature of Lease:** Classify the lease type into one of these exact categories:
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
- **Lease Period (Start/End):**
  - Start date is indicated by "Commencement Date", "effective from", "shall commence from", "valid from".
  - End date is indicated by "Valid till", "expires on", "valid up to", "ending on".
- **Rent Amount:**
  - Standard monthly/yearly fee or subscription.
  - For seat-based rentals, calculate the total rent (e.g. "35 seats x Rs. 7,020" = `245700`).
- **Rent Payment Date:**
  - Day of month (e.g. 5th day = `5`).
  - If end of month/period, return `'endOfPeriod'`.

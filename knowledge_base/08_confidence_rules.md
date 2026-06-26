# Confidence Calculation Rules

## Overview
Confidence is a score between 0.0 and 1.0 representing the accuracy of the extracted lease fields.

## Confidence Calculation Criteria
The extraction engine assesses confidence based on the availability and clarity of critical fields.
- **High Confidence (0.90 - 1.00):** All major fields (lessor, lease period, rent amount, discounting rate) are explicitly stated in the document without ambiguity.
- **Medium Confidence (0.70 - 0.89):** Most fields are found, but some are inferred (e.g., end date is calculated from a start date and duration, or lock-in period defaults to lease period).
- **Low Confidence (< 0.70):** Missing key dates, missing rent amount, or text is highly corrupted/unclear.
- **Action:** Any confidence score < 0.70 automatically sets `requiresManualReview = true` in the output schema.

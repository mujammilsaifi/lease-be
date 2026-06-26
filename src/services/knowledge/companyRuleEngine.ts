// Rule Engine that determines which files in the knowledge base are required based on classified intent categories
export function getRequiredFilesForIntents(categories: string[]): string[] {
  const fileSet = new Set<string>();
  
  // Company rules are included by default to govern overall decision structures
  fileSet.add("06_company_rules.md");

  for (const category of categories) {
    switch (category.toUpperCase()) {
      case "LEASE_IDENTIFICATION":
        fileSet.add("02_lease_identification.md");
        fileSet.add("09_common_mistakes.md");
        break;
      case "LEASE_TERM":
        fileSet.add("03_lease_term.md");
        break;
      case "COMMENCEMENT_DATE":
        fileSet.add("03_lease_term.md");
        fileSet.add("07_extraction_rules.md");
        break;
      case "DISCOUNT_RATE":
        fileSet.add("04_discount_rate.md");
        break;
      case "LEASE_LIABILITY":
        fileSet.add("05_lease_liability.md");
        fileSet.add("09_common_mistakes.md");
        break;
      case "LEASE_MODIFICATION":
        fileSet.add("04_discount_rate.md");
        fileSet.add("05_lease_liability.md");
        break;
      case "EXTRACTION_RULES":
        fileSet.add("07_extraction_rules.md");
        break;
      case "VALIDATION":
        fileSet.add("08_confidence_rules.md");
        fileSet.add("12_output_schema.md");
        break;
      case "API_BEHAVIOUR":
        fileSet.add("11_api_behaviour.md");
        break;
      case "COMMON_MISTAKES":
        fileSet.add("09_common_mistakes.md");
        break;
      case "REAL_EXAMPLES":
        fileSet.add("10_real_examples.md");
        break;
    }
  }

  return Array.from(fileSet);
}

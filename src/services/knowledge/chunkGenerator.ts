import path from "path";

export interface RichChunk {
  documentName: string;
  module?: string;
  topic?: string;
  subTopic?: string;
  sectionTitle: string;
  content: string;
  examples: string[];
  decisionRules?: string;
  accountingStandard: string;
  keywords: string[];
  priority: number;
  source: string;
  category: string;
}

// Parses markdown files into structured knowledge chunks
export function generateRichChunks(fileName: string, text: string): RichChunk[] {
  const documentName = path.basename(fileName);
  const lines = text.split("\n");
  const chunks: RichChunk[] = [];
  
  let activeSectionTitle = documentName.replace(".md", "");
  let activeLines: string[] = [];
  
  const pushActiveChunk = () => {
    if (activeLines.length === 0) return;
    
    const sectionText = activeLines.join("\n").trim();
    if (!sectionText) return;
    
    // Default categories based on the file name prefix
    let category = "OTHER";
    if (documentName.includes("01_ind_as_116")) category = "IND_AS_116";
    else if (documentName.includes("02_lease_identification")) category = "LEASE_IDENTIFICATION";
    else if (documentName.includes("03_lease_term")) category = "LEASE_TERM";
    else if (documentName.includes("04_discount_rate")) category = "DISCOUNT_RATE";
    else if (documentName.includes("05_lease_liability")) category = "LEASE_LIABILITY";
    else if (documentName.includes("06_company_rules")) category = "COMPANY_RULES";
    else if (documentName.includes("07_extraction_rules")) category = "EXTRACTION_RULES";
    else if (documentName.includes("08_confidence_rules")) category = "CONFIDENCE_RULES";
    else if (documentName.includes("09_common_mistakes")) category = "COMMON_MISTAKES";
    else if (documentName.includes("10_real_examples")) category = "REAL_EXAMPLES";
    else if (documentName.includes("11_api_behaviour")) category = "API_BEHAVIOUR";
    else if (documentName.includes("12_output_schema")) category = "OUTPUT_SCHEMA";
    
    let topic = activeSectionTitle;
    let subTopic = "";
    let priority = 3;
    let keywords: string[] = [];
    let accountingStandard = "IND AS 116";
    let moduleText = "";
    
    const rawLines = sectionText.split("\n");
    const contentLines: string[] = [];
    const exampleBlocks: string[] = [];
    const decisionRuleLines: string[] = [];
    
    let currentMode: "content" | "examples" | "decision_rules" = "content";
    
    for (const rLine of rawLines) {
      const trimmed = rLine.trim();
      
      // Match annotations
      if (trimmed.toLowerCase().startsWith("category:")) {
        category = trimmed.substring(9).trim().toUpperCase();
        continue;
      }
      if (trimmed.toLowerCase().startsWith("topic:")) {
        topic = trimmed.substring(6).trim();
        continue;
      }
      if (trimmed.toLowerCase().startsWith("subtopic:")) {
        subTopic = trimmed.substring(9).trim();
        continue;
      }
      if (trimmed.toLowerCase().startsWith("priority:")) {
        priority = parseInt(trimmed.substring(9).trim(), 10) || 3;
        continue;
      }
      if (trimmed.toLowerCase().startsWith("keywords:")) {
        keywords = trimmed
          .substring(9)
          .split(",")
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean);
        continue;
      }
      if (trimmed.toLowerCase().startsWith("standard:")) {
        accountingStandard = trimmed.substring(9).trim();
        continue;
      }
      if (trimmed.toLowerCase().startsWith("module:")) {
        moduleText = trimmed.substring(7).trim();
        continue;
      }
      
      // Match block changes
      if (trimmed.startsWith("###") && trimmed.toLowerCase().includes("example")) {
        currentMode = "examples";
        continue;
      }
      if (
        trimmed.startsWith("###") &&
        (trimmed.toLowerCase().includes("decision rule") || trimmed.toLowerCase().includes("rule"))
      ) {
        currentMode = "decision_rules";
        continue;
      }
      if (trimmed.startsWith("##") && currentMode !== "content") {
        currentMode = "content";
      }
      
      if (currentMode === "examples") {
        exampleBlocks.push(rLine);
      } else if (currentMode === "decision_rules") {
        decisionRuleLines.push(rLine);
      } else {
        contentLines.push(rLine);
      }
    }
    
    // Extract separate examples from block
    const parsedExamples: string[] = [];
    let currentExample: string[] = [];
    for (const eLine of exampleBlocks) {
      const trimmedELine = eLine.trim();
      if (
        trimmedELine.startsWith("-") ||
        trimmedELine.startsWith("*") ||
        trimmedELine.startsWith("Example") ||
        trimmedELine.startsWith("Scenario")
      ) {
        if (currentExample.length > 0) {
          parsedExamples.push(currentExample.join("\n").trim());
          currentExample = [];
        }
      }
      currentExample.push(eLine);
    }
    if (currentExample.length > 0) {
      parsedExamples.push(currentExample.join("\n").trim());
    }
    
    chunks.push({
      documentName,
      module: moduleText || undefined,
      topic,
      subTopic: subTopic || undefined,
      sectionTitle: activeSectionTitle,
      content: contentLines.join("\n").trim(),
      examples: parsedExamples.filter(Boolean),
      decisionRules: decisionRuleLines.join("\n").trim() || undefined,
      accountingStandard,
      keywords,
      priority,
      source: "docx",
      category,
    });
  };
  
  for (const line of lines) {
    if (line.startsWith("## ") || line.startsWith("# ")) {
      pushActiveChunk();
      activeSectionTitle = line.replace(/^#+\s+/, "").trim();
      activeLines = [line];
    } else {
      activeLines.push(line);
    }
  }
  
  pushActiveChunk();
  return chunks;
}

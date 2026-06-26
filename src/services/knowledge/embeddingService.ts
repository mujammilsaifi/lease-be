import { GoogleGenAI } from "@google/genai";

// Retrieves embedding vector from Gemini embedding-2 model
export async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  if (!text || !text.trim()) {
    throw new Error("Text content for embedding is empty");
  }
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.embedContent({
    model: "gemini-embedding-2",
    contents: text,
  });
  const vector = response.embeddings?.[0]?.values;
  if (!vector || vector.length === 0) {
    throw new Error("Failed to generate embedding vector");
  }
  return vector;
}

// Retrieves multiple embedding vectors sequentially or in batch
export async function getEmbeddings(texts: string[], apiKey: string): Promise<number[][]> {
  const vectors: number[][] = [];
  for (const text of texts) {
    const vector = await getEmbedding(text, apiKey);
    vectors.push(vector);
  }
  return vectors;
}

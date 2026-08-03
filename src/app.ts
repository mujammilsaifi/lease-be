// server.ts
import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import morgan from "morgan";
import cors from "cors";
import helmet from "helmet";
import hpp from "hpp";
import cookieParser from "cookie-parser";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGODB_URL as string;

// ---------------------------
// Routes
// ---------------------------
import leaseRoutes from "./routes/lease/leaseRoutes";
import sendMailRoute from "./routes/mail-route/mail.route";
import agreementIntelligenceRoutes from "./routes/agreement-intelligence/agreementIntelligenceRoutes";

// ---------------------------
// Database Connection
// ---------------------------
const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log(` MongoDB Connected: ${mongoose.connection.host}`);
  } catch (error: any) {
    console.error("MongoDB Connection Failed:", error.message);
    process.exit(1);
  }
};

// ---------------------------
// Global Middleware
// ---------------------------
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
app.use(cookieParser());
app.use(cors({ origin: "*", credentials: true }));
app.use(helmet());
app.use(hpp());

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// ---------------------------
// Routes
// ---------------------------
app.get("/", (req: Request, res: Response) => {
  res.send("🚀 Server is running...");
});

app.use("/api/v1", leaseRoutes);
app.use("/api/v1/agreement-intelligence", agreementIntelligenceRoutes);
app.use("/api/mail", sendMailRoute);

// Optional: Health check route
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    dbConnected: mongoose.connection.readyState === 1,
  });
});

// Optional: Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("💥 Global Error:", err.stack);
  res.status(500).json({ error: "Internal Server Error" });
});

// ---------------------------
// Start Server
// ---------------------------
connectDB().then(async () => {
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
  });

  // Sync RAG Knowledge Base in the background without blocking the startup/listening
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      const { syncKnowledgeBase } = await import("./services/knowledge");
      console.log("🔄 Syncing Knowledge Base in background...");
      // Unawaited background promise chain
      syncKnowledgeBase(apiKey)
        .then(() => {
          console.log("✅ Knowledge Base sync completed successfully.");
        })
        .catch((err) => {
          console.error("❌ Failed to index Knowledge Base on startup:", err);
        });
    } else {
      console.warn("⚠️ GEMINI_API_KEY is not defined. Skipping startup RAG indexing.");
    }
  } catch (err) {
    console.error("❌ Failed to initiate Knowledge Base sync on startup:", err);
  }
});


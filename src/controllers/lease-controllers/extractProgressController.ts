import { Request, Response } from "express";

interface CachedProgress {
  data: any;
  updatedAt: number;
}

const clients = new Map<string, Response>();
const progressCache = new Map<string, CachedProgress>();

// Clean up stale progress cache entries older than 10 minutes
const cleanupStaleCache = () => {
  const now = Date.now();
  const TEN_MINUTES = 10 * 60 * 1000;
  for (const [key, value] of progressCache.entries()) {
    if (now - value.updatedAt > TEN_MINUTES) {
      progressCache.delete(key);
    }
  }
};
setInterval(cleanupStaleCache, 60 * 1000);

export const extractProgressController = (req: Request, res: Response) => {
  const trackingId = req.query.trackingId as string;

  if (!trackingId) {
    return res.status(400).json({ error: "trackingId is required" });
  }

  // Set SSE and reverse proxy bypass headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Content-Encoding", "identity");
  res.flushHeaders();

  // Send an initial connected message or latest cached progress if available
  const existing = progressCache.get(trackingId);
  const initialPayload = existing
    ? existing.data
    : { stage: "connected", percentage: 5, message: "Connected to progress stream" };

  res.write(`data: ${JSON.stringify(initialPayload)}\n\n`);

  clients.set(trackingId, res);

  // Send heartbeat ping every 10 seconds to keep reverse proxies (Nginx/ALB/Cloudflare) alive
  const heartbeat = setInterval(() => {
    try {
      res.write(": keep-alive\n\n");
    } catch {
      clearInterval(heartbeat);
      clients.delete(trackingId);
    }
  }, 10000);

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(trackingId);
  });
};

/**
 * Fallback polling endpoint for environments where SSE is blocked by proxies/firewalls
 */
export const getExtractStatusController = (req: Request, res: Response) => {
  const trackingId = req.query.trackingId as string;

  if (!trackingId) {
    return res.status(400).json({ error: "trackingId is required" });
  }

  const cached = progressCache.get(trackingId);
  return res.status(200).json({
    trackingId,
    progress: cached ? cached.data : null,
  });
};

/**
 * Emit progress to active SSE connections and persist in shared cache
 */
export const emitProgress = (trackingId: string, eventData: any) => {
  if (!trackingId) return;

  // Persist latest state in cache
  progressCache.set(trackingId, {
    data: eventData,
    updatedAt: Date.now(),
  });

  // Direct SSE write if client is connected to this process
  const client = clients.get(trackingId);
  if (client) {
    try {
      client.write(`data: ${JSON.stringify(eventData)}\n\n`);
    } catch (err) {
      console.warn(`[Progress Stream] Failed to write SSE chunk for ${trackingId}:`, err);
      clients.delete(trackingId);
    }
  }

  // PM2 cluster IPC broadcast support
  if (typeof process.send === "function") {
    try {
      process.send({
        type: "EXTRACT_PROGRESS_BROADCAST",
        trackingId,
        eventData,
      });
    } catch {}
  }
};

// Listen for PM2 cluster IPC broadcasts from other worker processes
if (typeof process.on === "function") {
  process.on("message", (msg: any) => {
    if (msg && msg.type === "EXTRACT_PROGRESS_BROADCAST" && msg.trackingId) {
      progressCache.set(msg.trackingId, {
        data: msg.eventData,
        updatedAt: Date.now(),
      });
      const client = clients.get(msg.trackingId);
      if (client) {
        try {
          client.write(`data: ${JSON.stringify(msg.eventData)}\n\n`);
        } catch {
          clients.delete(msg.trackingId);
        }
      }
    }
  });
}

import { Request, Response } from "express";

const clients = new Map<string, Response>();

export const extractProgressController = (req: Request, res: Response) => {
  const trackingId = req.query.trackingId as string;

  if (!trackingId) {
    return res.status(400).json({ error: "trackingId is required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Send an initial connected message
  res.write(`data: ${JSON.stringify({ stage: "connected", percentage: 0, message: "Connected to progress stream" })}\n\n`);

  clients.set(trackingId, res);

  req.on("close", () => {
    clients.delete(trackingId);
  });
};

export const emitProgress = (trackingId: string, eventData: any) => {
  const client = clients.get(trackingId);
  if (client) {
    client.write(`data: ${JSON.stringify(eventData)}\n\n`);
  }
};

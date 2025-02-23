import { RequestHandler } from "express";
import { getUser } from "../services/auth";

export const authenticateToken: RequestHandler = (req, res, next) => {
  const authorizationHeaderValue = req.headers["authorization"];

  if (
    !authorizationHeaderValue ||
    !authorizationHeaderValue.startsWith("Bearer")
  ) {
    return res.status(401).json({ error: "Token not provided!" });
  }

  const token = authorizationHeaderValue.split("Bearer ")[1];

  if (!token) {
    return res.status(401).json({ error: "Token not provided!" });
  }

  const isTokenValid = getUser(token);

  if (!isTokenValid) {
    return res.status(401).json({ error: "Invalid token, not authenticated!" });
  }

  (req as any).token = token; // Store the token in the request object for later use if needed
  next(); // Proceed to the next middleware or controller function
};

import { Request, Response, NextFunction } from 'express';
import { getExactRole } from '../services/auth';
export const restrictTo = (allowedRoles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.headers.authorization?.split("Bearer ")[1];
      if (!token) {
        return res.status(401).json({ error: "Authentication required restrictTo" });
      }
      const userRole = await getExactRole(token);
      if (!allowedRoles.includes(userRole || '')) {
        return res.status(403).json({ 
          error: "Access denied. Insufficient permissions" 
        });
      }

      next();
    } catch (error) {
      return res.status(401).json({ error: "Authentication failed" });
    }
  };
};

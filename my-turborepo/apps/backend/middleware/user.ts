import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { requiredEnv } from "../auth.js";

export function userMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : undefined;
  if (!token) {
    res.status(401).json({ message: "Sign in to continue." });
    return;
  }

  const secret = requiredEnv("USER_JWT_PASSWORD");
  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    if (typeof decoded.userId !== "string") {
      res.status(401).json({ message: "Your session is invalid or expired." });
      return;
    }
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ message: "Your session is invalid or expired." });
  }
}

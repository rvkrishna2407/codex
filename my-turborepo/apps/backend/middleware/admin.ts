import type { NextFunction, Request, Response } from "express";
import { client } from "db/client";

export async function adminMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.userId) {
    res.status(401).json({ message: "Sign in to continue." });
    return;
  }

  const user = await client.user.findUnique({
    where: { id: req.userId },
    select: { role: true },
  });
  if (user?.role !== "Admin") {
    res.status(403).json({ message: "Administrator access is required." });
    return;
  }
  next();
}

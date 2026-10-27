import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { client } from "db/client";
import { SignupSchema } from "../types.js";
import { sendEmail } from "../mail.js";
import { userMiddleware } from "../middleware/user.js";
import {
  createEmailToken,
  createUserToken,
  isAdminEmail,
  requiredEnv,
  verifyEmailToken,
} from "../auth.js";

const router = Router();
const maxSignInRequests =
  process.env.NODE_ENV === "production" ? 5 : 50;
const signInWindowMs =
  process.env.NODE_ENV === "production"
    ? 15 * 60 * 1000
    : 5 * 60 * 1000;
const frontendUrl = () =>
  (process.env.FRONTEND_URL ?? "http://localhost:5173").replace(/\/+$/, "");
const signInAttempts = new Map<string, { count: number; resetsAt: number }>();

function limitSignInRequests(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
  if (signInAttempts.size > 2000) {
    for (const [address, attempt] of signInAttempts) {
      if (attempt.resetsAt <= now) signInAttempts.delete(address);
    }
  }
  const attempt = signInAttempts.get(key);
  if (!attempt || attempt.resetsAt <= now) {
    signInAttempts.set(key, { count: 1, resetsAt: now + signInWindowMs });
    next();
    return;
  }
  if (attempt.count >= maxSignInRequests) {
    res.status(429).json({
      message: "Too many sign-in link requests. Please try again later.",
    });
    return;
  }
  attempt.count += 1;
  next();
}

router.post("/signin", limitSignInRequests, async (req, res) => {
  const parsed = SignupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Enter a valid email address." });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const admin = isAdminEmail(email);
  const user = await client.user.upsert({
    where: { email },
    create: { email, role: admin ? "Admin" : "User" },
    update: { role: admin ? "Admin" : "User" },
    select: { id: true },
  });

  const token = createEmailToken(user.id);
  const link = `${frontendUrl()}/auth/verify?token=${encodeURIComponent(token)}`;
  const subject = "Your CodeX sign-in link";
  const body = `Sign in to CodeX using this link:\n\n${link}\n\nThis link expires in 15 minutes.`;

  if (process.env.NODE_ENV === "production") {
    await sendEmail(email, subject, body);
  } else {
    console.log(link);
  }

  res.json({
    message: "Check your email for a sign-in link.",
    ...(process.env.NODE_ENV !== "production" ? { signInToken: token } : {}),
  });
});

router.get("/signin/post", async (req, res) => {
  const token =
    typeof req.query.token === "string"
      ? req.query.token.replace(/\s/g, "")
      : "";
  if (!token) {
    res.status(400).json({ message: "Sign-in token is required." });
    return;
  }

  const emailSecret = requiredEnv("EMAIL_JWT_PASSWORD");
  try {
    const payload = verifyEmailToken(token, emailSecret);
    if (typeof payload !== "object" || typeof payload.userId !== "string") {
      res
        .status(401)
        .json({ message: "This sign-in link is invalid or expired." });
      return;
    }

    const user = await client.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true },
    });
    if (!user) {
      res
        .status(401)
        .json({ message: "This sign-in link is invalid or expired." });
      return;
    }

    res.json({
      token: createUserToken(user.id),
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch {
    res
      .status(401)
      .json({ message: "This sign-in link is invalid or expired." });
  }
});

router.get("/me", userMiddleware, async (req, res) => {
  const user = await client.user.findUnique({
    where: { id: req.userId },
    select: { id: true, email: true, role: true },
  });
  if (!user) {
    res.status(404).json({ message: "User not found." });
    return;
  }
  res.json({ user });
});

export default router;

import express from "express";
import cors from "cors";
import { join } from "node:path";
import { config } from "dotenv";
import userRouter from "./routes/user.js";
import adminRouter from "./routes/admin.js";
import contestRouter from "./routes/contest.js";

config({ path: join(import.meta.dir, ".env"), override: true });

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin: (origin, callback) => {
      const configuredOrigins = (
        process.env.FRONTEND_URL ?? "http://localhost:5173"
      )
        .split(",")
        .map((value) => value.trim().replace(/\/+$/, ""));
      const localDevelopmentOrigin =
        process.env.NODE_ENV !== "production" &&
        origin !== undefined &&
        /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin);
      callback(
        null,
        origin === undefined ||
          configuredOrigins.includes(origin) ||
          localDevelopmentOrigin,
      );
    },
  }),
);

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/user", userRouter);
app.use("/admin", adminRouter);
app.use("/contest", contestRouter);

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Request failed:", error);
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("grader")
    ) {
      res.status(503).json({ message: error.message });
      return;
    }
    if (
      error instanceof Error &&
      error.message.startsWith("Missing required environment variable:")
    ) {
      res.status(503).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: "An unexpected server error occurred." });
  },
);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () =>
  console.info(`CodeX API listening on http://localhost:${port}`),
);

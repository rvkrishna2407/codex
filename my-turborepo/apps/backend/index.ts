import express from "express";
import userRouter from "./routes/user.js";
import adminRouter from "./routes/admin.js";
import contestRouter from "./routes/contest.js";
const app = express();

  app.use("/user", userRouter);
  app.use("/admin", adminRouter);
  app.use("contest", contestRouter);

  app.listen(process.env.PORT ??4000);
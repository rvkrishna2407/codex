import { Router } from "express";
import { z } from "zod";
import { client } from "db/client";
import { adminMiddleware } from "../middleware/admin.js";
import { userMiddleware } from "../middleware/user.js";

const router = Router();
const ChallengeInput = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(12_000),
  maxPoints: z.number().int().min(1).max(1000),
  notionDocId: z.string().trim().optional().default(""),
  starterCode: z.string().max(20_000).optional(),
});
const ContestInput = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(4000).optional().default(""),
    startTime: z.coerce.date(),
    endTime: z.coerce.date().optional(),
    challenges: z.array(ChallengeInput).min(1).max(50),
  })
  .refine((input) => !input.endTime || input.endTime > input.startTime, {
    message: "The contest end time must be after its start time.",
    path: ["endTime"],
  });

router.use(userMiddleware, adminMiddleware);

router.get("/contests", async (_req, res) => {
  const contests = await client.contest.findMany({
    orderBy: { startTime: "desc" },
    include: {
      contestToChallengeMapping: {
        orderBy: { index: "asc" },
        include: { challenge: true },
      },
    },
  });
  res.json({ contests });
});

router.post("/contests", async (req, res) => {
  const parsed = ContestInput.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({
        message: parsed.error.issues[0]?.message ?? "Invalid contest details.",
      });
    return;
  }

  const input = parsed.data;
  const contest = await client.contest.create({
    data: {
      title: input.title,
      description: input.description,
      startTime: input.startTime,
      endTime: input.endTime,
      contestToChallengeMapping: {
        create: input.challenges.map((challenge, index) => ({
          index,
          challenge: {
            create: {
              title: challenge.title,
              description: challenge.description,
              maxPoints: challenge.maxPoints,
              notionDocId: challenge.notionDocId,
              starterCode: challenge.starterCode,
            },
          },
        })),
      },
    },
    include: {
      contestToChallengeMapping: {
        orderBy: { index: "asc" },
        include: { challenge: true },
      },
    },
  });
  res.status(201).json({ contest });
});

export default router;

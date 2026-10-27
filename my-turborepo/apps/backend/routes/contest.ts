import { Router } from "express";
import { z } from "zod";
import { client } from "db/client";
import { userMiddleware } from "../middleware/user.js";
import { gradeSubmission } from "../grader.js";

const router = Router();
const PageQuery = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  page: z.coerce.number().int().min(1).max(50).default(20),
});
const SubmissionInput = z.object({
  code: z.string().trim().min(1).max(50_000),
  language: z.string().trim().min(1).max(40).default("text"),
});

router.get("/active", async (req, res) => {
  const parsed = PageQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid pagination values." });
    return;
  }
  const now = new Date();
  const contests = await client.contest.findMany({
    where: { OR: [{ endTime: null }, { endTime: { gte: now } }] },
    orderBy: { startTime: "asc" },
    skip: parsed.data.offset,
    take: parsed.data.page,
    include: { _count: { select: { contestToChallengeMapping: true } } },
  });
  res.json({ contests });
});

router.get("/finished", async (req, res) => {
  const parsed = PageQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid pagination values." });
    return;
  }
  const contests = await client.contest.findMany({
    where: { endTime: { lt: new Date() } },
    orderBy: { startTime: "desc" },
    skip: parsed.data.offset,
    take: parsed.data.page,
    include: { _count: { select: { contestToChallengeMapping: true } } },
  });
  res.json({ contests });
});

router.get("/leaderboard/:contestId", async (req, res) => {
  const contest = await client.contest.findUnique({
    where: { id: req.params.contestId },
  });
  if (!contest) {
    res.status(404).json({ message: "Contest not found." });
    return;
  }
  const submissions = await client.submissions.findMany({
    where: { contestToChallengeMappings: { some: { contestId: contest.id } } },
    include: { users: { select: { id: true, email: true } } },
  });

  const bestScores = new Map<
    string,
    { userId: string; email: string; challenges: Map<string, number> }
  >();
  for (const submission of submissions) {
    const user = submission.users[0];
    const mappingId = submission.contestToChallengeMappingId;
    if (!user || !mappingId) continue;
    const current = bestScores.get(user.id) ?? {
      userId: user.id,
      email: user.email,
      challenges: new Map<string, number>(),
    };
    current.challenges.set(
      mappingId,
      Math.max(current.challenges.get(mappingId) ?? 0, submission.points),
    );
    bestScores.set(user.id, current);
  }

  const leaderboard = [...bestScores.values()]
    .map(({ challenges, ...entry }) => ({
      ...entry,
      points: [...challenges.values()].reduce((total, score) => total + score, 0),
    }))
    .sort((a, b) => b.points - a.points || a.email.localeCompare(b.email))
    .map((entry, index) => ({ rank: index + 1, ...entry }));
  res.json({ leaderboard, updatedAt: new Date().toISOString() });
});

router.get("/:contestId/challenges/:challengeId", async (req, res) => {
  const contestId = req.params.contestId;
  const challengeId = req.params.challengeId;
  if (typeof contestId !== "string" || typeof challengeId !== "string") {
    res.status(400).json({ message: "Invalid contest or challenge." });
    return;
  }
  const mapping = await client.contestToChallengeMapping.findUnique({
    where: { contestId_challengeId: { contestId, challengeId } },
  });
  if (!mapping) {
    res.status(404).json({ message: "Challenge not found in this contest." });
    return;
  }
  const challenge = await client.challenge.findUnique({
    where: { id: mapping.challengeId },
  });
  if (!challenge) {
    res.status(404).json({ message: "Challenge not found." });
    return;
  }
  res.json({ challenge });
});

router.post(
  "/:contestId/challenges/:challengeId/submissions",
  userMiddleware,
  async (req, res) => {
    const parsed = SubmissionInput.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({
          message: parsed.error.issues[0]?.message ?? "Invalid submission.",
        });
      return;
    }

    const contestId = req.params.contestId;
    const challengeId = req.params.challengeId;
    if (typeof contestId !== "string" || typeof challengeId !== "string") {
      res.status(400).json({ message: "Invalid contest or challenge." });
      return;
    }
    const mapping = await client.contestToChallengeMapping.findUnique({
      where: { contestId_challengeId: { contestId, challengeId } },
    });
    if (!mapping) {
      res.status(404).json({ message: "Challenge not found in this contest." });
      return;
    }
    const [challenge, contest] = await Promise.all([
      client.challenge.findUnique({ where: { id: mapping.challengeId } }),
      client.contest.findUnique({ where: { id: mapping.contestId } }),
    ]);
    if (!challenge || !contest) {
      res.status(404).json({ message: "Contest or challenge not found." });
      return;
    }
    const now = Date.now();
    if (
      contest.startTime.getTime() > now ||
      (contest.endTime && contest.endTime.getTime() < now)
    ) {
      res
        .status(409)
        .json({
          message: "This contest is not accepting submissions right now.",
        });
      return;
    }

    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ message: "Sign in to submit a solution." });
      return;
    }
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) {
      res.status(401).json({ message: "Your account could not be found." });
      return;
    }
    if (user.role === "Admin") {
      res
        .status(403)
        .json({ message: "Contest administrators cannot submit solutions." });
      return;
    }
    const previousSubmissions = await client.submissions.count({
      where: {
        users: { some: { id: userId } },
        contestToChallengeMappings: { some: { id: mapping.id } },
      },
    });
    if (previousSubmissions >= 20) {
      res
        .status(429)
        .json({
          message:
            "You have reached the 20-submission limit for this challenge.",
        });
      return;
    }

    const grade = await gradeSubmission({
      challenge: challenge.description,
      solution: parsed.data.code,
      language: parsed.data.language,
      maxPoints: challenge.maxPoints,
    });
    const submission = await client.submissions.create({
      data: {
        contestToChallengeMappingId: mapping.id,
        challengeId: challenge.id,
        userId,
        submission: parsed.data.code,
        points: grade.score,
        users: { connect: { id: userId } },
        contestToChallengeMappings: { connect: { id: mapping.id } },
      },
      select: { id: true, points: true, createdAt: true },
    });

    res
      .status(201)
      .json({
        submission,
        score: grade.score,
      });
  },
);

router.get("/:contestId", async (req, res) => {
  const contest = await client.contest.findUnique({
    where: { id: req.params.contestId },
    include: {
      contestToChallengeMapping: {
        orderBy: { index: "asc" },
        include: {
          challenge: {
            select: {
              id: true,
              title: true,
              description: true,
              maxPoints: true,
            },
          },
        },
      },
    },
  });
  if (!contest) {
    res.status(404).json({ message: "Contest not found." });
    return;
  }
  res.json({ contest });
});

export default router;

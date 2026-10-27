import { useCallback, useEffect, useState } from "react";

const API_URL = (
  import.meta.env.VITE_API_URL ?? "http://localhost:4000"
).replace(/\/+$/, "");
const TOKEN_KEY = "codex-session";

type User = { id: string; email: string; role: "User" | "Admin" };
type Challenge = {
  id: string;
  title: string;
  description: string;
  maxPoints: number;
  starterCode?: string | null;
};
type Mapping = { id: string; index: number; challenge: Challenge };
type Contest = {
  id: string;
  title: string;
  description: string;
  startTime: string;
  endTime?: string | null;
  contestToChallengeMapping?: Mapping[];
  _count?: { contestToChallengeMapping: number };
};
type Leader = { rank: number; userId: string; email: string; points: number };
type Auth = { token: string; user: User };

async function request<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    message?: string;
  };
  if (!response.ok) {
    throw new Error(data.message ?? `Request failed (${response.status}).`);
  }
  return data;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function profileInitial(email: string): string {
  const first = email.trim().charAt(0);
  return /[a-z]/i.test(first) ? first.toUpperCase() : "A";
}

function displayName(email: string): string {
  return email.split("@", 1)[0] || email;
}

function contestState(contest: Contest): "upcoming" | "live" | "finished" {
  const now = Date.now();
  if (contest.endTime && new Date(contest.endTime).getTime() < now)
    return "finished";
  if (new Date(contest.startTime).getTime() > now) return "upcoming";
  return "live";
}

function Icon({
  name,
}: {
  name: "arrow" | "chevron" | "close" | "plus" | "code" | "trophy" | "clock";
}) {
  const paths = {
    arrow: (
      <>
        <path d="M4 12h16" />
        <path d="m13 5 7 7-7 7" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    close: (
      <>
        <path d="m18 6-12 12" />
        <path d="m6 6 12 12" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    code: (
      <>
        <path d="m16 18 6-6-6-6" />
        <path d="m8 6-6 6 6 6" />
        <path d="m14 4-4 16" />
      </>
    ),
    trophy: (
      <>
        <path d="M8 21h8" />
        <path d="M12 17v4" />
        <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
        <path d="M7 7H4v2a4 4 0 0 0 4 4" />
        <path d="M17 7h3v2a4 4 0 0 1-4 4" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

export default function App() {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [signInUrl, setSignInUrl] = useState("");
  const [signInError, setSignInError] = useState("");
  const [activeContests, setActiveContests] = useState<Contest[]>([]);
  const [finishedContests, setFinishedContests] = useState<Contest[]>([]);
  const [selectedContest, setSelectedContest] = useState<Contest | null>(null);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(
    null,
  );
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [solution, setSolution] = useState("");
  const [language, setLanguage] = useState("typescript");
  const [grading, setGrading] = useState(false);
  const [gradeResult, setGradeResult] = useState<{
    points: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [section, setSection] = useState<"contests" | "finished" | "admin">(
    "contests",
  );
  const [adminOpen, setAdminOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const refreshContests = useCallback(async () => {
    const [active, finished] = await Promise.all([
      request<{ contests: Contest[] }>("/contest/active?offset=0&page=30"),
      request<{ contests: Contest[] }>("/contest/finished?offset=0&page=10"),
    ]);
    setActiveContests(active.contests);
    setFinishedContests(finished.contests);
  }, []);

  useEffect(() => {
    let alive = true;
    const magicToken =
      new URLSearchParams(window.location.search)
        .get("token")
        ?.replace(/\s/g, "") ?? null;
    const existingToken = window.localStorage.getItem(TOKEN_KEY);
    const finishAuth = (nextAuth: Auth) => {
      window.localStorage.setItem(TOKEN_KEY, nextAuth.token);
      if (alive) {
        setAuth(nextAuth);
        setNotice("Successfully signed in.");
      }
      window.history.replaceState({}, "", "/");
    };

    const initialAuth = magicToken
      ? request<Auth>(
          "/user/signin/post?token=" + encodeURIComponent(magicToken),
        )
          .then(finishAuth)
          .catch((reason: unknown) => {
            if (alive)
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Could not verify sign-in link.",
              );
          })
      : existingToken
        ? request<{ user: User }>("/user/me", {}, existingToken)
            .then(({ user }) => {
              if (alive) setAuth({ token: existingToken, user });
            })
            .catch(() => window.localStorage.removeItem(TOKEN_KEY))
        : Promise.resolve();

    void Promise.all([
      initialAuth,
      refreshContests().catch((reason: unknown) => {
        if (alive)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load contests.",
          );
      }),
    ]).finally(() => {
      if (alive) {
        setAuthReady(true);
        const params = new URLSearchParams(window.location.search);
        if (params.has("token")) window.history.replaceState({}, "", "/");
      }
    });
    return () => {
      alive = false;
    };
  }, [refreshContests]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 2000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!selectedContest) return;
    let alive = true;
    const load = async () => {
      try {
        const [{ contest }, { leaderboard }] = await Promise.all([
          request<{ contest: Contest }>(`/contest/${selectedContest.id}`),
          request<{ leaderboard: Leader[] }>(
            `/contest/leaderboard/${selectedContest.id}`,
          ),
        ]);
        if (alive) {
          setSelectedContest(contest);
          setLeaders(leaderboard);
          setSelectedChallenge((current) =>
            current &&
            contest.contestToChallengeMapping?.some(
              (item) => item.challenge.id === current.id,
            )
              ? current
              : null,
          );
        }
      } catch (reason) {
        if (alive)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not open contest.",
          );
      }
    };
    void load();
    const timer = window.setInterval(() => {
      request<{ leaderboard: Leader[] }>(
        `/contest/leaderboard/${selectedContest.id}`,
      )
        .then(({ leaderboard }) => {
          if (alive) setLeaders(leaderboard);
        })
        .catch(() => undefined);
    }, 15_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [selectedContest?.id]);

  const contests = section === "finished" ? finishedContests : activeContests;
  const challengeCount =
    selectedContest?.contestToChallengeMapping?.length ??
    selectedContest?._count?.contestToChallengeMapping ??
    0;

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSignInError("");
    try {
      const result = await request<{
        message: string;
        signInToken?: string;
      }>("/user/signin", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSignInUrl(
        result.signInToken
          ? `${window.location.origin}/auth/verify?token=${encodeURIComponent(result.signInToken)}`
          : "",
      );
      setEmailSent(true);
    } catch (reason) {
      setSignInError(
        reason instanceof Error
          ? reason.message
          : "Could not request a sign-in link.",
      );
    }
  }

  function signOut() {
    window.localStorage.removeItem(TOKEN_KEY);
    setAuth(null);
    setNotice("Signed out.");
  }

  async function submitSolution(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || !selectedContest || !selectedChallenge) {
      setError("Sign in before submitting a solution.");
      return;
    }
    setGrading(true);
    setGradeResult(null);
    setError("");
    try {
      const result = await request<{
        submission: { points: number };
      }>(
        `/contest/${selectedContest.id}/challenges/${selectedChallenge.id}/submissions`,
        {
          method: "POST",
          body: JSON.stringify({ code: solution, language }),
        },
        auth.token,
      );
      setGradeResult({
        points: result.submission.points,
      });
      const { leaderboard } = await request<{ leaderboard: Leader[] }>(
        `/contest/leaderboard/${selectedContest.id}`,
      );
      setLeaders(leaderboard);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not submit your solution.",
      );
    } finally {
      setGrading(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => {
            setSelectedContest(null);
            setSection("contests");
          }}
          aria-label="CodeX home"
        >
          <span className="brand-mark">&lt;/&gt;</span>
          <span>CodeX</span>
        </button>
        <nav className="main-nav" aria-label="Main navigation">
          <button
            className={section !== "finished" ? "nav-link active" : "nav-link"}
            onClick={() => {
              setSection("contests");
              setSelectedContest(null);
            }}
          >
            Contests
          </button>
          <button
            className={section === "finished" ? "nav-link active" : "nav-link"}
            onClick={() => {
              setSection("finished");
              setSelectedContest(null);
            }}
          >
            Past contests
          </button>
        </nav>
        <div className="account-area">
          {authReady && auth ? (
            <div className="account-menu-wrap">
              <button
                className="profile-trigger"
                aria-label="Open profile menu"
                aria-expanded={accountMenuOpen}
                onClick={() => setAccountMenuOpen((open) => !open)}
              >
                {profileInitial(auth.user.email)}
              </button>
              {accountMenuOpen && (
                <div className="account-menu">
                  <button
                    onClick={() => {
                      setProfileOpen(true);
                      setAccountMenuOpen(false);
                    }}
                  >
                    Profile
                  </button>
                  <button
                    onClick={() => {
                      signOut();
                      setAccountMenuOpen(false);
                    }}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              className="button button-light button-small"
              onClick={() => setAdminOpen(true)}
            >
              Sign in <Icon name="arrow" />
            </button>
          )}
        </div>
      </header>

      <main className="page">
        {error && (
          <div className="alert" role="alert">
            <span>{error}</span>
            <button onClick={() => setError("")} aria-label="Dismiss">
              <Icon name="close" />
            </button>
          </div>
        )}

        {section === "admin" && auth?.user.role === "Admin" ? (
          <AdminPanel
            token={auth.token}
            onCreated={async () => {
              await refreshContests();
              setSection("contests");
              setNotice("Contest created successfully.");
            }}
            onError={setError}
            onBack={() => setSection("contests")}
          />
        ) : selectedContest ? (
          <ContestView
            contest={selectedContest}
            challenge={selectedChallenge}
            leaders={leaders}
            count={challengeCount}
            auth={auth}
            solution={solution}
            language={language}
            grading={grading}
            result={gradeResult}
            onBack={() => {
              setSelectedContest(null);
              setSelectedChallenge(null);
            }}
            onBackChallenge={() => {
              setSelectedChallenge(null);
              setGradeResult(null);
            }}
            onChallenge={(nextChallenge) => {
              setGradeResult(null);
              setSolution("");
              setSelectedChallenge(nextChallenge);
            }}
            onSolution={setSolution}
            onLanguage={setLanguage}
            onSubmit={submitSolution}
            onSignIn={() => setAdminOpen(true)}
          />
        ) : (
          <section className="dashboard">
            <div className="hero">
              <div>
                <h1>
                  Code. Compete.
                  <br />
                  <span>Conquer.</span>
                </h1>
                <p className="hero-copy">
                  Challenge Yourself. Climb the Leaderboard.
                </p>
                {auth?.user.role === "Admin" && (
                  <button
                    className="button button-light hero-action"
                    onClick={() => setSection("admin")}
                  >
                    <Icon name="plus" /> Create a contest
                  </button>
                )}
              </div>
            </div>

            <div className="section-heading">
              <h2>{section === "finished" ? "Past contests" : "Open contests"}</h2>
            </div>

            {contests.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">
                  <Icon name="code" />
                </span>
                <h3>
                  {section === "finished"
                    ? "No finished contests yet"
                    : "Nothing on the board yet"}
                </h3>
                <p>
                  Check back soon. The next challenge is just around the corner.
                </p>
              </div>
            ) : (
              <div className="contest-grid">
                {contests.map((contest) => (
                  <button
                    className="contest-card"
                    key={contest.id}
                    onClick={() => {
                      setSelectedContest(contest);
                      setSelectedChallenge(null);
                      setGradeResult(null);
                      setError("");
                    }}
                  >
                    <h3>{contest.title}</h3>
                    <div className="card-meta">
                      <span>
                        <Icon name="clock" />
                        {contest.endTime
                          ? `Ends ${formatDate(contest.endTime)}`
                          : `Starts ${formatDate(contest.startTime)}`}
                      </span>
                      <span>
                        <Icon name="code" />
                        {contest._count?.contestToChallengeMapping ?? "—"}{" "}
                        challenges
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {adminOpen && (
        <SignInModal
          email={email}
          emailSent={emailSent}
          signInUrl={signInUrl}
          error={signInError}
          onEmail={setEmail}
          onSubmit={signIn}
          onClose={() => {
            setAdminOpen(false);
            setEmailSent(false);
            setSignInUrl("");
            setSignInError("");
          }}
        />
      )}
      {profileOpen && auth && (
        <section className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setProfileOpen(false);
        }}>
          <div className="modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
            <button className="modal-close" onClick={() => setProfileOpen(false)} aria-label="Close">
              <Icon name="close" />
            </button>
            <span className="profile-trigger profile-modal-avatar">{profileInitial(auth.user.email)}</span>
            <p className="eyebrow">ACCOUNT</p>
            <h2 id="profile-title">Profile</h2>
            <p className="profile-email">{auth.user.email}</p>
            <p className="profile-role">{auth.user.role}</p>
          </div>
        </section>
      )}
      {notice && (
        <div className="toast" role="status" aria-live="polite">
          {notice}
        </div>
      )}
      <footer className="footer">
        <div className="footer-brand">CodeX — Code. Compete. Conquer.</div>
        <div className="footer-bottom">
          <span>© 2026 CodeX. All rights reserved.</span>
          <nav aria-label="Footer navigation">
            <a href="#contests">Contests</a>
            <a href="#problems">Problems</a>
            <a href="#leaderboard">Leaderboard</a>
            <a href="#about">About</a>
            <a href="mailto:contact@codex.local">Contact</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function SignInModal({
  email,
  emailSent,
  signInUrl,
  error,
  onEmail,
  onSubmit,
  onClose,
}: {
  email: string;
  emailSent: boolean;
  signInUrl: string;
  error: string;
  onEmail: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-title"
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
        <span className="brand-mark modal-mark">&lt;/&gt;</span>
        <p className="eyebrow">WELCOME TO CODEX</p>
        <h2 id="signin-title">
          {emailSent ? "Check your inbox." : "Good to have you."}
        </h2>
        {emailSent ? (
          <div className="modal-copy">
            <p>
              We sent a secure sign-in link to <strong>{email}</strong>.
            </p>
            {signInUrl && (
              <>
                <p>
                  In development, click below to verify this link in your
                  browser.
                </p>
                <a
                  className="button button-light button-wide sign-in-link"
                  href={signInUrl}
                >
                  Open sign-in link <Icon name="arrow" />
                </a>
              </>
            )}
          </div>
        ) : (
          <>
            <p className="modal-copy">
              Sign in with your email. No password to remember, just a secure
              link.
            </p>
            {error && (
              <p className="modal-error" role="alert">
                {error}
              </p>
            )}
            <form className="signin-form" onSubmit={onSubmit}>
              <label htmlFor="signin-email">Email address</label>
              <input
                id="signin-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => onEmail(event.target.value)}
                placeholder="you@example.com"
              />
              <button className="button button-light button-wide" type="submit">
                Send sign-in link <Icon name="arrow" />
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

function ContestView({
  contest,
  challenge,
  leaders,
  count,
  auth,
  solution,
  language,
  grading,
  result,
  onBack,
  onBackChallenge,
  onChallenge,
  onSolution,
  onLanguage,
  onSubmit,
  onSignIn,
}: {
  contest: Contest;
  challenge: Challenge | null;
  leaders: Leader[];
  count: number;
  auth: Auth | null;
  solution: string;
  language: string;
  grading: boolean;
  result: { points: number } | null;
  onBack: () => void;
  onBackChallenge: () => void;
  onChallenge: (value: Challenge) => void;
  onSolution: (value: string) => void;
  onLanguage: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onSignIn: () => void;
}) {
  const state = contestState(contest);
  const mappings = contest.contestToChallengeMapping ?? [];
  const challengeIndex =
    mappings.findIndex((item) => item.challenge.id === challenge?.id) + 1;
  const isAdmin = auth?.user.role === "Admin";
  return (
    <section className="contest-detail">
      <button
        className="back-link"
        onClick={challenge ? onBackChallenge : onBack}
        aria-label={challenge ? "Back to contest" : "Back to contests"}
      >
        ←
      </button>
      <div className="detail-heading">
        <div>
          <h1>{contest.title}</h1>
        </div>
      </div>

      {challenge ? (
        <div className="challenge-page-layout">
          <aside className="problem-panel challenge-problem">
            <span className="eyebrow">
              CHALLENGE {String(challengeIndex).padStart(2, "0")}
            </span>
            <h2>{challenge.title}</h2>
            <div className="problem-description">
              {challenge.description.split("\n").map((line, index) => (
                <p key={index}>{line || "\u00a0"}</p>
              ))}
            </div>
          </aside>
          <div className="challenge-workspace">
            {isAdmin ? (
              <div className="admin-participation-note">
                Contest administrators can manage contests but cannot submit
                solutions.
              </div>
            ) : (
              <>
                <form className="editor-panel" onSubmit={onSubmit}>
                  <div className="editor-toolbar">
                    <div className="editor-label">
                      <Icon name="code" /> YOUR SOLUTION
                    </div>
                    <select
                      aria-label="Programming language"
                      value={language}
                      onChange={(event) => onLanguage(event.target.value)}
                    >
                      <option value="typescript">TypeScript</option>
                      <option value="javascript">JavaScript</option>
                      <option value="python">Python</option>
                      <option value="java">Java</option>
                      <option value="cpp">C++</option>
                      <option value="text">Other / written answer</option>
                    </select>
                  </div>
                  <div className="code-area">
                    <div className="line-numbers" aria-hidden="true">
                      {Array.from(
                        { length: Math.max(12, solution.split("\n").length) },
                        (_, index) => (
                          <span key={index}>{index + 1}</span>
                        ),
                      )}
                    </div>
                    <textarea
                      aria-label="Solution"
                      spellCheck={false}
                      value={solution}
                      onChange={(event) => onSolution(event.target.value)}
                      placeholder={
                        challenge.starterCode || "// Write your solution here"
                      }
                    />
                  </div>
                  <div className="submit-row">
                    <div className="submit-result">
                      {result && (
                        <span className="result-score">
                          {result.points} / {challenge.maxPoints} points
                        </span>
                      )}
                    </div>
                    {state !== "live" ? (
                      <button
                        className="button button-light"
                        type="button"
                        disabled
                      >
                        {state === "upcoming" ? "Not open yet" : "Contest ended"}
                      </button>
                    ) : auth ? (
                      <button
                        className="button button-light"
                        type="submit"
                        disabled={grading || !solution.trim()}
                      >
                        {grading ? "Analyzing…" : "Submit"}
                      </button>
                    ) : (
                      <button
                        className="button button-light"
                        type="button"
                        onClick={onSignIn}
                      >
                        Sign in
                      </button>
                    )}
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="contest-overview-layout">
          <aside className="challenge-sidebar">
            <div className="sidebar-title">
              <span>CHALLENGES</span>
              <span>{count}</span>
            </div>
            {mappings.map(({ challenge: item, index }) => (
              <button
                className="challenge-link"
                key={item.id}
                onClick={() => onChallenge(item)}
              >
                <span className="challenge-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="challenge-name">{item.title}</span>
                <Icon name="chevron" />
              </button>
            ))}
            {!mappings.length && (
              <p className="sidebar-empty">No challenges have been added.</p>
            )}
          </aside>
          <LeaderboardPanel leaders={leaders} />
        </div>
      )}
    </section>
  );
}

function LeaderboardPanel({ leaders }: { leaders: Leader[] }) {
  return (
    <aside className="leaderboard">
      <div className="leaderboard-title">
        <span className="trophy-icon">
          <Icon name="trophy" />
        </span>
        <h3>Leaderboard</h3>
        <span className="live-indicator" aria-label="Live standings" />
      </div>
      {leaders.length ? (
        <ol>
          {leaders.map((leader) => (
            <li key={leader.userId}>
              <span className={`rank rank-${leader.rank}`}>
                {String(leader.rank).padStart(2, "0")}
              </span>
              <span className="leader-email">{displayName(leader.email)}</span>
              <strong>{leader.points}</strong>
            </li>
          ))}
        </ol>
      ) : (
        <p className="leader-empty">
          Scores will show here as participants submit solutions.
        </p>
      )}
    </aside>
  );
}

function AdminPanel({
  token,
  onCreated,
  onError,
  onBack,
}: {
  token: string;
  onCreated: () => Promise<void>;
  onError: (message: string) => void;
  onBack: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [challenges, setChallenges] = useState([
    { title: "", description: "", maxPoints: 100 },
  ]);
  const [saving, setSaving] = useState(false);

  function updateChallenge(
    index: number,
    key: "title" | "description" | "maxPoints",
    value: string,
  ) {
    setChallenges((current) =>
      current.map((item, currentIndex) =>
        currentIndex === index
          ? { ...item, [key]: key === "maxPoints" ? Number(value) : value }
          : item,
      ),
    );
  }

  async function createContest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    onError("");
    try {
      await request(
        "/admin/contests",
        {
          method: "POST",
          body: JSON.stringify({
            title,
            description,
            startTime: new Date(startTime).toISOString(),
            ...(endTime ? { endTime: new Date(endTime).toISOString() } : {}),
            challenges,
          }),
        },
        token,
      );
      await onCreated();
    } catch (reason) {
      onError(
        reason instanceof Error ? reason.message : "Could not create contest.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-page">
      <button className="back-link" onClick={onBack} aria-label="Back to contests">
        ←
      </button>
      <div className="section-heading">
        <div>
          <h1>Create a contest</h1>
        </div>
      </div>
      <form className="admin-form" onSubmit={createContest}>
        <div className="form-section-heading">
          <span>01</span>
          <div>
            <h3>Contest Details</h3>
          </div>
        </div>
        <div className="form-grid">
          <label>
            Contest Title
            <input
              required
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. October Open"
            />
          </label>
          <label>
            Starting date and time
            <input
              required
              type="datetime-local"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
          </label>
          <label className="full-field">
            Description
            <textarea
              maxLength={4000}
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What should participants know?"
            />
          </label>
          <label>
            Ending date and time
            <input
              type="datetime-local"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
            />
          </label>
        </div>
        <div className="form-section-heading challenges-form-heading">
          <span>02</span>
          <div>
            <h3>Challenges</h3>
          </div>
        </div>
        {challenges.map((challenge, index) => (
          <div className="challenge-editor" key={index}>
            <div className="challenge-editor-head">
              <span>CHALLENGE {String(index + 1).padStart(2, "0")}</span>
              {challenges.length > 1 && (
                <button
                  type="button"
                  className="remove-challenge"
                  onClick={() =>
                    setChallenges((current) =>
                      current.filter((_, i) => i !== index),
                    )
                  }
                >
                  Remove
                </button>
              )}
            </div>
            <div className="form-grid">
              <label>
                Title
                <input
                  required
                  maxLength={120}
                  value={challenge.title}
                  onChange={(event) =>
                    updateChallenge(index, "title", event.target.value)
                  }
                  placeholder="Problem name"
                />
              </label>
              <label>
                Maximum score
                <input
                  required
                  type="number"
                  min={1}
                  max={1000}
                  value={challenge.maxPoints}
                  onChange={(event) =>
                    updateChallenge(index, "maxPoints", event.target.value)
                  }
                />
              </label>
              <label className="full-field">
                Problem
                <textarea
                  required
                  maxLength={12000}
                  rows={5}
                  value={challenge.description}
                  onChange={(event) =>
                    updateChallenge(index, "description", event.target.value)
                  }
                  placeholder="Describe the task, requirements, and what a strong solution should cover."
                />
              </label>
            </div>
          </div>
        ))}
        <div className="admin-actions">
          <button
            type="button"
            className="button button-outline"
            onClick={() =>
              setChallenges((current) => [
                ...current,
                { title: "", description: "", maxPoints: 100 },
              ])
            }
          >
            <Icon name="plus" /> Add challenge
          </button>
          <button className="button button-light" disabled={saving}>
            {saving ? "Publishing…" : "Publish contest"}
          </button>
        </div>
      </form>
    </section>
  );
}

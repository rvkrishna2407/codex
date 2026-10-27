import { requiredEnv } from "./auth.js";

export async function sendEmail(
  to: string,
  subject: string,
  textBody: string,
): Promise<void> {
  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": requiredEnv("POSTMARK_SERVER_TOKEN"),
    },
    body: JSON.stringify({
      From: requiredEnv("FROM_EMAIL"),
      To: to,
      Subject: subject,
      TextBody: textBody,
      HtmlBody: textBody.replaceAll("\n", "<br>"),
      MessageStream: "outbound",
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    console.error(`Postmark request failed (${response.status}): ${details}`);
    throw new Error("Could not send the sign-in email.");
  }
}

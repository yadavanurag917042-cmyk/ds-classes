import { Webhook } from "npm:standardwebhooks@^1";

type AuthEmailHookPayload = {
  user: {
    email?: string;
    new_email?: string;
  };
  email_data: {
    token?: string;
    token_hash?: string;
    token_new?: string;
    token_hash_new?: string;
    email_action_type: string;
  };
};

type OtpEmail = {
  to: string;
  token: string;
  action: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAuthEmailHookPayload(value: unknown): value is AuthEmailHookPayload {
  if (!isRecord(value) || !isRecord(value.user) || !isRecord(value.email_data)) return false;
  const { user, email_data: emailData } = value;
  const optionalStrings = (record: Record<string, unknown>, keys: string[]) =>
    keys.every((key) => record[key] === undefined || typeof record[key] === "string");

  return optionalStrings(user, ["email", "new_email"]) &&
    typeof emailData.email_action_type === "string" &&
    optionalStrings(emailData, ["token", "token_hash", "token_new", "token_hash_new"]);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

function actionLabel(action: string): string {
  switch (action) {
    case "signup":
      return "account verify";
    case "recovery":
      return "password reset";
    case "email_change":
      return "email change verify";
    case "invite":
      return "account invitation";
    case "reauthentication":
      return "reauthentication";
    default:
      return "sign-in";
  }
}

function buildEmail(token: string, action: string) {
  const purpose = actionLabel(action);
  const safeToken = escapeHtml(token);
  return {
    subject: `DS CLASSES ${purpose} code`,
    text: `Your DS CLASSES ${purpose} code is ${token}.\n\nEnter this code in the app. Do not share it with anyone. If you did not request this code, you can ignore this email.`,
    html: `<div style="background:#080d18;color:#f3f6ff;font-family:Arial,sans-serif;padding:32px 16px"><div style="background:#111a2a;border:1px solid #26334a;border-radius:16px;margin:0 auto;max-width:480px;padding:28px"><p style="color:#c8f169;font-size:12px;font-weight:bold;letter-spacing:2px">DS CLASSES</p><h1 style="font-size:22px">Your ${purpose} code</h1><p style="color:#c4cede">Enter this one-time code in the DS CLASSES app:</p><p style="background:#080d18;border-radius:10px;color:#c8f169;font-size:32px;font-weight:bold;letter-spacing:8px;padding:18px;text-align:center">${safeToken}</p><p style="color:#aab7ca;font-size:13px">Do not share this code with anyone. If you did not request it, you can ignore this email.</p></div></div>`,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

async function sendWithResend(
  email: OtpEmail,
  apiKey: string,
  from: string,
  replyTo: string | undefined,
): Promise<void> {
  const content = buildEmail(email.token, email.action);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email.to],
      subject: content.subject,
      html: content.html,
      text: content.text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
    signal: AbortSignal.timeout(1800),
  });
  if (!response.ok) throw new Error(`Resend returned HTTP ${response.status}`);
}

async function sendWithPostmark(
  email: OtpEmail,
  serverToken: string,
  from: string,
  replyTo: string | undefined,
): Promise<void> {
  const content = buildEmail(email.token, email.action);
  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "X-Postmark-Server-Token": serverToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      From: from,
      To: email.to,
      Subject: content.subject,
      HtmlBody: content.html,
      TextBody: content.text,
      MessageStream: "outbound",
      ...(replyTo ? { ReplyTo: replyTo } : {}),
    }),
    signal: AbortSignal.timeout(1800),
  });
  if (!response.ok) throw new Error(`Postmark returned HTTP ${response.status}`);
}

async function deliverEmail(email: OtpEmail): Promise<void> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const postmarkToken = Deno.env.get("POSTMARK_SERVER_TOKEN");
  const from = Deno.env.get("SEND_EMAIL_FROM");
  const replyTo = Deno.env.get("SEND_EMAIL_REPLY_TO");

  if (!from) throw new Error("SEND_EMAIL_FROM is not configured");
  if (!resendKey && !postmarkToken) throw new Error("No email provider is configured");

  let primaryError: unknown;
  if (resendKey) {
    try {
      await sendWithResend(email, resendKey, from, replyTo);
      return;
    } catch (error) {
      primaryError = error;
      if (!postmarkToken) throw error;
      console.error("Resend delivery failed; trying the configured backup provider.");
    }
  }

  if (postmarkToken) {
    try {
      await sendWithPostmark(email, postmarkToken, from, replyTo);
      return;
    } catch (error) {
      if (primaryError) {
        console.error("Both configured email providers failed.");
        throw new Error("Email delivery failed with the primary and backup providers.");
      }
      throw error;
    }
  }

  throw primaryError || new Error("Email delivery failed.");
}

function getOtpEmails(payload: AuthEmailHookPayload): OtpEmail[] {
  const { user, email_data: emailData } = payload;
  if (!emailData || typeof emailData.email_action_type !== "string") {
    throw new Error("Invalid email action in auth hook payload.");
  }

  if (emailData.email_action_type === "email_change") {
    const emails: OtpEmail[] = [];
    if (user.email && emailData.token && emailData.token_hash_new) {
      emails.push({
        to: user.email,
        token: emailData.token,
        action: emailData.email_action_type,
      });
    }
    if (user.new_email && emailData.token_new && emailData.token_hash) {
      emails.push({
        to: user.new_email,
        token: emailData.token_new,
        action: emailData.email_action_type,
      });
    }
    if (emails.length) return emails;

    if (user.new_email && emailData.token) {
      return [{ to: user.new_email, token: emailData.token, action: emailData.email_action_type }];
    }
    if (user.new_email && emailData.token_new) {
      return [{ to: user.new_email, token: emailData.token_new, action: emailData.email_action_type }];
    }
    throw new Error("No email-change OTP recipient or token was provided.");
  }

  if (!user.email || !emailData.token) {
    throw new Error("Auth hook payload is missing the email address or OTP.");
  }
  return [{
    to: user.email,
    token: emailData.token,
    action: emailData.email_action_type,
  }];
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const configuredSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET");
  if (!configuredSecret) {
    console.error("SEND_EMAIL_HOOK_SECRET is not configured.");
    return jsonResponse({ error: "Email hook is not configured." }, 500);
  }

  let verifiedPayload: unknown;
  try {
    const secret = configuredSecret.replace(/^v1,whsec_/, "");
    const webhook = new Webhook(secret);
    verifiedPayload = webhook.verify(await request.text(), Object.fromEntries(request.headers));
  } catch {
    return jsonResponse({ error: "Invalid auth hook signature." }, 401);
  }

  if (!isAuthEmailHookPayload(verifiedPayload)) {
    return jsonResponse({ error: "Invalid auth hook payload." }, 400);
  }

  try {
    for (const email of getOtpEmails(verifiedPayload)) {
      await deliverEmail(email);
    }
    return jsonResponse({});
  } catch (error) {
    console.error("Auth email delivery failed:", error instanceof Error ? error.message : "Unknown delivery error.");
    return jsonResponse({
      error: {
        http_code: 502,
        message: "Email delivery failed. Please try again.",
      },
    }, 502);
  }
});

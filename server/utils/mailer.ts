import nodemailer from "nodemailer";
import type { User } from "@prisma/client";

interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface MailerData<T = any> extends MailOptions {
  data: T;
  destinationUrl?: string;
  additional?: string;
}

type SuspiciousActivityType =
  | "login"
  | "change_password"
  | "change_email"
  | "api_key_reset"
  | "two_factor_disabled"
  | "unknown";

interface ClientLocation {
  country?: string;
  countryCode?: string;
  region?: string;
  regionName?: string;
  city?: string;
  zip?: string;
  lat?: string;
  lon?: string;
  timezone?: string;
  isp?: string;
  org?: string;
  as?: string;
  query?: string;
}

interface SuspiciousActivityPayload {
  type: SuspiciousActivityType;
  ip: string;
  userAgent?: string;
  location?: ClientLocation;
  timestamp: Date;
  secureUrl: string; // URL to lock/secure account
}

export async function sendMail(input: MailOptions) {
  const config = useRuntimeConfig();

  const host = config.NodeMailerHost;
  const port = Number(config.NodeMailerPort);
  const secure = config.NodeMailerSecure === "true";
  const user = config.NodeMailerAuthUser;
  const pass = config.NodeMailerAuthPassword ?? config.NodeMailerAuthPass;
  const from = config.NodeMailerFrom;

  if (!host || !port || !user || !pass) {
    throw createError({
      statusCode: 500,
      statusMessage: "SMTP is not configured",
    });
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure, // true = implicit SSL (port 465), false = STARTTLS (port 587)
    requireTLS: !secure, // Force TLS upgrade on port 587 (STARTTLS)
    auth: { user, pass },
    tls: {
      // Spacemail may use a self-signed or internal CA cert
      rejectUnauthorized: false,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });

  try {
    await transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  } catch (err: any) {
    console.error("[Mailer] SMTP send failed:", err?.message);
    throw createError({
      statusCode: 502,
      statusMessage: `Mailer error: ${err?.message}`,
    });
  }
}

function buildEmailShell(
  body: string,
  preview: string,
  siteUrl: string,
): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="x-apple-disable-message-reformatting"/>
  <title>Smart Boost Labs</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'DM Sans',Arial,sans-serif;background:#0f0f11;color:#e8e8ec;-webkit-font-smoothing:antialiased;}
    a{color:#7c6ef7;text-decoration:none;}
    .preheader{display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all;}
    @media(max-width:600px){
      .email-wrapper{padding:16px!important;}
      .email-card{padding:28px 20px!important;}
      .btn{display:block!important;text-align:center!important;}
    }
  </style>
</head>
<body>
  <!-- Preview text -->
  <div class="preheader" aria-hidden="true">${preview}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#0f0f11;">
    <tr>
      <td class="email-wrapper" style="padding:40px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;margin:0 auto;">

          <!-- Logo / Header -->
          <tr>
            <td style="padding-bottom:28px;text-align:center;">
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto;">
                <tr>
                  <td style="background:linear-gradient(135deg,#7c6ef7,#5b4fe8);border-radius:12px;padding:10px 18px;">
                    <span style="font-family:'DM Mono',monospace;font-size:18px;font-weight:500;color:#fff;letter-spacing:-0.5px;">⬡ Smart Boost Labs</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td class="email-card" style="background:#18181d;border:1px solid #2a2a33;border-radius:16px;padding:40px 36px;">
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:28px;text-align:center;">
              <p style="font-size:12px;color:#55555f;line-height:1.7;">
                You're receiving this email because you have an account at
                <a href="${siteUrl}" style="color:#7c6ef7;">Smart Boost Labs</a>.<br/>
                If you didn't request this, you can safely ignore it.
              </p>
              <p style="margin-top:12px;font-size:11px;color:#3d3d47;">
                © ${new Date().getFullYear()} Smart Boost Labs · All rights reserved
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function primaryButton(label: string, url: string): string {
  return /* html */ `
  <table cellpadding="0" cellspacing="0" role="presentation" style="margin:28px 0;">
    <tr>
      <td style="border-radius:10px;background:linear-gradient(135deg,#7c6ef7,#5b4fe8);box-shadow:0 4px 20px rgba(124,110,247,0.35);">
        <a href="${url}" class="btn" style="display:inline-block;padding:14px 32px;font-family:'DM Sans',Arial,sans-serif;font-size:15px;font-weight:600;color:#fff;letter-spacing:0.1px;">${label}</a>
      </td>
    </tr>
  </table>`;
}

function warningButton(label: string, url: string): string {
  return /* html */ `
  <table cellpadding="0" cellspacing="0" role="presentation" style="margin:28px 0;">
    <tr>
      <td style="border-radius:10px;background:linear-gradient(135deg,#e8633a,#c9472a);box-shadow:0 4px 20px rgba(232,99,58,0.35);">
        <a href="${url}" class="btn" style="display:inline-block;padding:14px 32px;font-family:'DM Sans',Arial,sans-serif;font-size:15px;font-weight:600;color:#fff;">${label}</a>
      </td>
    </tr>
  </table>`;
}

function greeting(user: Partial<User>): string {
  const name = user?.name?.split(" ")[0] ?? "there";
  return /* html */ `<p style="font-size:15px;color:#9898a6;margin-bottom:8px;">Hello,</p>
  <h1 style="font-size:24px;font-weight:600;color:#e8e8ec;margin-bottom:20px;line-height:1.3;">${name} 👋</h1>`;
}

function divider(): string {
  return `<hr style="border:none;border-top:1px solid #2a2a33;margin:28px 0;"/>`;
}

function fallbackUrl(url: string): string {
  return /* html */ `
  <p style="font-size:13px;color:#55555f;margin-top:16px;line-height:1.6;">
    Button not working? Copy and paste this link into your browser:<br/>
    <span style="font-family:'DM Mono',monospace;font-size:12px;color:#7c6ef7;word-break:break-all;">${url}</span>
  </p>`;
}

function expiryNote(minutes: number): string {
  return /* html */ `
  <p style="font-size:13px;color:#e8633a;margin-top:16px;">
    ⏱ This link expires in <strong>${minutes} minutes</strong>.
  </p>`;
}

function infoRow(label: string, value: string): string {
  return /* html */ `
  <tr>
    <td style="padding:10px 0;border-bottom:1px solid #222228;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td style="font-size:13px;color:#55555f;width:45%;">${label}</td>
          <td style="font-size:13px;color:#c8c8d4;font-weight:500;text-align:right;">${value}</td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function badge(text: string, color: string = "#7c6ef7"): string {
  return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${color}22;color:${color};font-size:12px;font-weight:600;letter-spacing:0.3px;border:1px solid ${color}44;">${text}</span>`;
}

// ─────────────────────────────────────────────
// 1. Email Verification (Registration)
// ─────────────────────────────────────────────

export async function sendEmailVerificationEmail(
  user: Partial<User>,
  verificationUrl: string,
  siteUrl: string,
) {
  const body = /* html */ `
    ${greeting(user)}
    <p style="font-size:15px;color:#9898a6;line-height:1.7;margin-bottom:8px;">
      Thanks for signing up at <strong style="color:#e8e8ec;">Smart Boost Labs</strong>.
      Please verify your email address to activate your account and start using our platform.
    </p>
    ${primaryButton("Verify Email Address", verificationUrl)}
    ${expiryNote(60)}
    ${divider()}
    <p style="font-size:13px;color:#55555f;line-height:1.6;">
      If you didn't create an account with us, you can safely ignore this email —
      no action is required from your side.
    </p>
    ${fallbackUrl(verificationUrl)}
  `;

  await sendMail({
    to: user?.email ?? "",
    subject: "Verify your email address – Smart Boost Labs",
    text: `Verify your email: ${verificationUrl}`,
    html: buildEmailShell(
      body,
      "One click to activate your Smart Boost Labs account.",
      siteUrl,
    ),
  });
}

// ─────────────────────────────────────────────
// 2. Resend Email Verification
// ─────────────────────────────────────────────

export async function sendResendVerificationEmail(
  user: Partial<User>,
  verificationUrl: string,
  siteUrl: string,
) {
  const body = /* html */ `
    ${greeting(user)}
    <p style="font-size:15px;color:#9898a6;line-height:1.7;margin-bottom:8px;">
      You requested a new email verification link. Use the button below to verify your
      email address. Your previous link has been invalidated.
    </p>
    ${primaryButton("Verify Email Address", verificationUrl)}
    ${expiryNote(60)}
    ${divider()}
    <p style="font-size:13px;color:#55555f;line-height:1.6;">
      If you didn't request this, someone may have entered your email by mistake —
      you can safely ignore this email.
    </p>
    ${fallbackUrl(verificationUrl)}
  `;

  await sendMail({
    to: user?.email ?? "",
    subject: "New verification link – Smart Boost Labs",
    text: `New verification link: ${verificationUrl}`,
    html: buildEmailShell(
      body,
      "Here's your new verification link — it replaces the previous one.",
      siteUrl,
    ),
  });
}

// ─────────────────────────────────────────────
// 3. Forgot Password (send reset link)
// ─────────────────────────────────────────────

export async function sendForgotPasswordEmail(
  user: Partial<User>,
  resetUrl: string,
  siteUrl: string,
) {
  const body = /* html */ `
    ${greeting(user)}
    <p style="font-size:15px;color:#9898a6;line-height:1.7;margin-bottom:8px;">
      We received a request to reset the password for your Smart Boost Labs account.
      Click the button below to choose a new password.
    </p>
    ${primaryButton("Reset My Password", resetUrl)}
    ${expiryNote(30)}
    ${divider()}
    <p style="font-size:13px;color:#55555f;line-height:1.6;">
      If you didn't request a password reset, your account may be at risk.
      We recommend you <a href="${siteUrl}/contact" style="color:#7c6ef7;">contact support</a> immediately.
    </p>
    ${fallbackUrl(resetUrl)}
  `;

  await sendMail({
    to: user?.email ?? "",
    subject: "Reset your password – Smart Boost Labs",
    text: `Reset your password: ${resetUrl}`,
    html: buildEmailShell(
      body,
      "You requested a password reset. Here's your secure link.",
      siteUrl,
    ),
  });
}

// ─────────────────────────────────────────────
// 4. Password Reset Confirmation (after success)
// ─────────────────────────────────────────────

export async function sendPasswordResetSuccessEmail(
  user: Partial<User>,
  siteUrl: string,
) {
  const timestamp = new Date().toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short",
  });

  const body = /* html */ `
    ${greeting(user)}
    <div style="background:#1e2d1e;border:1px solid #2d4a2d;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <p style="font-size:14px;color:#6fcf6f;font-weight:500;">✓ Your password has been successfully changed.</p>
    </div>
    <p style="font-size:15px;color:#9898a6;line-height:1.7;margin-bottom:8px;">
      Your Smart Boost Labs password was updated on <strong style="color:#e8e8ec;">${timestamp}</strong>.
      If this was you, no further action is needed.
    </p>
    ${divider()}
    <p style="font-size:14px;color:#e8633a;font-weight:500;">Wasn't you?</p>
    <p style="font-size:13px;color:#9898a6;margin-top:8px;line-height:1.6;">
      If you did not make this change, your account may have been compromised.
      Please <a href="${siteUrl}/contact" style="color:#7c6ef7;">contact support</a> immediately
      or use the forgot password flow to regain access.
    </p>
  `;

  await sendMail({
    to: user?.email ?? "",
    subject: "Your password was changed – Smart Boost Labs",
    text: "Your password has been successfully changed. If this wasn't you, contact support immediately.",
    html: buildEmailShell(
      body,
      "Your Smart Boost Labs password was just updated.",
      siteUrl,
    ),
  });
}

// ─────────────────────────────────────────────
// 5. Suspicious Activity Alert
// ─────────────────────────────────────────────

const SUSPICIOUS_LABELS: Record<SuspiciousActivityType, string> = {
  login: "New Sign-In Detected",
  change_password: "Password Changed",
  change_email: "Email Address Changed",
  api_key_reset: "API Key Reset",
  two_factor_disabled: "Two-Factor Authentication Disabled",
  unknown: "Unusual Activity Detected",
};

const SUSPICIOUS_DESCRIPTIONS: Record<SuspiciousActivityType, string> = {
  login:
    "A sign-in to your account was detected from a new device or location.",
  change_password: "Your account password was recently changed.",
  change_email: "The email address on your account was recently changed.",
  api_key_reset:
    "Your API key was reset. Any integrations using the old key will no longer work.",
  two_factor_disabled:
    "Two-factor authentication was disabled on your account, reducing its security.",
  unknown: "Unusual activity was detected on your Smart Boost Labs account.",
};

export async function sendSuspiciousActivityEmail(
  user: Partial<User>,
  payload: SuspiciousActivityPayload,
  siteUrl: string,
) {
  const label = SUSPICIOUS_LABELS[payload.type];
  const description = SUSPICIOUS_DESCRIPTIONS[payload.type];
  const timestamp = payload.timestamp.toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short",
  });

  const body = /* html */ `
    ${greeting(user)}

    <!-- Alert banner -->
    <div style="background:#2d1a1a;border:1px solid #5a2a2a;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <p style="font-size:13px;color:#e8633a;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">⚠ Security Alert</p>
      <p style="font-size:16px;font-weight:600;color:#f0b0a0;">${label}</p>
    </div>

    <p style="font-size:15px;color:#9898a6;line-height:1.7;margin-bottom:20px;">
      ${description} If this was you, no action is needed.
      If you don't recognize this activity, secure your account immediately.
    </p>

    <!-- Details -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
      style="background:#0f0f11;border:1px solid #2a2a33;border-radius:12px;overflow:hidden;margin-bottom:8px;">
      <tbody>
        ${infoRow("Activity", label)}
        ${infoRow("Time", timestamp)}
        ${infoRow("IP Address", `<span style="font-family:'DM Mono',monospace;">${payload.ip}</span>`)}
        ${payload.location ? infoRow("Country", payload.location.country || "Unknown") : ""}
        ${payload.location ? infoRow("City", payload.location.city || "Unknown") : ""}
        ${payload.location ? infoRow("Region", payload.location.region || "Unknown") : ""}
        ${payload.location ? infoRow("Postal Code", payload.location.zip || "Unknown") : ""}
        ${payload.location ? infoRow("Latitude", payload.location.lat || "Unknown") : ""}
        ${payload.location ? infoRow("Longitude", payload.location.lon || "Unknown") : ""}
        ${payload.userAgent ? infoRow("Device", payload.userAgent.substring(0, 48) + (payload.userAgent.length > 48 ? "…" : "")) : ""}
      </tbody>
    </table>

    ${warningButton("Secure My Account", payload.secureUrl)}

    ${divider()}
    <p style="font-size:13px;color:#55555f;line-height:1.6;">
      If this was you, you can safely ignore this alert.
      For any concerns, <a href="${siteUrl}/contact" style="color:#7c6ef7;">contact our security team</a>.
    </p>
  `;

  await sendMail({
    to: user?.email ?? "",
    subject: `Security Alert: ${label} – Smart Boost Labs`,
    text: `Security alert: ${label} detected on your account at ${timestamp} from IP ${payload.ip}. Secure your account: ${payload.secureUrl}`,
    html: buildEmailShell(
      body,
      `Security alert: ${label} detected on your account.`,
      siteUrl,
    ),
  });
}

export async function sendSuspendAccountEmail(
  user: Partial<User>,
  siteUrl: string,
) {
  const body = /* html */ `
    ${greeting(user)}
    <p style="font-size:15px;color:#9898a6;line-height:1.7;margin-bottom:8px;">
     We would like to inform you that your account with email ${user.email} has been temporarily disabled.
    </p>
    <p>
     If you need further assistance, please contact our support team.
    </p>
     ${divider()}
    ${primaryButton("Contact Support", `${siteUrl}/contact`)}
  `;

  await sendMail({
    to: user?.email ?? "",
    subject: `IMPORTANT: Notice of Your Account Suspension - Smart Boost Labs`,
    text: `Your account with email ${user.email} has been temporarily disabled.`,
    html: buildEmailShell(body, "", siteUrl),
  });
}

export async function sendAccountDeletingRequestEmail(
  user: Partial<User>,
  siteUrl: string,
) {
  const body = /* html */ `
    ${greeting(user)}
    <p style="font-size:15px;color:#9898a6;line-height:1.7;margin-bottom:8px;">
     As per your request, we would like to confirm that your account on Smart Boost Labs has been successfully deleted.
    </p>
     <p>
    All personal data, preferences, and history associated with your account have been removed from our systems in accordance with our privacy policy. We're sad to see you go, but if you change your mind and want to rejoin us in the future, you can always create a new account.
    </p>
    ${divider()}
    ${primaryButton("Contact Support", `${siteUrl}/contact`)}
  `;

  await sendMail({
    to: user?.email ?? "",
    subject: `Confirming Your Account Deletion - Smart Boost Labs`,
    text: `Your account with email ${user.email} has been successfully deleted.`,
    html: buildEmailShell(body, "", siteUrl),
  });
}

export async function sendPermanentlyDeleteAccountEmail(
  user: Partial<User>,
  siteUrl: string,
) {
  const body = /* html */ `
    ${greeting(user)}
    <p style="font-size:15px;color:#9898a6;line-height:1.7;margin-bottom:8px;">
     We are writing to inform you that your account with the email address ${user.email} has been deleted due to a violation of our Terms of Service related to suspicious activity or system tampering.
    </p>
     <p>
    This decision is final. All access to our services has been revoked, and associated data cannot be recovered. If you believe this is an error or have any questions, please contact our support team at ${siteUrl}/contact.
    </p>
    ${divider()}
    ${primaryButton("Contact Support", `${siteUrl}/contact`)}
  `;

  await sendMail({
    to: user?.email ?? "",
    subject: `Important Notice: Your Account Has Been Closed - Smart Boost Labs`,
    text: `We are writing to inform you that your account with the email address ${user.email} has been deleted due to a violation of our Terms of Service related to suspicious activity or system tampering.`,
    html: buildEmailShell(body, "", siteUrl),
  });
}

export async function sendContactSupportEmail(
  name: string,
  email: string,
  subject: string,
  message: string,
  payload: Partial<SuspiciousActivityPayload>,
  siteUrl: string,
  supportEmail: string,
) {
  const timestamp = payload?.timestamp?.toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short",
  });

  const body = /* html */ `
    <p style="font-size:15px;color:#9898a6;margin-bottom:8px;">Hello,</p>
    <h1 style="font-size:24px;font-weight:600;color:#e8e8ec;margin-bottom:20px;line-height:1.3;">Support Team 👋</h1>

    <p style="font-size:15px;color:#9898a6;line-height:1.7;margin-bottom:20px;">
      There's a new message coming in via the Contact Us form on the website! Here are the details:
    </p>

    <!-- Details -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
      style="background:#0f0f11;border:1px solid #2a2a33;border-radius:12px;overflow:hidden;margin-bottom:8px;">
      <tbody>
        ${infoRow("Name", name)}
        ${infoRow("Email", email)}
        ${infoRow("Subject", subject)}
        ${infoRow("IP Address", `<span style="font-family:'DM Mono',monospace;">${payload.ip}</span>`)}
        ${payload.location ? infoRow("Country", payload.location.country || "Unknown") : ""}
        ${payload.location ? infoRow("City", payload.location.city || "Unknown") : ""}
        ${payload.location ? infoRow("Region", payload.location.region || "Unknown") : ""}
        ${payload.location ? infoRow("Postal Code", payload.location.zip || "Unknown") : ""}
        ${payload.location ? infoRow("Latitude", payload.location.lat || "Unknown") : ""}
        ${payload.location ? infoRow("Longitude", payload.location.lon || "Unknown") : ""}
        ${payload.userAgent ? infoRow("Device", payload.userAgent.substring(0, 48) + (payload.userAgent.length > 48 ? "…" : "")) : ""}
      </tbody>
    </table>
    ${divider()}
    <p style="font-size:15px;color:#9898a6;margin-bottom:8px;">Message/Question:</p>
    <p style="font-size:15px;color:#9898a6;line-height:1.7;margin-bottom:20px;">
    ${message}
    </p>

    ${divider()}
    <p style="font-size:15px;color:#9898a6;margin-bottom:8px;">Action:</p>
    <p style="font-size:13px;color:#55555f;line-height:1.6;">
      Please respond to this request within 24 hours.
    </p>
  `;

  await sendMail({
    to: supportEmail,
    subject: `${subject} – Smart Boost Labs`,
    text: `New message from ${name} on your account at ${timestamp} from IP ${payload.ip}. Secure your account: ${payload.secureUrl}`,
    html: buildEmailShell(
      body,
      `New message from ${name} on ${subject} on your account.`,
      siteUrl,
    ),
  });
}

export async function sendIviteUserEmail(
  user: Partial<User>,
  siteUrl: string,
  password: string,
  supportEmail: string,
) {
  const body = /* html */ `
     ${greeting(user)}

    <p style="font-size:15px;color:#9898a6;line-height:1.7;margin-bottom:20px;">
      Welcome to Smart Boost Labs! We've registered your account to access the Smart Boost Labs Portal App, our platform that makes it easy for you to create a smarter, more efficient, and higher-quality traffic network for businesses worldwide.
    </p>
    <p style="font-size:15px;color:#9898a6;line-height:1.7;margin-bottom:20px;">
      To start using your account, please follow these easy steps:
    </p>
    <ul style="font-size:15px;color:#9898a6;line-height:1.7;margin-bottom:20px;">
      <li>Click the invitation link or button to activate your account.</li>
      <li>Log in to your account using the email address and password you received.</li>
      <li>Explore the features of the Smart Boost Labs Portal App to start using it.</li>
    </ul>
    <!-- Details -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
      style="background:#0f0f11;border:1px solid #2a2a33;border-radius:12px;overflow:hidden;margin-bottom:8px;">
      <tbody>
        ${infoRow("Name", user?.name || "")}
        ${infoRow("Email", user?.email || "")}
        ${infoRow("Password", `<span style="font-family:'DM Mono',monospace;">${password}</span>`)}
      </tbody>
    </table>
     ${divider()}
     ${primaryButton("Activate My Account", `${siteUrl}/login`)}
    ${divider()}
    <p style="font-size:15px;color:#9898a6;line-height:1.7;margin-bottom:20px;">
      This activation link is valid for 48 hours. If you have any questions or encounter any issues, please contact our support team at ${supportEmail} or reply to this email.
    </p>
  `;

  await sendMail({
    to: user?.email || "",
    subject: `Invitation to join membership – Smart Boost Labs`,
    text: `Invitation to join membership – Smart Boost Labs`,
    html: buildEmailShell(body, `Account invitation`, siteUrl),
  });
}

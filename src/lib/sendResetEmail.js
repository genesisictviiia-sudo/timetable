import {
  PASSWORD_RESET_FROM_EMAIL,
  PASSWORD_RESET_FROM_NAME,
} from "./resetEmailConfig";

const EMAILJS_SEND_URL = "https://api.emailjs.com/api/v1.0/email/send";

export function isEmailJsConfigured() {
  return Boolean(
    import.meta.env.VITE_EMAILJS_SERVICE_ID &&
      import.meta.env.VITE_EMAILJS_TEMPLATE_ID &&
      import.meta.env.VITE_EMAILJS_PUBLIC_KEY
  );
}

/**
 * Send the reset code to the user's email via EmailJS.
 * Returns { delivered: true } on success, or { delivered: false } when not configured / failed.
 */
export async function sendPasswordResetEmail(toEmail, resetCode) {
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

  if (!serviceId || !templateId || !publicKey) {
    return { delivered: false, reason: "not_configured" };
  }

  try {
    const response = await fetch(EMAILJS_SEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: {
          to_email: toEmail,
          from_email: PASSWORD_RESET_FROM_EMAIL,
          from_name: PASSWORD_RESET_FROM_NAME,
          reply_to: PASSWORD_RESET_FROM_EMAIL,
          reset_code: resetCode,
          subject: "Campus Scheduler – Password reset code",
          message: [
            "You requested a password reset for Campus Scheduler.",
            "",
            `Your reset code is: ${resetCode}`,
            "",
            "This code expires in 15 minutes.",
            "",
            "If you did not request this, you can ignore this email.",
          ].join("\n"),
        },
      }),
    });

    if (!response.ok) {
      let detail = "";
      try {
        const text = await response.text();
        console.error("EmailJS error response:", response.status, text);
        const body = JSON.parse(text);
        detail = body?.message || body?.error || text || "";
      } catch (parseErr) {
        detail = String(parseErr?.message || "EmailJS returned an error.");
      }
      return {
        delivered: false,
        reason: "send_failed",
        detail: detail || `EmailJS HTTP ${response.status}`,
      };
    }

    return { delivered: true };
  } catch (err) {
    return {
      delivered: false,
      reason: "send_failed",
      detail: err.message || "Network error while sending email.",
    };
  }
}

import {
  PASSWORD_RESET_FROM_EMAIL,
  PASSWORD_RESET_FROM_NAME,
} from "./resetEmailConfig";

const EMAILJS_SEND_URL = "https://api.emailjs.com/api/v1.0/email/send";

/**
 * Send the reset code to the user's email via EmailJS.
 * Connect admin.campusscheduler@gmail.com as the Gmail service in EmailJS.
 */
export async function sendPasswordResetEmail(toEmail, resetCode) {
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

  if (!serviceId || !templateId || !publicKey) {
    throw new Error(
      "Email service is not configured. Add VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, and VITE_EMAILJS_PUBLIC_KEY to your .env file."
    );
  }

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
      const body = await response.json();
      detail = body?.message || body?.error || "";
    } catch {
      detail = await response.text().catch(() => "");
    }
    throw new Error(
      detail
        ? `Could not send reset email: ${detail}`
        : "Could not send reset email. Check EmailJS configuration."
    );
  }
}

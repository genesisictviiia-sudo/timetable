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

async function sendViaEmailJs(toEmail, passcode, time) {
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
          email: toEmail,        // matches {{email}} in template
          passcode,              // matches {{passcode}} in template
          time,                  // matches {{time}} in template
        },
      }),
    });

    // Read body once as text, then optionally parse as JSON
    const rawText = await response.text().catch(() => "");
    if (!response.ok) {
      let detail = rawText;
      try {
        const body = JSON.parse(rawText);
        detail = body?.message || body?.error || body?.status || rawText;
      } catch { /* keep rawText */ }
      return {
        delivered: false,
        reason: "send_failed",
        detail: detail || `HTTP ${response.status}`,
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

export async function sendPasswordResetEmail(toEmail, resetCode) {
  return sendViaEmailJs(toEmail, resetCode, "15 minutes");
}

export async function sendSubscriptionEnquiry({ name, email, mobile }) {
  // Enquiries may use a completely separate EmailJS account (its own service,
  // template and public key); anything not set falls back to the main account.
  const serviceId =
    import.meta.env.VITE_EMAILJS_ENQUIRY_SERVICE_ID || import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const enquiryTemplateId = import.meta.env.VITE_EMAILJS_ENQUIRY_TEMPLATE_ID;
  const otpTemplateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
  const templateId = enquiryTemplateId || otpTemplateId;
  const publicKey =
    import.meta.env.VITE_EMAILJS_ENQUIRY_PUBLIC_KEY || import.meta.env.VITE_EMAILJS_PUBLIC_KEY;
  if (!serviceId || !templateId || !publicKey) return { delivered: false, reason: "not_configured" };

  const templateParams = enquiryTemplateId
    ? {
        // Dedicated enquiry template variables
        email: PASSWORD_RESET_FROM_EMAIL, // To: admin inbox
        name,
        user_email: email,
        mobile,
      }
    : {
        // Legacy fallback via the OTP template
        email: PASSWORD_RESET_FROM_EMAIL,
        passcode: `Name: ${name} | Email: ${email} | Mobile: ${mobile}`,
        time: "Prime Subscription Enquiry",
      };

  try {
    const response = await fetch(EMAILJS_SEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: templateParams,
      }),
    });
    const rawText = await response.text().catch(() => "");
    if (!response.ok) return { delivered: false, reason: "send_failed", detail: rawText };
    return { delivered: true };
  } catch (err) {
    return { delivered: false, reason: "send_failed", detail: err.message };
  }
}

export async function sendSignupOtpEmail(toEmail, userId, otp) {
  return sendViaEmailJs(toEmail, otp, "30 minutes");
}

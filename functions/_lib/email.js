// Отправка писем через Resend (https://resend.com).
// Ключ берётся из env.RESEND_API_KEY (секрет). Если ключа нет —
// письмо не отправляется, а ссылка выводится в лог (режим разработки).
// К каждому письму прикладываем и HTML, и plain-text версию — это заметно
// улучшает доставляемость (письма без текстовой части чаще попадают в спам).

export async function sendVerificationEmail(env, toEmail, verifyUrl) {
  const subject = "Подтвердите почту — AniToki";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
      <h2 style="color:#7c3aed">AniToki</h2>
      <p>Привет! Чтобы активировать аккаунт, подтвердите адрес электронной почты.</p>
      <p style="margin:24px 0">
        <a href="${verifyUrl}"
           style="background:#7c3aed;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">
          Подтвердить почту
        </a>
      </p>
      <p style="color:#666;font-size:13px">Или скопируйте ссылку:<br>${verifyUrl}</p>
      <p style="color:#999;font-size:12px">Ссылка действует 24 часа. Если вы не регистрировались — просто проигнорируйте письмо.</p>
    </div>`;
  const text = [
    "AniToki",
    "",
    "Привет! Чтобы активировать аккаунт, подтвердите адрес электронной почты, перейдя по ссылке:",
    verifyUrl,
    "",
    "Ссылка действует 24 часа. Если вы не регистрировались — просто проигнорируйте письмо.",
  ].join("\n");

  if (!env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY не задан — ссылка подтверждения:", verifyUrl);
    return { ok: true, dev: true };
  }
  return sendEmail(env, toEmail, subject, html, text);
}

export async function sendPasswordResetEmail(env, toEmail, resetUrl) {
  const subject = "Сброс пароля — AniToki";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
      <h2 style="color:#7c3aed">AniToki</h2>
      <p>Вы запросили смену пароля. Нажмите кнопку, чтобы задать новый пароль.</p>
      <p style="margin:24px 0">
        <a href="${resetUrl}"
           style="background:#7c3aed;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">
          Сменить пароль
        </a>
      </p>
      <p style="color:#666;font-size:13px">Или скопируйте ссылку:<br>${resetUrl}</p>
      <p style="color:#999;font-size:12px">Ссылка действует 1 час. Если вы не запрашивали смену — просто проигнорируйте письмо, пароль останется прежним.</p>
    </div>`;
  const text = [
    "AniToki",
    "",
    "Вы запросили смену пароля. Задайте новый пароль, перейдя по ссылке:",
    resetUrl,
    "",
    "Ссылка действует 1 час. Если вы не запрашивали смену — просто проигнорируйте письмо, пароль останется прежним.",
  ].join("\n");

  if (!env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY не задан — ссылка сброса пароля:", resetUrl);
    return { ok: true, dev: true };
  }
  return sendEmail(env, toEmail, subject, html, text);
}

async function sendEmail(env, toEmail, subject, html, text) {
  const from = env.MAIL_FROM || "AniToki <onboarding@resend.dev>";
  const payload = { from, to: [toEmail], subject, html };
  if (text) payload.text = text;
  // валидный Reply-To улучшает доставляемость
  const replyAddr = (from.match(/<([^>]+)>/) || [null, from])[1];
  if (replyAddr) payload.reply_to = replyAddr;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.log("[email] Resend ошибка:", res.status, errText);
    return { ok: false };
  }
  return { ok: true };
}

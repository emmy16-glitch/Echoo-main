// Centralized Echoo email templates.
//
// Every Echoo email flows through the same branded layout so the product voice
// and security wording stay consistent. All user-controlled values are HTML
// escaped before interpolation — never build email HTML by string-concatenating
// raw request or database values.

const BRAND = {
  colorPrimary: '#265DFF',
  colorText: '#101828',
  colorMuted: '#667085',
  colorBorder: '#EAECF0',
  colorBackground: '#F4F6FB',
  colorSurface: '#FFFFFF',
  colorDanger: '#B42318',
  fontFamily: 'Arial, Helvetica, sans-serif',
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const displayName = (name) => escapeHtml(name || '');

const firstGreeting = (name) => {
  const first = String(name || '').trim().split(/\s+/)[0];
  return first ? escapeHtml(first) : 'there';
};

const button = (label, href) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding: 8px 0 4px">
        <a href="${escapeHtml(href)}" style="
          display:inline-block;
          background-color:${BRAND.colorPrimary};
          color:#FFFFFF;
          font-size:15px;
          font-weight:700;
          text-decoration:none;
          padding:14px 30px;
          border-radius:8px;
          letter-spacing:0.2px;
        ">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>
`;

const renderLayout = ({ title, preheader, bodyHtml }) => `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.colorBackground};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.colorBackground};">
    <tr>
      <td align="center" style="padding:36px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
          <tr>
            <td style="padding:0 0 20px;" align="left">
              <span style="font-family:${BRAND.fontFamily};font-size:22px;font-weight:800;color:${BRAND.colorText};letter-spacing:-0.3px;">Echoo <span style="font-weight:400;">🎧</span></span>
            </td>
          </tr>
          <tr>
            <td style="background-color:${BRAND.colorSurface};border:1px solid ${BRAND.colorBorder};border-radius:16px;padding:36px 32px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 8px 0;text-align:center;">
              <p style="font-family:${BRAND.fontFamily};font-size:12px;line-height:18px;color:${BRAND.colorMuted};margin:0;">
                You received this email because you have an Echoo account.<br />
                &copy; ${new Date().getFullYear()} Echoo. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const mutedNote = (text) => `
  <p style="font-family:${BRAND.fontFamily};font-size:13px;line-height:20px;color:${BRAND.colorMuted};margin:24px 0 0;border-top:1px solid ${BRAND.colorBorder};padding-top:20px;">${text}</p>
`;

export function passwordResetEmail({ name = '', resetUrl = '', expiresInMinutes = 15 }) {
  const subject = 'Reset your Echoo password';
  const text = [
    `Hello ${firstGreeting(name)},`,
    '',
    'Someone requested a password reset for your Echoo account.',
    `Reset your password: ${resetUrl}`,
    '',
    `This link expires in ${expiresInMinutes} minutes.`,
    "If this wasn't you, ignore this email.",
  ].join('\n');

  const html = renderLayout({
    title: subject,
    preheader: `Reset your password using this link. It expires in ${expiresInMinutes} minutes.`,
    bodyHtml: `
      <h1 style="font-family:${BRAND.fontFamily};font-size:22px;font-weight:800;color:${BRAND.colorText};margin:0 0 8px;">Reset your password</h1>
      <p style="font-family:${BRAND.fontFamily};font-size:15px;line-height:24px;color:${BRAND.colorText};margin:0 0 24px;">
        Hello ${firstGreeting(name)},<br /><br />
        Someone requested a password reset for your Echoo account. Use the button below to choose a new password.
      </p>
      ${button('Reset Password', resetUrl)}
      ${mutedNote(`This link expires in ${expiresInMinutes} minutes. If this wasn't you, ignore this email and your password will stay the same.`)}
    `,
  });

  return { subject, html, text };
}

export function welcomeEmail({ name = '' }) {
  const subject = 'Welcome to Echoo 🎧';
  const text = [
    `Hello ${firstGreeting(name)},`,
    '',
    'Welcome to Echoo! Your account is ready.',
    '',
    '- Start listening right away and discover live Channels, podcasts and more.',
    '- Create your own Channel anytime and start broadcasting to the world.',
    '',
    'We are glad to have you on board.',
  ].join('\n');

  const html = renderLayout({
    title: subject,
    preheader: 'Your Echoo account is ready. Start listening right away.',
    bodyHtml: `
      <h1 style="font-family:${BRAND.fontFamily};font-size:22px;font-weight:800;color:${BRAND.colorText};margin:0 0 8px;">Welcome to Echoo 🎧</h1>
      <p style="font-family:${BRAND.fontFamily};font-size:15px;line-height:24px;color:${BRAND.colorText};margin:0 0 24px;">
        Hello ${firstGreeting(name)},<br /><br />
        Your account is ready. You can start listening immediately — tune into live Channels, explore podcasts, and build your library.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-family:${BRAND.fontFamily};font-size:14px;line-height:22px;color:${BRAND.colorText};padding:12px 0;">
            <strong>Listen now</strong><br />
            <span style="color:${BRAND.colorMuted};">Dive into live audio and recordings from creators around the world.</span>
          </td>
        </tr>
        <tr>
          <td style="font-family:${BRAND.fontFamily};font-size:14px;line-height:22px;color:${BRAND.colorText};padding:12px 0;">
            <strong>Create a Channel anytime</strong><br />
            <span style="color:${BRAND.colorMuted};">When you are ready, turn on your Creator capability and start broadcasting.</span>
          </td>
        </tr>
      </table>
      ${mutedNote('This is a one-time welcome message for your new Echoo account.')}
    `,
  });

  return { subject, html, text };
}

export function passwordChangedEmail({ name = '', timestamp = new Date() }) {
  const when = new Date(timestamp).toLocaleString('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  const subject = 'Your Echoo password was changed';
  const text = [
    `Hello ${firstGreeting(name)},`,
    '',
    'Your Echoo account password was changed.',
    `Time: ${when}`,
    '',
    "If you didn't make this change, reset your password immediately and contact Echoo support.",
  ].join('\n');

  const html = renderLayout({
    title: subject,
    preheader: 'Your Echoo password was changed.',
    bodyHtml: `
      <h1 style="font-family:${BRAND.fontFamily};font-size:22px;font-weight:800;color:${BRAND.colorText};margin:0 0 8px;">Password changed</h1>
      <p style="font-family:${BRAND.fontFamily};font-size:15px;line-height:24px;color:${BRAND.colorText};margin:0 0 24px;">
        Hello ${firstGreeting(name)},<br /><br />
        The password for your Echoo account was changed.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.colorBackground};border-radius:8px;margin:0 0 24px;">
        <tr>
          <td style="font-family:${BRAND.fontFamily};font-size:13px;color:${BRAND.colorMuted};padding:12px 16px;text-transform:uppercase;letter-spacing:0.5px;">Time</td>
        </tr>
        <tr>
          <td style="font-family:${BRAND.fontFamily};font-size:15px;color:${BRAND.colorText};padding:0 16px 14px;font-weight:600;">${escapeHtml(when)}</td>
        </tr>
      </table>
      ${mutedNote(`If this wasn't you, reset your password right away and review your account security.`)}
    `,
  });

  return { subject, html, text };
}

export function newSignInEmail({ name = '', device = 'Unknown device', location = 'Unknown location', timestamp = new Date() }) {
  const when = new Date(timestamp).toLocaleString('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  const subject = 'New sign-in to your Echoo account';
  const text = [
    `Hello ${firstGreeting(name)},`,
    '',
    'A new sign-in to your Echoo account was detected.',
    `Device: ${device}`,
    `Location: ${location}`,
    `Time: ${when}`,
    '',
    "If this wasn't you, reset your password immediately.",
  ].join('\n');

  const html = renderLayout({
    title: subject,
    preheader: `New sign-in detected from ${device}.`,
    bodyHtml: `
      <h1 style="font-family:${BRAND.fontFamily};font-size:22px;font-weight:800;color:${BRAND.colorText};margin:0 0 8px;">New sign-in detected</h1>
      <p style="font-family:${BRAND.fontFamily};font-size:15px;line-height:24px;color:${BRAND.colorText};margin:0 0 24px;">
        Hello ${firstGreeting(name)},<br /><br />
        A new sign-in to your Echoo account was detected. Here are the details:
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
        <tr>
          <td style="font-family:${BRAND.fontFamily};font-size:13px;color:${BRAND.colorMuted};padding:10px 16px;background-color:${BRAND.colorBackground};text-transform:uppercase;letter-spacing:0.5px;">Device</td>
        </tr>
        <tr>
          <td style="font-family:${BRAND.fontFamily};font-size:15px;color:${BRAND.colorText};padding:0 16px 12px;font-weight:600;">${escapeHtml(device)}</td>
        </tr>
        <tr>
          <td style="font-family:${BRAND.fontFamily};font-size:13px;color:${BRAND.colorMuted};padding:10px 16px;background-color:${BRAND.colorBackground};text-transform:uppercase;letter-spacing:0.5px;">Location</td>
        </tr>
        <tr>
          <td style="font-family:${BRAND.fontFamily};font-size:15px;color:${BRAND.colorText};padding:0 16px 12px;font-weight:600;">${escapeHtml(location)}</td>
        </tr>
        <tr>
          <td style="font-family:${BRAND.fontFamily};font-size:13px;color:${BRAND.colorMuted};padding:10px 16px;background-color:${BRAND.colorBackground};text-transform:uppercase;letter-spacing:0.5px;">Time</td>
        </tr>
        <tr>
          <td style="font-family:${BRAND.fontFamily};font-size:15px;color:${BRAND.colorText};padding:0 16px 12px;font-weight:600;">${escapeHtml(when)}</td>
        </tr>
      </table>
      ${mutedNote(`If this wasn't you, reset your password immediately and review your account security.`)}
    `,
  });

  return { subject, html, text };
}

export function verificationCodeEmail({ code = '', expiresInMinutes = 10 }) {
  const subject = 'Verify your Echoo email';
  const text = [
    `Your Echoo verification code is ${code}.`,
    `It expires in ${expiresInMinutes} minutes.`,
    'If you did not create this account, you can ignore this email.',
  ].join('\n');

  const html = renderLayout({
    title: subject,
    preheader: `Your verification code is ${code}.`,
    bodyHtml: `
      <h1 style="font-family:${BRAND.fontFamily};font-size:22px;font-weight:800;color:${BRAND.colorText};margin:0 0 8px;">Verify your email</h1>
      <p style="font-family:${BRAND.fontFamily};font-size:15px;line-height:24px;color:${BRAND.colorText};margin:0 0 8px;">
        Use this code to finish creating your Echoo account:
      </p>
      <p style="font-family:${BRAND.fontFamily};font-size:32px;font-weight:800;letter-spacing:8px;color:${BRAND.colorText};margin:24px 0;text-align:center;">${escapeHtml(code)}</p>
      <p style="font-family:${BRAND.fontFamily};font-size:13px;line-height:20px;color:${BRAND.colorMuted};margin:0;">
        This code expires in ${expiresInMinutes} minutes. If you did not create this account, you can ignore this email.
      </p>
    `,
  });

  return { subject, html, text };
}

'use strict'
/* Branded, plain-English emails. No bank data in any email, ever. */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function layout ({ preheader, title, body, button, footer }) {
  const btn = button
    ? `<tr><td style="padding:8px 0 24px"><a href="${esc(button.url)}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#06b6d4);color:#ffffff;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:999px;font-size:16px">${esc(button.label)}</a></td></tr>`
    : ''
  return `<!doctype html><html><body style="margin:0;background:#f4f5fb;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1e1b4b">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader || '')}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5fb;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 30px rgba(30,27,75,.08)">
<tr><td style="background:linear-gradient(135deg,#312e81,#4f46e5 55%,#06b6d4);padding:22px 28px;color:#fff">
<div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.85">Jones Engineering</div>
<div style="font-size:22px;font-weight:800;margin-top:4px">${esc(title)}</div></td></tr>
<tr><td style="padding:24px 28px 4px;font-size:15px;line-height:1.6">${body}</td></tr>
<tr><td style="padding:0 28px">${btn ? `<table role="presentation">${btn}</table>` : ''}</td></tr>
<tr><td style="padding:0 28px 24px;font-size:12px;color:#6b7280;line-height:1.5">${footer || 'Jones Engineering will never ask you for a password or for bank details by email. If anything looks wrong, call your Jones contact on a number you already know.'}</td></tr>
</table>
<div style="font-size:11px;color:#9ca3af;margin-top:12px">H. A. O'Neil Limited (Jones Engineering) · Jones Engineering House, 83 Pembroke Road, Dublin 4</div>
</td></tr></table></body></html>`
}

const p = s => `<p style="margin:0 0 14px">${s}</p>`

const T = {
  invite: d => ({
    subject: `Jones Engineering: please set up your supplier account (${d.ref})`,
    html: layout({
      preheader: 'About 10 minutes, on any device.',
      title: 'Let\'s set up your supplier account',
      body: p(`Hello ${esc(d.contactName)},`) +
        p(`${esc(d.requesterName)} at Jones Engineering would like to set up <b>${esc(d.companyName)}</b> as a supplier. Your reference is <b>${esc(d.ref)}</b>.`) +
        p('It takes about 10 minutes and works on your phone. Your answers save as you go, so you can stop and come back.') +
        p(`When you open the link we'll email you a 6-digit code to confirm it's you. The link expires on ${esc(d.expires)}.`),
      button: { label: 'Start my supplier set-up', url: d.link },
    }),
    text: `Hello ${d.contactName},\n\n${d.requesterName} at Jones Engineering would like to set up ${d.companyName} as a supplier (ref ${d.ref}).\nOpen this link to start (expires ${d.expires}):\n${d.link}\n\nWe'll email you a 6-digit code when you open it.\nJones will never ask for a password or bank details by email.`,
  }),
  otp: d => ({
    subject: `Your Jones code: ${d.code}`,
    html: layout({
      preheader: `Your code is ${d.code}`,
      title: 'Your one-time code',
      body: p('Use this code to continue your supplier set-up:') +
        `<div style="font-size:36px;font-weight:800;letter-spacing:.35em;background:#eef2ff;color:#312e81;border-radius:14px;padding:16px 20px;text-align:center;margin:6px 0 18px">${esc(d.code)}</div>` +
        p(`It works for ${esc(d.minutes)} minutes. If you didn't ask for it, you can ignore this email.`),
    }),
    text: `Your Jones code is ${d.code}. It works for ${d.minutes} minutes.`,
  }),
  receiptVendor: d => ({
    subject: `We've received your details (${d.ref})`,
    html: layout({
      title: 'Thank you, we have your details',
      body: p(`Thanks for completing your supplier set-up for <b>${esc(d.companyName)}</b>. Your reference is <b>${esc(d.ref)}</b>.`) +
        p('Our team will now review it and confirm your bank details by phone. We\'ll email you when your account is ready. You can check progress any time with your link.'),
    }),
    text: `Thanks. We have your details for ${d.companyName} (ref ${d.ref}). We'll email you when your account is ready.`,
  }),
  submittedRequester: d => ({
    subject: `${d.companyName} has submitted their details`,
    html: layout({
      title: 'Supplier details submitted',
      body: p(`<b>${esc(d.companyName)}</b> (${esc(d.ref)}) has submitted their supplier details.`) +
        p(`Next: ${esc(d.nextStepLabel || 'requester review')}. Route: ${esc(d.routeSummary || '')}`),
      button: { label: 'Review the request', url: d.link },
    }),
    text: `${d.companyName} (${d.ref}) has submitted. Next: ${d.nextStepLabel || 'requester review'}. Route: ${d.routeSummary || ''}. ${d.link}`,
  }),
  task: d => ({
    subject: `${d.prefix || ''}Vendor ${d.companyName} is waiting for your ${d.stepLabel.toLowerCase()}`,
    html: layout({
      title: d.prefix ? d.prefix.replace(/[:\s]+$/, '') : 'Waiting for you',
      body: p(`<b>${esc(d.companyName)}</b> (${esc(d.ref)}) is waiting for: <b>${esc(d.stepLabel)}</b>.`) +
        (d.routeSummary ? p(`Route: ${esc(d.routeSummary)}`) : '') +
        (d.waitingDays ? p(`It has been waiting ${esc(d.waitingDays)} working day(s).`) : '') +
        p('Anyone in your team can pick it up.'),
      button: { label: 'Open the request', url: d.link },
    }),
    text: `${d.prefix || ''}${d.companyName} (${d.ref}) is waiting for ${d.stepLabel}. Route: ${d.routeSummary || ''}. ${d.link}`,
  }),
  sentBack: d => ({
    subject: `A few changes needed on your supplier details (${d.ref})`,
    html: layout({
      title: 'A few changes needed',
      body: p(`Hello ${esc(d.contactName)},`) +
        p('Jones Engineering has looked at your details and needs a few changes:') +
        `<div style="background:#fff7ed;border-left:4px solid #f59e0b;border-radius:10px;padding:12px 16px;margin:0 0 16px">${esc(d.message)}</div>` +
        p('Open your link, make the changes (we\'ve highlighted where) and submit again.'),
      button: { label: 'Make the changes', url: d.link },
    }),
    text: `Jones needs a few changes on ${d.ref}:\n${d.message}\nOpen: ${d.link}`,
  }),
  rejectedVendor: d => ({
    subject: `Update on your supplier set-up (${d.ref})`,
    html: layout({
      title: 'Update on your application',
      body: p(`Hello ${esc(d.contactName)},`) +
        p(`Thank you for your interest in supplying Jones Engineering. We're not able to set up an account for <b>${esc(d.companyName)}</b> at this time.`) +
        p('If you have questions, please contact the person at Jones who invited you.'),
    }),
    text: `We're not able to set up an account for ${d.companyName} (${d.ref}) at this time. Please contact your Jones contact with any questions.`,
  }),
  rejectedRequester: d => ({
    subject: `Rejected: ${d.companyName} (${d.ref})`,
    html: layout({
      title: 'Request rejected',
      body: p(`<b>${esc(d.companyName)}</b> (${esc(d.ref)}) was rejected by ${esc(d.by)}.`) +
        `<div style="background:#f3f4f6;border-radius:10px;padding:12px 16px;margin:0 0 16px">${esc(d.reason)}</div>`,
      button: { label: 'Open the request', url: d.link },
    }),
    text: `${d.companyName} (${d.ref}) was rejected by ${d.by}: ${d.reason}`,
  }),
  createdRequester: d => ({
    subject: `🎉 ${d.companyName} is set up in SAP: vendor ${d.vendorNumber}`,
    html: layout({
      title: 'Vendor created in SAP',
      body: p(`<b>${esc(d.companyName)}</b> is now vendor <b style="font-size:20px">${esc(d.vendorNumber)}</b> in company code ${esc(d.companyCode)}.`) +
        p('The completed FIN-010 form with the full approval trail is attached to the vendor in SAP.'),
      button: { label: 'See the request', url: d.link },
    }),
    text: `${d.companyName} is vendor ${d.vendorNumber} in ${d.companyCode}.`,
  }),
  createdVendor: d => ({
    subject: `Your Jones Engineering supplier account is ready (${d.vendorNumber})`,
    html: layout({
      title: 'You\'re all set! 🎉',
      body: p(`Hello ${esc(d.contactName)},`) +
        p(`Your supplier account for <b>${esc(d.companyName)}</b> is ready. Your Jones account number is:`) +
        `<div style="font-size:32px;font-weight:800;background:#ecfdf5;color:#065f46;border-radius:14px;padding:14px 20px;text-align:center;margin:6px 0 18px">${esc(d.vendorNumber)}</div>` +
        p('Please quote it on every invoice to Jones Engineering. Thank you!'),
    }),
    text: `Your Jones supplier account for ${d.companyName} is ready. Account number: ${d.vendorNumber}. Please quote it on every invoice.`,
  }),
  sapError: d => ({
    subject: `SAP error on ${d.companyName} (${d.ref})`,
    html: layout({
      title: 'SAP could not create a vendor',
      body: p(`<b>${esc(d.companyName)}</b> (${esc(d.ref)}) could not be created in SAP.`) +
        `<div style="background:#fef2f2;border-left:4px solid #ef4444;border-radius:10px;padding:12px 16px;margin:0 0 16px">${esc(d.message)}</div>`,
      button: { label: 'Open the SAP errors queue', url: d.link },
    }),
    text: `SAP could not create ${d.companyName} (${d.ref}): ${d.message}\n${d.link}`,
  }),
}

module.exports = { T, esc }

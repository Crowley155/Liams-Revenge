/**
 * Opens a print-friendly window for a KORA letter or battle card.
 * The user can then "Save as PDF" from the browser print dialog.
 */
export function printDocument({ title, body, meta = {} }) {
  const w = window.open('', '_blank', 'width=800,height=1000');
  if (!w) return;

  const metaLines = Object.entries(meta)
    .filter(([, v]) => v)
    .map(([k, v]) => `<p style="margin:0;font-size:12px;color:#555"><strong>${k}:</strong> ${v}</p>`)
    .join('');

  w.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <style>
    @media print { body { margin: 0.75in; } }
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 13px; line-height: 1.7; color: #222; max-width: 700px; margin: 40px auto; padding: 0 20px; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    .meta { margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #ccc; }
    .body-text { white-space: pre-wrap; }
    @media print {
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="meta">${metaLines}</div>
  <div class="body-text">${body}</div>
  <div class="no-print" style="margin-top:40px;text-align:center">
    <button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer;background:#4f46e5;color:white;border:none;border-radius:6px">
      Print / Save as PDF
    </button>
  </div>
</body>
</html>`);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

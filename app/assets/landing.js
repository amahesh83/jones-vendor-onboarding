fetch('/api/dev/personas').then(r => {
  if (r.ok) document.getElementById('devnote').innerHTML = '🧪 Demo mode: no real SAP and no real emails. Open the <a href="/internal/#/mailbox">test mailbox</a> to see the invite emails and codes.'
}).catch(() => {})

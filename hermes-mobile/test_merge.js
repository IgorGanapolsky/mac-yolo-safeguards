const gatewayUrl = 'http://192.168.12.138:8642';
const apiKey = 'sk-hermes-api-server-key-2026-06-15';

async function run() {
  const base = gatewayUrl;
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/json'
  };

  // 1. Fetch sessions
  const sessRes = await fetch(`${base}/api/sessions?limit=50`, { headers });
  const sessData = await sessRes.json();
  const sessions = sessData.data || [];
  
  // Filter Telegram sessions
  const telegramSessions = sessions.filter(s => {
    if (s.id === '__telegram_inbox__') return false;
    const source = (s.source || '').toLowerCase();
    if (source.includes('telegram')) return true;
    const haystack = `${s.title || ''} ${s.preview || ''}`.toLowerCase();
    return haystack.includes('telegram');
  });

  console.log(`Found ${telegramSessions.length} Telegram sessions:`, telegramSessions.map(s => s.id));

  // Fetch messages for each
  for (const session of telegramSessions.slice(0, 5)) {
    console.log(`\n--- Session: ${session.id} (${session.title}) ---`);
    const msgRes = await fetch(`${base}/api/sessions/${session.id}/messages`, { headers });
    const msgData = await msgRes.json();
    const history = msgData.data || [];
    console.log(`Total messages in DB: ${history.length}`);
    
    // Test filter logic
    const filtered = history.filter(m => {
      const role = (m.role || '').toLowerCase();
      const isVisible = !(role === 'tool' || role === 'session_meta' || role === 'function' || role === 'tool_result');
      return role === 'user' || role === 'assistant';
    });
    console.log(`Filtered messages (user/assistant only): ${filtered.length}`);
    filtered.forEach(m => {
      console.log(`  [${m.role}] ${String(m.content || '').slice(0, 100)}`);
    });
  }
}

run().catch(console.error);

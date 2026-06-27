const WebSocket = require('/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/hermes-mobile/node_modules/ws');

const wsUrl = 'ws://127.0.0.1:8642/v1/events';
console.log('Connecting to', wsUrl);

const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  console.log('CONNECTED successfully to events WebSocket');
});

ws.on('message', (data) => {
  console.log('RECEIVED EVENT:', data.toString());
});

ws.on('error', (err) => {
  console.error('WS ERROR:', err);
});

ws.on('close', (code, reason) => {
  console.log('WS CLOSED:', code, reason.toString());
});

// Keep running for 10 seconds
setTimeout(() => {
  console.log('Closing WS');
  ws.close();
}, 10000);

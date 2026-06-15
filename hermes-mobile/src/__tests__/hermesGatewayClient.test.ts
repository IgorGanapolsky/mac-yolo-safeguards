import { parseSseChunk } from '../services/hermesGatewayClient';

describe('hermesGatewayClient SSE', () => {
  it('parses assistant.delta events from SSE buffer', () => {
    const buffer =
      'event: assistant.delta\ndata: {"delta":"hello"}\n\n' +
      'event: assistant.delta\ndata: {"delta":" world"}\n\n';
    const { events } = parseSseChunk(buffer);
    expect(events.length).toBe(2);
    expect(events[0].event).toBe('assistant.delta');
    expect(events[0].data.delta).toBe('hello');
  });
});

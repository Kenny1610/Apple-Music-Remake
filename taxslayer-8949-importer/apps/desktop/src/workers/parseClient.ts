import type { ColumnMapping, SniffResult } from '@tsp8949/core';
import type { ParseError, ParseRequest, ParseResponse } from './parse.worker';

/** Run CSV parse + sniff + mapping suggestion in a worker, off the main thread. */
export function parseCsvInWorker(
  text: string,
): Promise<{ sniffed: SniffResult; suggested: ColumnMapping }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<ParseResponse | ParseError>) => {
      worker.terminate();
      if (event.data.kind === 'error') reject(new Error(event.data.message));
      else resolve({ sniffed: event.data.sniffed, suggested: event.data.suggested });
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(err.message || 'CSV parse worker failed'));
    };
    const request: ParseRequest = { kind: 'parse-csv', text };
    worker.postMessage(request);
  });
}

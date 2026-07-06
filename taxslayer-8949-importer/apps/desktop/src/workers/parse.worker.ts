/// <reference lib="webworker" />
import { type ColumnMapping, type SniffResult, sniff, suggestMapping } from '@tsp8949/core';
import Papa from 'papaparse';

export interface ParseRequest {
  kind: 'parse-csv';
  text: string;
}

export interface ParseResponse {
  kind: 'parsed-csv';
  sniffed: SniffResult;
  suggested: ColumnMapping;
}

export interface ParseError {
  kind: 'error';
  message: string;
}

self.onmessage = (event: MessageEvent<ParseRequest>) => {
  try {
    const { text } = event.data;
    const result = Papa.parse<string[]>(text, {
      header: false,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
    });
    const table = result.data.map((row) => row.map((cell) => String(cell ?? '')));
    const sniffed = sniff(table);
    const suggested = suggestMapping(sniffed.headers);
    const response: ParseResponse = { kind: 'parsed-csv', sniffed, suggested };
    self.postMessage(response);
  } catch (err) {
    const response: ParseError = {
      kind: 'error',
      message: err instanceof Error ? err.message : 'Failed to parse the CSV file',
    };
    self.postMessage(response);
  }
};

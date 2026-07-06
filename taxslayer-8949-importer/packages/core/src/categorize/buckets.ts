import {
  type BasisBox,
  type Form8949Category,
  type ImportBatch,
  type NormalizedTransaction,
  type Term,
  effectiveTerm,
} from '../types';

/**
 * Map (term, batch basis box) to one of the six Form 8949 categories.
 * Short-term: A/B/C (Part I). Long-term: D/E/F (Part II).
 */
export function categoryFor(term: Term, box: BasisBox): Form8949Category {
  if (term === 'short') return box;
  switch (box) {
    case 'A':
      return 'D';
    case 'B':
      return 'E';
    case 'C':
      return 'F';
  }
}

export function isShortTermCategory(category: Form8949Category): boolean {
  return category === 'A' || category === 'B' || category === 'C';
}

export interface CategorizedTransaction {
  tx: NormalizedTransaction;
  category: Form8949Category;
}

/**
 * Assign every includable, term-resolved transaction in the batches to its
 * category. Rows that are excluded or have no resolved term are skipped —
 * callers gate export on `unresolvedTermCount` being zero.
 */
export function categorize(batches: ImportBatch[]): CategorizedTransaction[] {
  const out: CategorizedTransaction[] = [];
  for (const batch of batches) {
    for (const tx of batch.transactions) {
      if (tx.excluded) continue;
      const term = effectiveTerm(tx);
      if (term === null) continue;
      out.push({ tx, category: categoryFor(term, batch.basisBox) });
    }
  }
  return out;
}

export function unresolvedTermCount(batch: ImportBatch): number {
  return batch.transactions.filter((tx) => !tx.excluded && effectiveTerm(tx) === null).length;
}

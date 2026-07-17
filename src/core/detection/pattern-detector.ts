import type { DetectionCandidate, DetectionKind } from '@dtypes/detection';
import { describeElement } from '@core/selectors/describe-element';
import { detectLibrary } from './library-signatures';
import { generateId } from '@core/utils/id';

/** Two elements are "same shape" if they share a tag name and roughly the
 *  same class signature — a cheap structural-similarity heuristic that
 *  avoids expensive full-DOM diffing. */
function shapeKey(el: Element): string {
  const classes = Array.from(el.classList)
    .filter((c) => !/^(css-|jsx-|sc-|_[a-z0-9]{5,})/i.test(c))
    .sort()
    .join('.');
  return `${el.tagName.toLowerCase()}|${classes}`;
}

function classifyKind(el: Element): DetectionKind {
  const tag = el.tagName.toLowerCase();
  if (tag === 'li' || el.closest('ul,ol')) return 'list';
  if (el.querySelector('img') && el.querySelectorAll('*').length <= 15) return 'card-grid';
  return 'list';
}

/** Scans every element's direct children for runs of >= minItemCount
 *  same-shape siblings — this is how we catch card grids, product lists,
 *  search-result lists, etc. that aren't semantic <table>/<ul> markup. */
export function detectRepeatedPatterns(minItemCount: number, maxCandidates: number): DetectionCandidate[] {
  const candidates: DetectionCandidate[] = [];
  const seenParents = new Set<Element>();

  const containers = document.querySelectorAll('body *');
  for (const parent of Array.from(containers)) {
    if (candidates.length >= maxCandidates) break;
    if (seenParents.has(parent)) continue;
    const children = Array.from(parent.children).filter((c) => c.tagName !== 'SCRIPT' && c.tagName !== 'STYLE');
    if (children.length < minItemCount) continue;

    const groups = new Map<string, Element[]>();
    for (const child of children) {
      const key = shapeKey(child);
      const list = groups.get(key) ?? [];
      list.push(child);
      groups.set(key, list);
    }

    for (const [, group] of groups) {
      if (group.length < minItemCount) continue;
      // Require some non-trivial text/content so we skip layout-only divs.
      const sample = group[0];
      if (!sample) continue;
      const hasContent = (sample.textContent ?? '').trim().length > 0 || sample.querySelector('img,a');
      if (!hasContent) continue;

      seenParents.add(parent);
      const kind = classifyKind(sample);
      const fieldCount = sample.children.length;
      candidates.push({
        id: generateId('cand'),
        kind,
        library: detectLibrary(parent),
        element: describeElement(parent),
        confidence: group.length >= 5 ? 0.75 : 0.55,
        approxItemCount: group.length,
        approxFieldCount: fieldCount,
        reasons: [`${group.length} structurally-similar siblings`, `shape: ${sample.tagName.toLowerCase()}`]
      });
      break; // one candidate per parent is enough signal
    }
  }

  return candidates.slice(0, maxCandidates);
}

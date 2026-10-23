// Fixed plan arrangements for common plot widths, built from the reference plans.
// Each template fixes where the public rooms, the hall and the private rooms sit.
// The search then tunes room sizes inside the template. Rooms that the user has switched off
// are removed from the template, and a split with one child left is collapsed.
import type { Item, SplitNode, TreeNode } from './generate';

/** A template node: a room id, or a stack/band of nodes. `axis` says how children are laid out. */
export type TemplateNode = string | { axis: 'x' | 'y'; passage?: boolean; children: TemplateNode[] };

/** Public column, then hall, then private column. Bedrooms at the back, each with its toilet. */
export const HALL_SIDE: TemplateNode = {
  axis: 'x',
  passage: true,
  children: [
    { axis: 'y', children: ['living', 'dining', 'kitchen', 'toilet-common', 'store', 'utility'] },
    { axis: 'y', children: ['toilet-bed2', 'bed2', 'toilet-master', 'master', 'toilet-bed3', 'bed3'] },
  ],
};

/** Front band of public rooms, a hall across the plot, back band of bedrooms. For narrow plots. */
export const HALL_ACROSS: TemplateNode = {
  axis: 'y',
  passage: true,
  children: [
    { axis: 'x', children: ['living', { axis: 'y', children: ['store', 'dining', 'kitchen', 'toilet-common'] }] },
    { axis: 'x', children: [{ axis: 'y', children: ['master', 'toilet-master'] }, { axis: 'y', children: ['bed2', 'toilet-bed2', 'utility'] }] },
  ],
};

export const TEMPLATES: { name: string; tree: TemplateNode }[] = [
  { name: 'hall-side', tree: HALL_SIDE },
  { name: 'hall-across', tree: HALL_ACROSS },
];

/**
 * Turns a template into a split tree for the rooms in this plan. Missing rooms are dropped and
 * weights come from the room allocation, so each split starts with sensible shares.
 */
export function buildTemplateTree(t: TemplateNode, items: Item[]): TreeNode | null {
  const byId = new Map(items.map((it) => [it.spec.id, it]));
  const weightOf = (n: TemplateNode): number => {
    if (typeof n === 'string') return byId.get(n)?.weight ?? 0;
    return n.children.reduce((s, c) => s + weightOf(c), 0);
  };
  const build = (n: TemplateNode): TreeNode | null => {
    if (typeof n === 'string') {
      const it = byId.get(n);
      return it ? { spec: it.spec } : null;
    }
    const kids = n.children.map(build).filter((k): k is TreeNode => k !== null);
    if (kids.length === 0) return null;
    if (kids.length === 1) return kids[0];
    const kept = n.children.filter((c) => build(c) !== null);
    const total = kept.reduce((s, c) => s + weightOf(c), 0);
    // realize() reads each ratio as that child's share; the last child takes the remainder.
    const ratios: number[] = [];
    for (let i = 0; i < kept.length - 1; i++) ratios.push(weightOf(kept[i]) / total);
    const split: SplitNode = { ratios, longBias: true, axis: n.axis, passage: !!n.passage && kids.length === 2, children: kids };
    return split;
  };
  return build(t);
}


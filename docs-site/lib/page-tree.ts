import type * as PageTree from 'fumadocs-core/page-tree';

const cache = new WeakMap<PageTree.Root, PageTree.Root>();

/**
 * Groups top level pages that follow a separator into collapsible folders.
 * Separators from meta.json render as static headings, so the sidebar
 * showed every page at once. Folders collapse by default and the group
 * that contains the active page opens automatically.
 */
export function withCollapsibleGroups(root: PageTree.Root): PageTree.Root {
  const cached = cache.get(root);
  if (cached) return cached;

  const children: PageTree.Node[] = [];
  let group: PageTree.Folder | null = null;

  for (const node of root.children) {
    if (node.type === 'separator') {
      group = {
        type: 'folder',
        name: node.name,
        defaultOpen: false,
        children: [],
      };
      children.push(group);
      continue;
    }

    if (group) {
      group.children.push(node);
    } else {
      children.push(node);
    }
  }

  const result: PageTree.Root = { ...root, children };
  cache.set(root, result);
  return result;
}

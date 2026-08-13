import { source } from '@/lib/source';
import { withCollapsibleGroups } from '@/lib/page-tree';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';

export default function Layout({ children }: LayoutProps<'/docs'>) {
  return (
    <DocsLayout tree={withCollapsibleGroups(source.getPageTree())} {...baseOptions()}>
      {children}
    </DocsLayout>
  );
}

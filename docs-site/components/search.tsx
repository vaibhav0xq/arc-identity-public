'use client';

import DefaultSearchDialog, {
  type DefaultSearchDialogProps,
} from 'fumadocs-ui/components/dialog/search-default';
import { useEffect, useRef, useState } from 'react';

/**
 * Quick links shown while the query is empty. Without them the dialog
 * opens as a bare input strip, which looks broken over the page.
 */
const QUICK_LINKS: DefaultSearchDialogProps['links'] = [
  ['Overview', '/docs'],
  ['Quickstart', '/docs/quickstart'],
  ['Decision API', '/docs/decision-api'],
  ['API Reference', '/docs/api-reference'],
  ['Reason and warning codes', '/docs/reason-warning-codes'],
  ['Rate limits', '/docs/rate-limits'],
];

/**
 * Wraps the default search dialog so closing it discards its state.
 * The search provider keeps the dialog mounted while it is closed,
 * which made the previous query reappear on reopen. Remounting after
 * each close means Ctrl/Cmd+K always opens an empty search.
 */
export default function SearchDialog(props: DefaultSearchDialogProps) {
  const [generation, setGeneration] = useState(0);
  const wasOpen = useRef(props.open);

  useEffect(() => {
    if (wasOpen.current && !props.open) {
      setGeneration((current) => current + 1);
    }
    wasOpen.current = props.open;
  }, [props.open]);

  return (
    <DefaultSearchDialog
      key={generation}
      {...props}
      links={props.links ?? QUICK_LINKS}
    />
  );
}

/* eslint-disable @next/next/no-img-element */
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="inline-flex items-center gap-2.5">
          <img
            src="/brand/kyro-tile.svg"
            alt="Kyro"
            width={22}
            height={22}
            className="rounded-[4px]"
          />
          <span className="font-semibold">
            Kyro <span className="text-fd-muted-foreground font-normal">Docs</span>
          </span>
        </span>
      ),
      url: '/docs',
    },
    links: [
      {
        text: 'thekyro.co',
        url: 'https://www.thekyro.co',
        external: true,
      },
    ],
  };
}

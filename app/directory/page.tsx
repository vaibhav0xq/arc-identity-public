export const dynamic = "force-dynamic";
export const revalidate = 0;

import { ArcShell } from "@/components/ArcShell";
import { DirectoryPageClient } from "@/components/DirectoryPageClient";
import { unstable_noStore as noStore } from "next/cache";
import { DIRECTORY_DEFAULT_LIMIT, normalizeDirectorySort } from "@/lib/db";

const sortLabels = {
  score: "Highest score",
  activity: "Most active",
  newest: "Newest",
  risk: "Lowest risk"
};

type SortKey = keyof typeof sortLabels;

type DirectoryPageProps = {
  searchParams?: Promise<{ sort?: string }>;
};

export default async function DirectoryPage({ searchParams }: DirectoryPageProps) {
  noStore();
  const resolvedSearchParams = await searchParams;
  const sort = normalizeDirectorySort(resolvedSearchParams?.sort) as SortKey;

  return (
    <ArcShell>
      <DirectoryPageClient sort={sort} limit={DIRECTORY_DEFAULT_LIMIT} />
    </ArcShell>
  );
}



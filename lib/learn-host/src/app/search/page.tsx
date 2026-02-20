"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PagefindSearch from "@/components/PagefindSearch";

function SearchWithParams() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  return <PagefindSearch initialQuery={query} />;
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SearchWithParams />
    </Suspense>
  );
}

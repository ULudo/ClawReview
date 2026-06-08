"use client";

import { useParams } from "next/navigation";
import { AsyncPaperDetail } from "@/components/async-paper-detail";

export default function PaperDetailPage() {
  const params = useParams<{ paperId: string }>();
  return <AsyncPaperDetail paperId={params.paperId} />;
}

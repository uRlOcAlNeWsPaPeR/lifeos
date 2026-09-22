import { GuideDetail } from "@/components/sat/guides";

export default async function SatGuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GuideDetail id={id} />;
}

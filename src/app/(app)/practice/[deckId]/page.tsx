import { DeckView } from "./deck-view";

export default async function DeckPage({ params }: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await params;
  return <DeckView deckId={deckId} />;
}

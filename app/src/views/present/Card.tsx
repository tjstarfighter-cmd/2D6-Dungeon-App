import { Link, useParams } from "react-router-dom";

import { useCardsData } from "@/data/lazy";
import { cardImageUrl, findCard, metaLine } from "@/lib/cards";
import { NotFound } from "@/views/present/Map";

/** Full-bleed card image, centered on a dark background for OBS capture. */
export default function PresentCard() {
  const { id } = useParams();
  const cards = useCardsData();
  const card = id ? findCard(cards.cards, id) : null;

  if (!card) {
    return (
      <NotFound title="Card not found">
        The id <code>{id}</code> doesn't match any card in the index. Check
        the URL or pick a card from the presenter index.
      </NotFound>
    );
  }

  return (
    <main className="fixed inset-0 flex flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-2 text-sm">
        <div>
          <span className="font-semibold">{card.name}</span>
          <span className="ml-3 text-zinc-500">{metaLine(card)}</span>
        </div>
        <Link to="/present" className="text-xs text-zinc-400 underline">
          ← index
        </Link>
      </header>
      <div className="grow p-4 flex items-center justify-center">
        <img
          src={cardImageUrl(card.filename)}
          alt={card.name}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    </main>
  );
}

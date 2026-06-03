"use client";

import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";

type Flashcard = {
  id: string;
  dutch: string;
  english: string;
  known: boolean;
  difficult: boolean;
};

const STORAGE_KEY = "dutch-english-flashcards";

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function shuffleCards(cards: Flashcard[]) {
  return [...cards].sort(() => Math.random() - 0.5);
}

function normalizeSavedCards(cards: Partial<Flashcard>[]): Flashcard[] {
  return cards
    .filter((card) => card.dutch && card.english)
    .map((card) => ({
      id: card.id || createId(),
      dutch: String(card.dutch || "").trim(),
      english: String(card.english || "").trim(),
      known: Boolean(card.known),
      difficult: Boolean(card.difficult),
    }));
}

export default function Home() {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showDifficultOnly, setShowDifficultOnly] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [error, setError] = useState("");
  const [importMessage, setImportMessage] = useState("");

  useEffect(() => {
    const savedCards = localStorage.getItem(STORAGE_KEY);

    if (savedCards) {
      try {
        const parsedCards = JSON.parse(savedCards);
        setCards(shuffleCards(normalizeSavedCards(parsedCards)));
        setCurrentIndex(0);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  }, [cards]);

  const visibleCards = useMemo(() => {
    return showDifficultOnly
      ? cards.filter((card) => card.difficult)
      : cards;
  }, [cards, showDifficultOnly]);

  const currentCard = visibleCards[currentIndex];

  const stats = useMemo(() => {
    const known = cards.filter((card) => card.known).length;
    const difficult = cards.filter((card) => card.difficult).length;

    return {
      total: cards.length,
      known,
      learning: cards.length - known,
      difficult,
    };
  }, [cards]);

  const progressPercent =
    visibleCards.length > 0
      ? Math.round(((currentIndex + 1) / visibleCards.length) * 100)
      : 0;

  async function handleFileUpload(file: File) {
    setError("");
    setImportMessage("");
    setShowDifficultOnly(false);

    const fileName = file.name.toLowerCase();

    try {
      if (fileName.endsWith(".csv")) {
        const text = await file.text();

        const results = Papa.parse<Record<string, unknown>>(text, {
          header: true,
          skipEmptyLines: true,
          delimiter: "",
          delimitersToGuess: [",", ";", "\t", "|"],
          transformHeader: (header) =>
            header.replace(/^\uFEFF/, "").trim().toLowerCase(),
        });

        const parsedCards = rowsToCards(results.data);
        addCards(parsedCards);

        return;
      }

      if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
          worksheet
        );

        const parsedCards = rowsToCards(rows);
        addCards(parsedCards);

        return;
      }

      setError("Please upload a CSV or Excel file.");
    } catch (error) {
      console.error(error);
      setError("Something went wrong while reading the file.");
    }
  }

  function rowsToCards(rows: Record<string, unknown>[]) {
    return rows
      .map((row) => {
        const normalizedRow: Record<string, string> = {};

        Object.entries(row).forEach(([key, value]) => {
          const cleanKey = key
            .replace(/^\uFEFF/, "")
            .trim()
            .toLowerCase();

          normalizedRow[cleanKey] = String(value ?? "").trim();
        });

        const values = Object.values(normalizedRow);

        const dutch =
          normalizedRow["dutch"] ||
          normalizedRow["nederlands"] ||
          normalizedRow["nl"] ||
          normalizedRow["word"] ||
          normalizedRow["front"] ||
          normalizedRow["question"] ||
          values[0] ||
          "";

        const english =
          normalizedRow["english"] ||
          normalizedRow["engels"] ||
          normalizedRow["en"] ||
          normalizedRow["translation"] ||
          normalizedRow["meaning"] ||
          normalizedRow["back"] ||
          normalizedRow["answer"] ||
          values[1] ||
          "";

        return {
          id: createId(),
          dutch: dutch.trim(),
          english: english.trim(),
          known: false,
          difficult: false,
        };
      })
      .filter((card) => card.dutch && card.english);
  }

  function addCards(newCards: Flashcard[]) {
    if (newCards.length === 0) {
      setError(
        "No valid cards found. Use columns named Dutch and English, or Nederlands and Engels."
      );
      return;
    }

    setCards(shuffleCards(newCards));
    setCurrentIndex(0);
    setShowAnswer(false);
    setShowUpload(false);
    setImportMessage(`Imported ${newCards.length} cards successfully.`);
  }

  function goToNextCard() {
    setShowAnswer(false);

    setCurrentIndex((index) => {
      if (visibleCards.length === 0) return 0;
      return (index + 1) % visibleCards.length;
    });
  }

  function goToPreviousCard() {
    setShowAnswer(false);

    setCurrentIndex((index) => {
      if (visibleCards.length === 0) return 0;
      return index === 0 ? visibleCards.length - 1 : index - 1;
    });
  }

  function markCard(known: boolean) {
    if (!currentCard) return;

    setCards((existingCards) =>
      existingCards.map((card) =>
        card.id === currentCard.id ? { ...card, known } : card
      )
    );

    goToNextCard();
  }

  function toggleDifficult() {
    if (!currentCard) return;

    setCards((existingCards) =>
      existingCards.map((card) =>
        card.id === currentCard.id
          ? { ...card, difficult: !card.difficult }
          : card
      )
    );

    setImportMessage(
      currentCard.difficult
        ? "Removed from difficult cards."
        : "Added to difficult cards."
    );

    if (showDifficultOnly) {
      setCurrentIndex(0);
      setShowAnswer(false);
    }
  }

  function toggleDifficultMode() {
    setShowDifficultOnly((value) => !value);
    setCurrentIndex(0);
    setShowAnswer(false);
    setImportMessage("");
  }

  function reshuffleCards() {
    setCards((existingCards) => shuffleCards(existingCards));
    setCurrentIndex(0);
    setShowAnswer(false);
    setImportMessage("Cards shuffled.");
  }

  function clearCards() {
    setCards([]);
    setCurrentIndex(0);
    setShowAnswer(false);
    setShowDifficultOnly(false);
    setImportMessage("");
    localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-4 pb-28 text-gray-900">
      <div className="mx-auto max-w-xl">
        <header className="mb-4">
          <h1 className="text-2xl font-bold">Dutch → English</h1>
          <p className="mt-1 text-sm text-gray-600">
            Tap the card to reveal the answer.
          </p>
        </header>

        {showDifficultOnly && stats.difficult === 0 && (
          <section className="rounded-2xl bg-white p-6 text-center shadow">
            <p className="text-gray-600">
              No difficult cards yet. Mark cards as difficult while studying.
            </p>
          </section>
        )}

        {currentCard ? (
          <section className="rounded-2xl bg-white p-4 text-center shadow">
            <div className="mb-3">
              <div className="mb-2 flex items-center justify-between text-sm text-gray-500">
                <span>
                  {showDifficultOnly ? "Difficult" : "Card"} {currentIndex + 1} /{" "}
                  {visibleCards.length}
                </span>
                <span>{progressPercent}%</span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-gray-900 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <button
              className="mb-4 flex min-h-[300px] w-full flex-col items-center justify-center rounded-2xl border border-gray-200 p-6 text-center transition active:scale-[0.99]"
              onClick={() => setShowAnswer((value) => !value)}
            >
              {currentCard.difficult && (
                <span className="mb-4 rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
                  Difficult
                </span>
              )}

              <p className="text-xs uppercase tracking-wide text-gray-500">
                Dutch
              </p>

              <p className="mt-3 text-4xl font-bold">{currentCard.dutch}</p>

              {showAnswer ? (
                <div className="mt-6 w-full border-t pt-5">
                  <p className="text-xs uppercase tracking-wide text-gray-500">
                    English
                  </p>

                  <p className="mt-3 text-3xl font-semibold">
                    {currentCard.english}
                  </p>
                </div>
              ) : (
                <p className="mt-6 text-sm text-gray-400">Tap to see answer</p>
              )}
            </button>

            <button
              className={`mb-3 w-full rounded-xl px-4 py-3 font-semibold ${
                currentCard.difficult
                  ? "bg-orange-500 text-white"
                  : "bg-orange-100 text-orange-700"
              }`}
              onClick={toggleDifficult}
            >
              {currentCard.difficult
                ? "Remove from difficult"
                : "Mark as difficult"}
            </button>

            {showAnswer && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  className="rounded-xl bg-red-100 px-4 py-3 font-semibold text-red-700"
                  onClick={() => markCard(false)}
                >
                  Again
                </button>

                <button
                  className="rounded-xl bg-green-100 px-4 py-3 font-semibold text-green-700"
                  onClick={() => markCard(true)}
                >
                  I know this
                </button>
              </div>
            )}
          </section>
        ) : (
          !showDifficultOnly && (
            <section className="rounded-2xl bg-white p-6 text-center shadow">
              <p className="text-gray-600">
                Upload a file below to create your first flashcards.
              </p>
            </section>
          )
        )}

        <section className="mt-4 grid grid-cols-4 gap-2">
          <div className="rounded-xl bg-white p-2 text-center shadow">
            <p className="text-xl font-bold">{stats.total}</p>
            <p className="text-xs text-gray-500">Cards</p>
          </div>

          <div className="rounded-xl bg-white p-2 text-center shadow">
            <p className="text-xl font-bold">{stats.known}</p>
            <p className="text-xs text-gray-500">Known</p>
          </div>

          <div className="rounded-xl bg-white p-2 text-center shadow">
            <p className="text-xl font-bold">{stats.learning}</p>
            <p className="text-xs text-gray-500">Learn</p>
          </div>

          <div className="rounded-xl bg-white p-2 text-center shadow">
            <p className="text-xl font-bold">{stats.difficult}</p>
            <p className="text-xs text-gray-500">Hard</p>
          </div>
        </section>

        {cards.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-800 shadow"
              onClick={reshuffleCards}
            >
              Shuffle
            </button>

            <button
              className={`rounded-xl px-3 py-2 text-sm font-semibold shadow ${
                showDifficultOnly
                  ? "bg-orange-500 text-white"
                  : "bg-white text-orange-600"
              }`}
              onClick={toggleDifficultMode}
              disabled={stats.difficult === 0}
            >
              Difficult
            </button>

            <button
              className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-red-600 shadow"
              onClick={clearCards}
            >
              Clear
            </button>
          </div>
        )}

        <section className="mt-4 rounded-2xl bg-white p-4 shadow">
          <button
            className="flex w-full items-center justify-between font-semibold"
            onClick={() => setShowUpload((value) => !value)}
          >
            <span>Upload / replace CSV</span>
            <span>{showUpload ? "−" : "+"}</span>
          </button>

          {showUpload && (
            <div className="mt-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium">
                  Upload CSV / Excel
                </span>

                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="block w-full rounded-lg border border-gray-300 p-2 text-sm"
                  onChange={(event) => {
                    const file = event.target.files?.[0];

                    if (file) {
                      handleFileUpload(file);
                      event.target.value = "";
                    }
                  }}
                />
              </label>

              <p className="mt-3 text-xs text-gray-500">
                CSV format: Dutch,English
              </p>
            </div>
          )}

          {importMessage && (
            <p className="mt-3 rounded-lg bg-green-50 p-2 text-sm text-green-700">
              {importMessage}
            </p>
          )}

          {error && (
            <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </section>
      </div>

      {currentCard && (
        <div className="fixed bottom-0 left-0 right-0 border-t bg-white p-4 shadow-2xl">
          <div className="mx-auto grid max-w-xl grid-cols-2 gap-3">
            <button
              className="rounded-xl bg-gray-200 px-4 py-4 font-semibold text-gray-800"
              onClick={goToPreviousCard}
            >
              ← Previous
            </button>

            <button
              className="rounded-xl bg-gray-900 px-4 py-4 font-semibold text-white"
              onClick={goToNextCard}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

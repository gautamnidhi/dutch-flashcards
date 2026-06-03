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
  type?: string;
  topic?: string;
  examSkill?: string;
};

type Deck = {
  id: string;
  name: string;
  cards: Flashcard[];
  createdAt: string;
};

const STORAGE_KEY = "dutch-english-flashcard-decks";

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function shuffleCards(cards: Flashcard[]) {
  return [...cards].sort(() => Math.random() - 0.5);
}

function speakDutch(text: string) {
  if (typeof window === "undefined") return;

  if (!("speechSynthesis" in window)) {
    alert("Speech is not supported on this device.");
    return;
  }

  window.speechSynthesis.cancel();

  const voices = window.speechSynthesis.getVoices();
  const dutchVoice =
    voices.find((voice) => voice.lang === "nl-NL") ||
    voices.find((voice) => voice.lang.startsWith("nl"));

  const words = text
    .replace(/[.!?]/g, "")
    .split(" ")
    .filter(Boolean);

  let index = 0;

  function speakNextWord() {
    if (index >= words.length) return;

    const word = words[index];
    const utterance = new SpeechSynthesisUtterance(word);

    utterance.lang = "nl-NL";
    utterance.rate = 0.45;
    utterance.pitch = 1;

    if (dutchVoice) {
      utterance.voice = dutchVoice;
    }

    utterance.onend = () => {
      index += 1;
      setTimeout(speakNextWord, 300);
    };

    window.speechSynthesis.speak(utterance);
  }

  speakNextWord();
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
      type: String(card.type || "").trim(),
      topic: String(card.topic || "").trim(),
      examSkill: String(card.examSkill || "").trim(),
    }));
}

function normalizeSavedDecks(decks: Partial<Deck>[]): Deck[] {
  return decks
    .filter((deck) => deck.name && Array.isArray(deck.cards))
    .map((deck) => ({
      id: deck.id || createId(),
      name: String(deck.name || "Untitled list").trim(),
      cards: normalizeSavedCards(deck.cards || []),
      createdAt: deck.createdAt || new Date().toISOString(),
    }))
    .filter((deck) => deck.cards.length > 0);
}

export default function Home() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [deckName, setDeckName] = useState("");
  const [pendingCards, setPendingCards] = useState<Flashcard[]>([]);
  const [pendingFileName, setPendingFileName] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showDifficultOnly, setShowDifficultOnly] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const savedDecks = localStorage.getItem(STORAGE_KEY);

    if (savedDecks) {
      try {
        const parsedDecks = normalizeSavedDecks(JSON.parse(savedDecks));
        setDecks(parsedDecks);

        if (parsedDecks.length > 0) {
          setSelectedDeckId(parsedDecks[0].id);
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
  }, [decks]);

  const selectedDeck = useMemo(() => {
    return decks.find((deck) => deck.id === selectedDeckId);
  }, [decks, selectedDeckId]);

  const selectedCards = selectedDeck?.cards || [];

  const visibleCards = useMemo(() => {
    return showDifficultOnly
      ? selectedCards.filter((card) => card.difficult)
      : selectedCards;
  }, [selectedCards, showDifficultOnly]);

  const currentCard = visibleCards[currentIndex];

  const stats = useMemo(() => {
    const known = selectedCards.filter((card) => card.known).length;
    const difficult = selectedCards.filter((card) => card.difficult).length;

    return {
      total: selectedCards.length,
      known,
      learning: selectedCards.length - known,
      difficult,
    };
  }, [selectedCards]);

  const progressPercent =
    visibleCards.length > 0
      ? Math.round(((currentIndex + 1) / visibleCards.length) * 100)
      : 0;

  function updateSelectedDeckCards(
    updater: (cards: Flashcard[]) => Flashcard[]
  ) {
    if (!selectedDeck) return;

    setDecks((existingDecks) =>
      existingDecks.map((deck) =>
        deck.id === selectedDeck.id
          ? { ...deck, cards: updater(deck.cards) }
          : deck
      )
    );
  }

  async function handleFileUpload(file: File) {
    setError("");
    setMessage("");

    const fileName = file.name.toLowerCase();

    try {
      let parsedCards: Flashcard[] = [];

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

        parsedCards = rowsToCards(results.data);
      } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
          worksheet
        );

        parsedCards = rowsToCards(rows);
      } else {
        setError("Please upload a CSV or Excel file.");
        return;
      }

      if (parsedCards.length === 0) {
        setError(
          "No valid cards found. Use columns named Dutch and English, or Nederlands and Engels."
        );
        return;
      }

      setPendingCards(parsedCards);
      setPendingFileName(file.name);

      if (!deckName.trim()) {
        const cleanName = file.name.replace(/\.(csv|xlsx|xls)$/i, "");
        setDeckName(cleanName);
      }

      setMessage(`Ready to import ${parsedCards.length} cards.`);
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

        const type =
          normalizedRow["type"] ||
          normalizedRow["part of speech"] ||
          normalizedRow["partofspeech"] ||
          normalizedRow["word type"] ||
          normalizedRow["category"] ||
          "";

        const topic =
          normalizedRow["topic"] ||
          normalizedRow["theme"] ||
          normalizedRow["subject"] ||
          "";

        const examSkill =
          normalizedRow["examskill"] ||
          normalizedRow["exam skill"] ||
          normalizedRow["skill"] ||
          "";

        return {
          id: createId(),
          dutch: dutch.trim(),
          english: english.trim(),
          known: false,
          difficult: false,
          type: type.trim(),
          topic: topic.trim(),
          examSkill: examSkill.trim(),
        };
      })
      .filter((card) => card.dutch && card.english);
  }

  function createNewDeckFromPendingCards() {
    if (pendingCards.length === 0) {
      setError("Upload a CSV or Excel file first.");
      return;
    }

    const newDeck: Deck = {
      id: createId(),
      name: deckName.trim() || pendingFileName || "New list",
      cards: shuffleCards(pendingCards),
      createdAt: new Date().toISOString(),
    };

    setDecks((existingDecks) => [newDeck, ...existingDecks]);
    setSelectedDeckId(newDeck.id);
    setCurrentIndex(0);
    setShowAnswer(false);
    setShowDifficultOnly(false);
    setShowUpload(false);
    setPendingCards([]);
    setPendingFileName("");
    setDeckName("");
    setMessage(`Created "${newDeck.name}" with ${newDeck.cards.length} cards.`);
  }

  function addPendingCardsToCurrentDeck() {
    if (!selectedDeck) {
      setError("Create a list first, or use Create new list.");
      return;
    }

    if (pendingCards.length === 0) {
      setError("Upload a CSV or Excel file first.");
      return;
    }

    const addedCount = pendingCards.length;

    updateSelectedDeckCards((cards) => shuffleCards([...cards, ...pendingCards]));

    setCurrentIndex(0);
    setShowAnswer(false);
    setShowDifficultOnly(false);
    setShowUpload(false);
    setPendingCards([]);
    setPendingFileName("");
    setDeckName("");
    setMessage(`Added ${addedCount} cards to "${selectedDeck.name}".`);
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

    updateSelectedDeckCards((cards) =>
      cards.map((card) =>
        card.id === currentCard.id ? { ...card, known } : card
      )
    );

    goToNextCard();
  }

  function toggleDifficult() {
    if (!currentCard) return;

    updateSelectedDeckCards((cards) =>
      cards.map((card) =>
        card.id === currentCard.id
          ? { ...card, difficult: !card.difficult }
          : card
      )
    );

    setMessage(
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
    setMessage("");
  }

  function reshuffleCurrentDeck() {
    updateSelectedDeckCards((cards) => shuffleCards(cards));
    setCurrentIndex(0);
    setShowAnswer(false);
    setMessage("Current list shuffled.");
  }

  function deleteCurrentDeck() {
    if (!selectedDeck) return;

    const confirmed = window.confirm(
      `Delete "${selectedDeck.name}"? This cannot be undone.`
    );

    if (!confirmed) return;

    const remainingDecks = decks.filter((deck) => deck.id !== selectedDeck.id);

    setDecks(remainingDecks);
    setSelectedDeckId(remainingDecks[0]?.id || "");
    setCurrentIndex(0);
    setShowAnswer(false);
    setShowDifficultOnly(false);
    setMessage(`Deleted "${selectedDeck.name}".`);
  }

  function clearPendingImport() {
    setPendingCards([]);
    setPendingFileName("");
    setDeckName("");
    setError("");
    setMessage("");
  }

  function handleDeckChange(deckId: string) {
    setSelectedDeckId(deckId);
    setCurrentIndex(0);
    setShowAnswer(false);
    setShowDifficultOnly(false);
    setMessage("");
  }

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-4 text-gray-900">
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
              No difficult cards in this list yet.
            </p>
          </section>
        )}

        {currentCard ? (
          <section className="rounded-2xl bg-white p-4 text-center shadow">
            <div className="mb-3">
              <div className="mb-2 flex items-center justify-between text-sm text-gray-500">
                <span>
                  {showDifficultOnly ? "Difficult" : "Card"}{" "}
                  {currentIndex + 1} / {visibleCards.length}
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

            <div className="relative mb-4 min-h-[300px] rounded-2xl border border-gray-200">
              <button
                className="absolute left-2 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100 text-2xl font-bold text-gray-700 shadow active:scale-95"
                onClick={goToPreviousCard}
                aria-label="Previous card"
              >
                ←
              </button>

              <button
                className="absolute right-2 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-gray-900 text-2xl font-bold text-white shadow active:scale-95"
                onClick={goToNextCard}
                aria-label="Next card"
              >
                →
              </button>

              <button
                className="flex min-h-[300px] w-full flex-col items-center justify-center rounded-2xl p-16 text-center transition active:scale-[0.99]"
                onClick={() => setShowAnswer((value) => !value)}
              >
                <div className="mb-4 flex flex-wrap justify-center gap-2">
                  {currentCard.difficult && (
                    <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
                      Difficult
                    </span>
                  )}

                  {currentCard.type && (
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                      {currentCard.type}
                    </span>
                  )}

                  {currentCard.examSkill && (
                    <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">
                      {currentCard.examSkill}
                    </span>
                  )}
                </div>

                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Dutch
                </p>

                <div className="mt-3 flex items-center justify-center gap-3">
                  <p className="text-4xl font-bold">{currentCard.dutch}</p>

                  <span
                    role="button"
                    tabIndex={0}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-xl text-blue-700 shadow active:scale-95"
                    onClick={(event) => {
                      event.stopPropagation();
                      speakDutch(currentCard.dutch);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.stopPropagation();
                        speakDutch(currentCard.dutch);
                      }
                    }}
                    aria-label="Hear Dutch pronunciation"
                  >
                    🔊
                  </span>
                </div>

                {showAnswer ? (
                  <div className="mt-6 w-full border-t pt-5">
                    <p className="text-xs uppercase tracking-wide text-gray-500">
                      English
                    </p>

                    <p className="mt-3 text-3xl font-semibold">
                      {currentCard.english}
                    </p>

                    {currentCard.topic && (
                      <p className="mt-3 text-sm text-gray-500">
                        Topic: {currentCard.topic}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-6 text-sm text-gray-400">
                    Tap to see answer
                  </p>
                )}
              </button>
            </div>

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
                Upload a file below to create your first list.
              </p>
            </section>
          )
        )}

        {selectedDeck && (
          <>
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

            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-800 shadow"
                onClick={reshuffleCurrentDeck}
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
                onClick={deleteCurrentDeck}
              >
                Delete
              </button>
            </div>
          </>
        )}

        <section className="mt-4 rounded-2xl bg-white p-4 shadow">
          <button
            className="flex w-full items-center justify-between font-semibold"
            onClick={() => setShowUpload((value) => !value)}
          >
            <span>Upload / manage lists</span>
            <span>{showUpload ? "−" : "+"}</span>
          </button>

          {showUpload && (
            <div className="mt-4 space-y-4">
              {decks.length > 0 && (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium">
                    Current list
                  </span>

                  <select
                    className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                    value={selectedDeckId}
                    onChange={(event) => handleDeckChange(event.target.value)}
                  >
                    {decks.map((deck) => (
                      <option key={deck.id} value={deck.id}>
                        {deck.name} ({deck.cards.length})
                      </option>
                    ))}
                  </select>
                </label>
              )}

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

              <label className="block">
                <span className="mb-2 block text-sm font-medium">
                  New list name
                </span>

                <input
                  type="text"
                  className="block w-full rounded-lg border border-gray-300 p-2 text-sm"
                  placeholder="Example: Inburgering A2"
                  value={deckName}
                  onChange={(event) => setDeckName(event.target.value)}
                />
              </label>

              {pendingCards.length > 0 && (
                <div className="rounded-xl bg-gray-50 p-3 text-sm">
                  <p className="font-medium">
                    File ready: {pendingFileName || "uploaded file"}
                  </p>
                  <p className="text-gray-600">
                    {pendingCards.length} cards found.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2">
                <button
                  className="rounded-xl bg-gray-900 px-4 py-3 font-semibold text-white disabled:opacity-50"
                  onClick={createNewDeckFromPendingCards}
                  disabled={pendingCards.length === 0}
                >
                  Create new list
                </button>

                <button
                  className="rounded-xl bg-blue-100 px-4 py-3 font-semibold text-blue-700 disabled:opacity-50"
                  onClick={addPendingCardsToCurrentDeck}
                  disabled={pendingCards.length === 0 || !selectedDeck}
                >
                  Add to current list
                </button>

                {pendingCards.length > 0 && (
                  <button
                    className="rounded-xl bg-gray-100 px-4 py-3 font-semibold text-gray-700"
                    onClick={clearPendingImport}
                  >
                    Cancel import
                  </button>
                )}
              </div>

              <p className="text-xs text-gray-500">
                CSV format: Dutch,English,Type,Topic,ExamSkill
              </p>
            </div>
          )}

          {message && (
            <p className="mt-3 rounded-lg bg-green-50 p-2 text-sm text-green-700">
              {message}
            </p>
          )}

          {error && (
            <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

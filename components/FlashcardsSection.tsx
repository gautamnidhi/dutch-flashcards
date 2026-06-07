"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { Deck, Flashcard, ReviewRating, StudyMode } from "../lib/types";
import {
  DAILY_LIMIT_KEY,
  DEFAULT_EASE,
  STORAGE_KEY,
  addDaysToToday,
  createId,
  getTodayInitialCardIds,
  getTodayKey,
  isDueToday,
  normalizeSavedDecks,
  rowsToCards,
  shuffleCards,
  speakDutch,
} from "../lib/flashcardUtils";

export default function FlashcardsSection() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [deckName, setDeckName] = useState("");
  const [pendingCards, setPendingCards] = useState<Flashcard[]>([]);
  const [pendingFileName, setPendingFileName] = useState("");

  const [studyMode, setStudyMode] = useState<StudyMode>("practice");
  const [dailyLimit, setDailyLimit] = useState("20");
  const [todayRefreshSeed] = useState(() => createId());
  const [todayQueueIdsBySession, setTodayQueueIdsBySession] = useState<
      Record<string, string[]>
  >({});

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [manualDutch, setManualDutch] = useState("");
  const [manualEnglish, setManualEnglish] = useState("");
  const [manualType, setManualType] = useState("");
  const [manualTopic, setManualTopic] = useState("");
  const [manualExamSkill, setManualExamSkill] = useState("");

  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);
  const [mouseStartX, setMouseStartX] = useState<number | null>(null);
  const [mouseEndX, setMouseEndX] = useState<number | null>(null);
  const cardSwipeTriggeredRef = useRef(false);

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

    const savedDailyLimit = localStorage.getItem(DAILY_LIMIT_KEY);

    if (savedDailyLimit) {
      setDailyLimit(savedDailyLimit);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
  }, [decks]);

  useEffect(() => {
    localStorage.setItem(DAILY_LIMIT_KEY, dailyLimit);
  }, [dailyLimit]);

  const selectedDeck = useMemo(() => {
    return decks.find((deck) => deck.id === selectedDeckId);
  }, [decks, selectedDeckId]);

  const selectedCards = selectedDeck?.cards || [];
  const todaySessionKey = `${selectedDeckId}-${dailyLimit}-${todayRefreshSeed}`;

  useEffect(() => {
    if (!selectedDeck || !todaySessionKey) return;

    setTodayQueueIdsBySession((existing) => {
      if (existing[todaySessionKey]) {
        return existing;
      }

      const unknownCards = selectedDeck.cards.filter((card) => !card.known);

      const initialQueueIds = getTodayInitialCardIds(
          unknownCards,
          dailyLimit,
          todayRefreshSeed
      );

      return {
        ...existing,
        [todaySessionKey]: initialQueueIds,
      };
    });
  }, [
    selectedDeck,
    selectedDeckId,
    dailyLimit,
    todayRefreshSeed,
    todaySessionKey,
  ]);

  const stats = useMemo(() => {
    const known = selectedCards.filter((card) => card.known).length;
    const due = selectedCards.filter(
        (card) => !card.known && card.nextReviewDate && isDueToday(card)
    ).length;
    const scheduled = selectedCards.filter(
        (card) => !card.known && card.nextReviewDate && !isDueToday(card)
    ).length;
    const newCards = selectedCards.filter(
        (card) => !card.known && !card.nextReviewDate
    ).length;
    const difficult = selectedCards.filter((card) => card.difficult).length;

    return {
      total: selectedCards.length,
      known,
      learning: selectedCards.length - known,
      difficult,
      due,
      scheduled,
      newCards,
    };
  }, [selectedCards]);

  const visibleCards = useMemo(() => {
    const unknownCards = selectedCards.filter((card) => !card.known);

    if (studyMode === "known") {
      return selectedCards.filter((card) => card.known);
    }

    if (studyMode === "difficult") {
      return unknownCards.filter((card) => card.difficult);
    }

    if (studyMode === "today") {
      const todayQueueIds = todayQueueIdsBySession[todaySessionKey] || [];

      return todayQueueIds
          .map((cardId) => selectedCards.find((card) => card.id === cardId))
          .filter((card): card is Flashcard => Boolean(card));
    }

    return unknownCards;
  }, [selectedCards, studyMode, todayQueueIdsBySession, todaySessionKey]);

  const currentCard = visibleCards[currentIndex];

  const progressPercent =
      visibleCards.length > 0
          ? Math.round(((currentIndex + 1) / visibleCards.length) * 100)
          : 0;

  useEffect(() => {
    if (studyMode === "difficult" && visibleCards.length === 0) {
      setStudyMode("practice");
      setCurrentIndex(0);
      setShowAnswer(false);
    }
  }, [studyMode, visibleCards.length]);

  useEffect(() => {
    if (currentIndex >= visibleCards.length) {
      setCurrentIndex(0);
      setShowAnswer(false);
    }
  }, [currentIndex, visibleCards.length]);

  function changeStudyMode(mode: StudyMode) {
    setStudyMode(mode);
    setCurrentIndex(0);
    setShowAnswer(false);
    setMessage("");
  }

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
    setStudyMode("practice");
    setCurrentIndex(0);
    setShowAnswer(false);
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

    setStudyMode("practice");
    setCurrentIndex(0);
    setShowAnswer(false);
    setShowUpload(false);
    setPendingCards([]);
    setPendingFileName("");
    setDeckName("");
    setMessage(`Added ${addedCount} cards to "${selectedDeck.name}".`);
  }

  function addManualCard() {
    setError("");
    setMessage("");

    const dutch = manualDutch.trim();
    const english = manualEnglish.trim();

    if (!dutch || !english) {
      setError("Please enter both Dutch and English.");
      return;
    }

    const newCard: Flashcard = {
      id: createId(),
      dutch,
      english,
      known: false,
      difficult: false,
      type: manualType.trim(),
      topic: manualTopic.trim(),
      examSkill: manualExamSkill.trim(),
      reviewCount: 0,
      nextReviewDate: "",
      lastReviewedDate: "",
      ease: DEFAULT_EASE,
      intervalDays: 0,
    };

    if (selectedDeck) {
      updateSelectedDeckCards((cards) => [newCard, ...cards]);
      setMessage(`Added "${dutch}" to "${selectedDeck.name}".`);
    } else {
      const newDeck: Deck = {
        id: createId(),
        name: "My words",
        cards: [newCard],
        createdAt: new Date().toISOString(),
      };

      setDecks((existingDecks) => [newDeck, ...existingDecks]);
      setSelectedDeckId(newDeck.id);
      setMessage(`Created "My words" and added "${dutch}".`);
    }

    setManualDutch("");
    setManualEnglish("");
    setManualType("");
    setManualTopic("");
    setManualExamSkill("");
    setStudyMode("practice");
    setCurrentIndex(0);
    setShowAnswer(false);
  }

  function moveTodayCardAfterAnswer(cardId: string, rating: ReviewRating) {
    const currentQueue = todayQueueIdsBySession[todaySessionKey] || [];
    const currentPosition = currentQueue.findIndex((id) => id === cardId);
    const queueWithoutCard = currentQueue.filter((id) => id !== cardId);

    const nextQueue =
        rating === "again" ? [...queueWithoutCard, cardId] : queueWithoutCard;

    let nextIndex = currentPosition;

    if (nextQueue.length === 0) {
      nextIndex = 0;
    } else if (currentPosition < 0) {
      nextIndex = 0;
    } else if (currentPosition >= nextQueue.length) {
      nextIndex = nextQueue.length - 1;
    }

    setTodayQueueIdsBySession((existing) => ({
      ...existing,
      [todaySessionKey]: nextQueue,
    }));

    setCurrentIndex(nextIndex);
    setShowAnswer(false);
  }

  function restartTodayQueue() {
    if (!selectedDeck) return;

    const unknownCards = selectedDeck.cards.filter((card) => !card.known);

    const initialQueueIds = getTodayInitialCardIds(
        unknownCards,
        dailyLimit,
        todayRefreshSeed
    );

    setTodayQueueIdsBySession((existing) => ({
      ...existing,
      [todaySessionKey]: initialQueueIds,
    }));

    setCurrentIndex(0);
    setShowAnswer(false);
    setMessage("Today’s cards restarted.");
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

  function reviewCurrentCard(rating: ReviewRating) {
    if (!currentCard) return;

    const currentInterval = Number(currentCard.intervalDays || 0);
    const currentEase = Number(currentCard.ease || DEFAULT_EASE);
    const currentReviewCount = Number(currentCard.reviewCount || 0);

    let intervalDays = 1;
    let ease = currentEase;
    let known = false;
    let difficult = currentCard.difficult;

    if (rating === "again") {
      intervalDays = 0;
      ease = Math.max(1.3, currentEase - 0.2);
      difficult = true;
    }

    if (rating === "hard") {
      intervalDays =
          currentInterval > 0
              ? Math.max(2, Math.round(currentInterval * 1.2))
              : 3;
      ease = Math.max(1.3, currentEase - 0.15);
      difficult = true;
    }

    if (rating === "good") {
      intervalDays =
          currentInterval > 0
              ? Math.max(3, Math.round(currentInterval * ease))
              : 7;
      difficult = false;
    }

    if (rating === "easy") {
      intervalDays =
          currentInterval > 0
              ? Math.max(7, Math.round(currentInterval * (ease + 0.5)))
              : 14;
      ease = currentEase + 0.15;
      difficult = false;
      known = true;
    }

    updateSelectedDeckCards((cards) =>
        cards.map((card) =>
            card.id === currentCard.id
                ? {
                  ...card,
                  known,
                  difficult,
                  ease,
                  intervalDays,
                  reviewCount: currentReviewCount + 1,
                  lastReviewedDate: getTodayKey(),
                  nextReviewDate:
                      known
                          ? ""
                          : intervalDays === 0
                              ? getTodayKey()
                              : addDaysToToday(intervalDays),
                }
                : card
        )
    );

    setMessage(
        known
            ? "Marked as known."
            : intervalDays === 0
                ? "Marked Again. It moved to the end of today’s queue."
                : `Next review in ${intervalDays} day(s).`
    );

    if (studyMode === "today") {
      moveTodayCardAfterAnswer(currentCard.id, rating);
      return;
    }

    goToNextCard();
  }

  function removeCurrentCardFromKnown() {
    if (!currentCard) return;

    updateSelectedDeckCards((cards) =>
        cards.map((card) =>
            card.id === currentCard.id
                ? {
                  ...card,
                  known: false,
                  nextReviewDate: "",
                }
                : card
        )
    );

    setMessage(`Moved "${currentCard.dutch}" back to practice.`);
    goToNextCard();
  }

  function handleCardSwipe() {
    if (touchStartX === null || touchEndX === null) return;

    const swipeDistance = touchEndX - touchStartX;
    const minimumSwipeDistance = 80;

    setTouchStartX(null);
    setTouchEndX(null);

    if (Math.abs(swipeDistance) < minimumSwipeDistance) {
      return;
    }

    cardSwipeTriggeredRef.current = true;

    if (swipeDistance > 0) {
      goToPreviousCard();
    } else {
      goToNextCard();
    }
  }

  function handleCardMouseSwipe() {
    if (mouseStartX === null || mouseEndX === null) return;

    const swipeDistance = mouseEndX - mouseStartX;
    const minimumSwipeDistance = 80;

    setMouseStartX(null);
    setMouseEndX(null);

    if (Math.abs(swipeDistance) < minimumSwipeDistance) {
      return;
    }

    cardSwipeTriggeredRef.current = true;

    if (swipeDistance > 0) {
      goToPreviousCard();
    } else {
      goToNextCard();
    }
  }

  function removeDifficultFromCurrentCard() {
    if (!currentCard) return;

    updateSelectedDeckCards((cards) =>
        cards.map((card) =>
            card.id === currentCard.id
                ? {
                  ...card,
                  difficult: false,
                }
                : card
        )
    );

    setMessage("Removed from hard cards.");

    if (studyMode === "difficult") {
      setCurrentIndex(0);
      setShowAnswer(false);
    }
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
    setStudyMode("practice");
    setCurrentIndex(0);
    setShowAnswer(false);
    setMessage(`Deleted "${selectedDeck.name}".`);
  }

  function resetKnownCards() {
    if (!selectedDeck) return;

    updateSelectedDeckCards((cards) =>
        cards.map((card) => ({ ...card, known: false }))
    );

    setStudyMode("practice");
    setCurrentIndex(0);
    setShowAnswer(false);
    setMessage("Known cards are back in practice.");
  }

  function resetReviewSchedule() {
    if (!selectedDeck) return;

    updateSelectedDeckCards((cards) =>
        cards.map((card) => ({
          ...card,
          difficult: false,
          reviewCount: 0,
          nextReviewDate: "",
          lastReviewedDate: "",
          ease: DEFAULT_EASE,
          intervalDays: 0,
        }))
    );

    setStudyMode("practice");
    setCurrentIndex(0);
    setShowAnswer(false);
    setMessage("Review schedule reset.");
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
    setStudyMode("practice");
    setCurrentIndex(0);
    setShowAnswer(false);
    setMessage("");
  }

  return (
      <>
        {selectedDeck && (
            <section className="mb-4 rounded-2xl bg-white p-3 shadow">
              <div className="grid grid-cols-4 gap-2">
                <button
                    className={`rounded-xl px-2 py-2 text-xs font-semibold ${
                        studyMode === "practice"
                            ? "bg-gray-900 text-white"
                            : "bg-gray-100 text-gray-700"
                    }`}
                    onClick={() => changeStudyMode("practice")}
                >
                  Practice
                </button>

                <button
                    className={`rounded-xl px-2 py-2 text-xs font-semibold ${
                        studyMode === "today"
                            ? "bg-gray-900 text-white"
                            : "bg-gray-100 text-gray-700"
                    }`}
                    onClick={() => changeStudyMode("today")}
                >
                  Today
                </button>

                <button
                    className={`rounded-xl px-2 py-2 text-xs font-semibold ${
                        studyMode === "difficult"
                            ? "bg-orange-500 text-white"
                            : "bg-gray-100 text-orange-700"
                    }`}
                    onClick={() => changeStudyMode("difficult")}
                    disabled={stats.difficult === 0}
                >
                  Hard
                </button>

                <button
                    className={`rounded-xl px-2 py-2 text-xs font-semibold ${
                        studyMode === "known"
                            ? "bg-green-500 text-white"
                            : "bg-gray-100 text-green-700"
                    }`}
                    onClick={() => changeStudyMode("known")}
                    disabled={stats.known === 0}
                >
                  Known
                </button>
              </div>

              {studyMode === "today" && (
                  <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-gray-500">
                Anki mode: Again repeats, Hard/Good/Easy finish the card.
              </span>

                    <select
                        className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                        value={dailyLimit}
                        onChange={(event) => {
                          setDailyLimit(event.target.value);
                          setCurrentIndex(0);
                          setShowAnswer(false);
                        }}
                    >
                      <option value="10">10 new cards + due</option>
                      <option value="20">20 new cards + due</option>
                      <option value="30">30 new cards + due</option>
                      <option value="50">50 new cards + due</option>
                      <option value="all">All new + due cards</option>
                    </select>
                  </label>
              )}

              {stats.due > 0 && (
                  <p className="mt-2 rounded-lg bg-orange-50 p-2 text-xs text-orange-700">
                    {stats.due} card(s) due for review today.
                  </p>
              )}
            </section>
        )}

        {currentCard ? (
            <section className="rounded-2xl bg-white p-4 text-center shadow">
              <div className="mb-3">
                <div className="mb-2 flex items-center justify-between text-sm text-gray-500">
              <span>
                {studyMode === "today"
                    ? "Today"
                    : studyMode === "difficult"
                        ? "Hard"
                        : studyMode === "known"
                            ? "Known"
                            : "Card"}{" "}
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

                <p className="mt-2 text-xs text-gray-400">
                  Swipe or drag left = next · right = previous
                </p>
              </div>

              <div className="relative mb-4 min-h-[320px] rounded-2xl border border-gray-200">
                <button
                    className="flex min-h-[320px] w-full flex-col items-center justify-center rounded-2xl px-8 py-10 text-center transition active:scale-[0.99]"
                    onClick={() => {
                      if (cardSwipeTriggeredRef.current) {
                        cardSwipeTriggeredRef.current = false;
                        return;
                      }

                      setShowAnswer((value) => !value);
                    }}
                    onTouchStart={(event) => {
                      setTouchEndX(null);
                      setTouchStartX(event.targetTouches[0].clientX);
                    }}
                    onTouchMove={(event) => {
                      setTouchEndX(event.targetTouches[0].clientX);
                    }}
                    onTouchEnd={handleCardSwipe}
                    onMouseDown={(event) => {
                      setMouseEndX(null);
                      setMouseStartX(event.clientX);
                    }}
                    onMouseMove={(event) => {
                      if (mouseStartX !== null) {
                        setMouseEndX(event.clientX);
                      }
                    }}
                    onMouseUp={handleCardMouseSwipe}
                    onMouseLeave={() => {
                      setMouseStartX(null);
                      setMouseEndX(null);
                    }}
                >
                  <div className="mb-4 flex flex-wrap justify-center gap-2">
                    {currentCard.difficult && (
                        <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
                    Hard
                  </span>
                    )}

                    {currentCard.nextReviewDate && !currentCard.known && (
                        <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-700">
                    Review: {currentCard.nextReviewDate}
                  </span>
                    )}

                    {currentCard.reviewCount ? (
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                    Reviews: {currentCard.reviewCount}
                  </span>
                    ) : (
                        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                    New
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

                  <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                    <p className="break-words text-4xl font-bold">
                      {currentCard.dutch}
                    </p>

                    <span
                        role="button"
                        tabIndex={0}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xl text-blue-700 shadow active:scale-95"
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

              {studyMode === "known" ? (
                  <button
                      className="mb-3 w-full rounded-xl bg-green-100 px-4 py-3 font-semibold text-green-700"
                      onClick={removeCurrentCardFromKnown}
                  >
                    Move back to practice
                  </button>
              ) : currentCard.difficult ? (
                  <button
                      className="mb-3 w-full rounded-xl bg-gray-100 px-4 py-3 font-semibold text-gray-700"
                      onClick={removeDifficultFromCurrentCard}
                  >
                    Remove hard flag
                  </button>
              ) : null}

              {showAnswer && studyMode !== "known" && (
                  <div className="grid grid-cols-4 gap-2">
                    <button
                        className="rounded-xl bg-red-100 px-2 py-3 text-sm font-semibold text-red-700"
                        onClick={() => reviewCurrentCard("again")}
                    >
                      Again
                    </button>

                    <button
                        className="rounded-xl bg-orange-100 px-2 py-3 text-sm font-semibold text-orange-700"
                        onClick={() => reviewCurrentCard("hard")}
                    >
                      Hard
                    </button>

                    <button
                        className="rounded-xl bg-blue-100 px-2 py-3 text-sm font-semibold text-blue-700"
                        onClick={() => reviewCurrentCard("good")}
                    >
                      Good
                    </button>

                    <button
                        className="rounded-xl bg-green-100 px-2 py-3 text-sm font-semibold text-green-700"
                        onClick={() => reviewCurrentCard("easy")}
                    >
                      Easy
                    </button>
                  </div>
              )}
            </section>
        ) : selectedDeck && studyMode === "today" && visibleCards.length === 0 ? (
            <section className="rounded-2xl bg-white p-6 text-center shadow">
              <p className="text-2xl font-bold">You’re done for the day 🎉</p>
              <p className="mt-2 text-sm text-gray-500">
                Well done. Today’s queue is finished.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-2">
                <button
                    className="rounded-xl bg-gray-900 px-4 py-3 font-semibold text-white"
                    onClick={restartTodayQueue}
                >
                  Study this set again
                </button>

                <button
                    className="rounded-xl bg-gray-100 px-4 py-3 font-semibold text-gray-700"
                    onClick={() => changeStudyMode("practice")}
                >
                  Practise extra cards
                </button>
              </div>
            </section>
        ) : selectedDeck && stats.known === stats.total && stats.total > 0 ? (
            <section className="rounded-2xl bg-white p-6 text-center shadow">
              <p className="font-semibold">You know all cards in this list.</p>
              <p className="mt-2 text-sm text-gray-500">
                Known cards are hidden from normal practice.
              </p>

              <button
                  className="mt-4 rounded-xl bg-gray-900 px-4 py-3 font-semibold text-white"
                  onClick={resetKnownCards}
              >
                Practice all again
              </button>
            </section>
        ) : selectedDeck ? (
            <section className="rounded-2xl bg-white p-6 text-center shadow">
              <p className="text-gray-600">
                No cards in this mode. Try Practice, Known, or upload more cards.
              </p>
            </section>
        ) : (
            <section className="rounded-2xl bg-white p-6 text-center shadow">
              <p className="text-gray-600">
                Upload a file below or add your first word manually.
              </p>
            </section>
        )}

        {selectedDeck && (
            <>
              <section className="mt-4 grid grid-cols-4 gap-2">
                <div className="rounded-xl bg-white p-2 text-center shadow">
                  <p className="text-xl font-bold">{stats.total}</p>
                  <p className="text-xs text-gray-500">Cards</p>
                </div>

                <div className="rounded-xl bg-white p-2 text-center shadow">
                  <p className="text-xl font-bold">{stats.due}</p>
                  <p className="text-xs text-gray-500">Due</p>
                </div>

                <div className="rounded-xl bg-white p-2 text-center shadow">
                  <p className="text-xl font-bold">{stats.newCards}</p>
                  <p className="text-xs text-gray-500">New</p>
                </div>

                <div className="rounded-xl bg-white p-2 text-center shadow">
                  <p className="text-xl font-bold">{stats.known}</p>
                  <p className="text-xs text-gray-500">Known</p>
                </div>
              </section>

              <p className="mt-2 text-center text-xs text-gray-500">
                Today uses an Anki-style queue. Again sends a card to the end;
                Hard, Good, and Easy finish it for today.
              </p>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <button
                    className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-800 shadow"
                    onClick={reshuffleCurrentDeck}
                >
                  Shuffle
                </button>

                <button
                    className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow"
                    onClick={resetKnownCards}
                    disabled={stats.known === 0}
                >
                  Reset known
                </button>

                <button
                    className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-red-600 shadow"
                    onClick={deleteCurrentDeck}
                >
                  Delete
                </button>
              </div>

              {(stats.difficult > 0 || stats.scheduled > 0) && (
                  <button
                      className="mt-2 w-full rounded-xl bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 shadow"
                      onClick={resetReviewSchedule}
                  >
                    Reset review schedule
                  </button>
              )}
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

                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="mb-3 font-semibold">Add your own word</p>

                  <div className="space-y-2">
                    <input
                        type="text"
                        className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                        placeholder="Dutch word or phrase"
                        value={manualDutch}
                        onChange={(event) => setManualDutch(event.target.value)}
                    />

                    <input
                        type="text"
                        className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                        placeholder="English meaning"
                        value={manualEnglish}
                        onChange={(event) => setManualEnglish(event.target.value)}
                    />

                    <input
                        type="text"
                        className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                        placeholder="Type, e.g. Verb, Noun, Phrase"
                        value={manualType}
                        onChange={(event) => setManualType(event.target.value)}
                    />

                    <input
                        type="text"
                        className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                        placeholder="Topic, e.g. Doctor, Work, Exam"
                        value={manualTopic}
                        onChange={(event) => setManualTopic(event.target.value)}
                    />

                    <input
                        type="text"
                        className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                        placeholder="Exam skill, e.g. Speaking, Writing"
                        value={manualExamSkill}
                        onChange={(event) => setManualExamSkill(event.target.value)}
                    />

                    <button
                        className="w-full rounded-xl bg-gray-900 px-4 py-3 font-semibold text-white"
                        onClick={addManualCard}
                    >
                      Add card
                    </button>
                  </div>
                </div>

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
      </>
  );
}
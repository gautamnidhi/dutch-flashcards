"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type AudioLesson = {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
};

const STORAGE_KEY = "dutch-english-flashcard-decks";
const AUDIO_LESSONS_KEY = "dutch-listening-lessons";
const AUDIO_DB_NAME = "dutch-listening-audio-db";
const AUDIO_STORE_NAME = "audio-files";

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function shuffleCards(cards: Flashcard[]) {
  return [...cards].sort(() => Math.random() - 0.5);
}

function getLessonSortParts(title: string) {
  const numbers = title.match(/\d+/g)?.map(Number) || [];

  return {
    disc: numbers.length >= 2 ? numbers[numbers.length - 2] : 0,
    lesson: numbers.length >= 1 ? numbers[numbers.length - 1] : Number.MAX_SAFE_INTEGER,
  };
}

function sortAudioLessons(lessons: AudioLesson[]) {
  return [...lessons].sort((a, b) => {
    const aParts = getLessonSortParts(a.title);
    const bParts = getLessonSortParts(b.title);

    if (aParts.disc !== bParts.disc) {
      return aParts.disc - bParts.disc;
    }

    if (aParts.lesson !== bParts.lesson) {
      return aParts.lesson - bParts.lesson;
    }

    return a.title.localeCompare(b.title);
  });
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

function normalizeSavedLessons(lessons: Partial<AudioLesson>[]): AudioLesson[] {
  return lessons
    .filter((lesson) => lesson.id && lesson.title)
    .map((lesson) => ({
      id: String(lesson.id),
      title: String(lesson.title || "Audio lesson").trim(),
      done: Boolean(lesson.done),
      createdAt: lesson.createdAt || new Date().toISOString(),
    }));
}

function openAudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(AUDIO_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        db.createObjectStore(AUDIO_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveAudioBlob(id: string, blob: Blob) {
  const db = await openAudioDb();

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE_NAME, "readwrite");
    const store = transaction.objectStore(AUDIO_STORE_NAME);

    store.put(blob, id);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function getAudioBlob(id: string): Promise<Blob | null> {
  const db = await openAudioDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE_NAME, "readonly");
    const store = transaction.objectStore(AUDIO_STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      db.close();
      resolve((request.result as Blob) || null);
    };

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

async function deleteAudioBlob(id: string) {
  const db = await openAudioDb();

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE_NAME, "readwrite");
    const store = transaction.objectStore(AUDIO_STORE_NAME);

    store.delete(id);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"flashcards" | "listening">(
    "flashcards"
  );

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

  const [audioLessons, setAudioLessons] = useState<AudioLesson[]>([]);
  const [audioMessage, setAudioMessage] = useState("");
  const [audioError, setAudioError] = useState("");
  const [currentAudioLessonId, setCurrentAudioLessonId] = useState("");
  const [currentAudioUrl, setCurrentAudioUrl] = useState("");
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

    const savedLessons = localStorage.getItem(AUDIO_LESSONS_KEY);

    if (savedLessons) {
      try {
        const parsedLessons = normalizeSavedLessons(JSON.parse(savedLessons));
        setAudioLessons(sortAudioLessons(parsedLessons));
      } catch {
        localStorage.removeItem(AUDIO_LESSONS_KEY);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
  }, [decks]);

  useEffect(() => {
    localStorage.setItem(AUDIO_LESSONS_KEY, JSON.stringify(audioLessons));
  }, [audioLessons]);

  useEffect(() => {
    return () => {
      if (currentAudioUrl) {
        URL.revokeObjectURL(currentAudioUrl);
      }
    };
  }, [currentAudioUrl]);

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

  const listeningStats = useMemo(() => {
    const done = audioLessons.filter((lesson) => lesson.done).length;

    return {
      total: audioLessons.length,
      done,
      remaining: audioLessons.length - done,
    };
  }, [audioLessons]);

  const progressPercent =
    visibleCards.length > 0
      ? Math.round(((currentIndex + 1) / visibleCards.length) * 100)
      : 0;

  const listeningProgressPercent =
    listeningStats.total > 0
      ? Math.round((listeningStats.done / listeningStats.total) * 100)
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

  async function handleAudioUpload(files: FileList | null) {
    if (!files || files.length === 0) return;

    setAudioMessage("");
    setAudioError("");

    try {
      const newLessons: AudioLesson[] = [];

      for (const file of Array.from(files)) {
        const fileName = file.name.toLowerCase();

        const isAudioFile =
          file.type.startsWith("audio/") ||
          fileName.endsWith(".mp3") ||
          fileName.endsWith(".m4a") ||
          fileName.endsWith(".aac") ||
          fileName.endsWith(".wav") ||
          fileName.endsWith(".ogg");

        if (!isAudioFile) {
          continue;
        }

        const id = createId();
        const cleanTitle = file.name.replace(/\.[^/.]+$/, "");

        await saveAudioBlob(id, file);

        newLessons.push({
          id,
          title: cleanTitle,
          done: false,
          createdAt: new Date().toISOString(),
        });
      }

      if (newLessons.length === 0) {
        setAudioError("Please upload MP3, M4A, AAC, WAV, or OGG audio files.");
        return;
      }

      setAudioLessons((existingLessons) =>
        sortAudioLessons([...existingLessons, ...newLessons])
      );
      setAudioMessage(`Uploaded ${newLessons.length} audio lesson(s).`);
    } catch (error) {
      console.error(error);
      setAudioError("Could not save audio. Your browser storage may be full.");
    }
  }

  async function playAudioLesson(lesson: AudioLesson) {
    setAudioMessage("");
    setAudioError("");

    try {
      if (currentAudioLessonId === lesson.id && audioRef.current) {
        if (audioRef.current.paused) {
          await audioRef.current.play();
          setIsAudioPlaying(true);
        } else {
          audioRef.current.pause();
          setIsAudioPlaying(false);
        }

        return;
      }

      if (audioRef.current) {
        audioRef.current.pause();
      }

      if (currentAudioUrl) {
        URL.revokeObjectURL(currentAudioUrl);
      }

      const blob = await getAudioBlob(lesson.id);

      if (!blob) {
        setAudioError("Audio file was not found. Please upload it again.");
        return;
      }

      const url = URL.createObjectURL(blob);

      setCurrentAudioUrl(url);
      setCurrentAudioLessonId(lesson.id);
      setIsAudioPlaying(true);

      setTimeout(async () => {
        if (audioRef.current) {
          audioRef.current.src = url;
          await audioRef.current.play();
        }
      }, 0);
    } catch (error) {
      console.error(error);
      setAudioError("Could not play this audio.");
      setIsAudioPlaying(false);
    }
  }

  function toggleLessonDone(lessonId: string) {
    setAudioLessons((existingLessons) =>
      sortAudioLessons(
        existingLessons.map((lesson) =>
          lesson.id === lessonId ? { ...lesson, done: !lesson.done } : lesson
        )
      )
    );
  }

  async function deleteAudioLesson(lesson: AudioLesson) {
    const confirmed = window.confirm(`Delete "${lesson.title}"?`);

    if (!confirmed) return;

    try {
      if (currentAudioLessonId === lesson.id && audioRef.current) {
        audioRef.current.pause();
        setCurrentAudioLessonId("");
        setIsAudioPlaying(false);

        if (currentAudioUrl) {
          URL.revokeObjectURL(currentAudioUrl);
          setCurrentAudioUrl("");
        }
      }

      await deleteAudioBlob(lesson.id);

      setAudioLessons((existingLessons) =>
        sortAudioLessons(existingLessons.filter((item) => item.id !== lesson.id))
      );

      setAudioMessage(`Deleted "${lesson.title}".`);
    } catch (error) {
      console.error(error);
      setAudioError("Could not delete this audio.");
    }
  }

  function clearAllAudioLessons() {
    if (audioLessons.length === 0) return;

    const confirmed = window.confirm(
      "Delete all listening lessons? This cannot be undone."
    );

    if (!confirmed) return;

    Promise.all(audioLessons.map((lesson) => deleteAudioBlob(lesson.id)))
      .then(() => {
        if (audioRef.current) {
          audioRef.current.pause();
        }

        if (currentAudioUrl) {
          URL.revokeObjectURL(currentAudioUrl);
        }

        setAudioLessons([]);
        setCurrentAudioLessonId("");
        setCurrentAudioUrl("");
        setIsAudioPlaying(false);
        setAudioMessage("Deleted all listening lessons.");
      })
      .catch((error) => {
        console.error(error);
        setAudioError("Could not delete all audio lessons.");
      });
  }

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-4 text-gray-900">
      <div className="mx-auto max-w-xl">
        <header className="mb-4">
          <h1 className="text-2xl font-bold">Dutch → English</h1>
          <p className="mt-1 text-sm text-gray-600">
            Study flashcards and practise listening.
          </p>
        </header>

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-white p-2 shadow">
          <button
            className={`rounded-xl px-4 py-3 font-semibold ${
              activeTab === "flashcards"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-700"
            }`}
            onClick={() => setActiveTab("flashcards")}
          >
            Flashcards
          </button>

          <button
            className={`rounded-xl px-4 py-3 font-semibold ${
              activeTab === "listening"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-700"
            }`}
            onClick={() => setActiveTab("listening")}
          >
            Listening
          </button>
        </div>

        {activeTab === "flashcards" && (
          <>
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
                        onChange={(event) =>
                          handleDeckChange(event.target.value)
                        }
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
          </>
        )}

        {activeTab === "listening" && (
          <>
            <section className="rounded-2xl bg-white p-4 shadow">
              <h2 className="text-xl font-bold">Listening Practice</h2>
              <p className="mt-1 text-sm text-gray-600">
                Upload audio lessons, listen, and mark them as done.
              </p>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-gray-50 p-3 text-center">
                  <p className="text-2xl font-bold">{listeningStats.total}</p>
                  <p className="text-xs text-gray-500">Lessons</p>
                </div>

                <div className="rounded-xl bg-gray-50 p-3 text-center">
                  <p className="text-2xl font-bold">{listeningStats.done}</p>
                  <p className="text-xs text-gray-500">Done</p>
                </div>

                <div className="rounded-xl bg-gray-50 p-3 text-center">
                  <p className="text-2xl font-bold">
                    {listeningStats.remaining}
                  </p>
                  <p className="text-xs text-gray-500">Left</p>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 flex justify-between text-sm text-gray-500">
                  <span>Progress</span>
                  <span>{listeningProgressPercent}%</span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-gray-900 transition-all"
                    style={{ width: `${listeningProgressPercent}%` }}
                  />
                </div>
              </div>

              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-medium">
                  Upload audio lessons
                </span>

                <input
                  type="file"
                  accept=".mp3,.MP3,.m4a,.M4A,.aac,.AAC,.wav,.WAV,.ogg,.OGG,audio/mpeg,audio/mp3,audio/*"
                  multiple
                  className="block w-full rounded-lg border border-gray-300 p-2 text-sm"
                  onChange={(event) => {
                    handleAudioUpload(event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>

              <p className="mt-2 text-xs text-gray-500">
                You can upload multiple MP3/audio files. They are stored on this
                device/browser.
              </p>

              {audioMessage && (
                <p className="mt-3 rounded-lg bg-green-50 p-2 text-sm text-green-700">
                  {audioMessage}
                </p>
              )}

              {audioError && (
                <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">
                  {audioError}
                </p>
              )}
            </section>

            {currentAudioUrl && (
              <section className="mt-4 rounded-2xl bg-white p-4 shadow">
                <p className="mb-2 text-sm font-medium">Now playing</p>

                <audio
                  ref={audioRef}
                  controls
                  className="w-full"
                  onPlay={() => setIsAudioPlaying(true)}
                  onPause={() => setIsAudioPlaying(false)}
                  onEnded={() => setIsAudioPlaying(false)}
                />
              </section>
            )}

            <section className="mt-4 space-y-3">
              {audioLessons.length === 0 ? (
                <div className="rounded-2xl bg-white p-6 text-center shadow">
                  <p className="text-gray-600">
                    Upload your first audio lesson to start listening practice.
                  </p>
                </div>
              ) : (
                sortAudioLessons(audioLessons).map((lesson) => (
                  <div
                    key={lesson.id}
                    className="rounded-2xl bg-white p-4 shadow"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="mb-2 flex flex-wrap gap-2">
                          {lesson.done && (
                            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                              Done
                            </span>
                          )}

                          {currentAudioLessonId === lesson.id &&
                            isAudioPlaying && (
                              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                                Playing
                              </span>
                            )}
                        </div>

                        <h3 className="font-semibold">{lesson.title}</h3>
                        <p className="mt-1 text-xs text-gray-500">
                          Uploaded{" "}
                          {new Date(lesson.createdAt).toLocaleDateString()}
                        </p>
                      </div>

                      <input
                        type="checkbox"
                        checked={lesson.done}
                        onChange={() => toggleLessonDone(lesson.id)}
                        className="mt-1 h-6 w-6"
                        aria-label="Mark lesson done"
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <button
                        className="rounded-xl bg-gray-900 px-3 py-3 text-sm font-semibold text-white"
                        onClick={() => playAudioLesson(lesson)}
                      >
                        {currentAudioLessonId === lesson.id && isAudioPlaying
                          ? "Pause"
                          : "Play"}
                      </button>

                      <button
                        className={`rounded-xl px-3 py-3 text-sm font-semibold ${
                          lesson.done
                            ? "bg-green-500 text-white"
                            : "bg-green-100 text-green-700"
                        }`}
                        onClick={() => toggleLessonDone(lesson.id)}
                      >
                        {lesson.done ? "Done" : "Mark done"}
                      </button>

                      <button
                        className="rounded-xl bg-red-100 px-3 py-3 text-sm font-semibold text-red-700"
                        onClick={() => deleteAudioLesson(lesson)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </section>

            {audioLessons.length > 0 && (
              <button
                className="mt-4 w-full rounded-xl bg-red-50 px-4 py-3 font-semibold text-red-700"
                onClick={clearAllAudioLessons}
              >
                Delete all listening lessons
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}

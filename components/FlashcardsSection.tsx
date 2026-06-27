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
  speakEnglish,
} from "../lib/flashcardUtils";

const DIFFICULT_LIST_NAME = "Difficult_words";

function getGlobalCards(allDecks: Deck[]): Flashcard[] {
  const uniqueCards: Flashcard[] = [];
  const seen = new Set<string>();

  allDecks.forEach((deck) => {
    if (
      deck.id === "global-practice" || 
      deck.name.trim().toLowerCase() === DIFFICULT_LIST_NAME.toLowerCase()
    ) {
      return;
    }

    deck.cards.forEach((card) => {
      const key = `${card.dutch.trim().toLowerCase()}|${card.english.trim().toLowerCase()}|${(card.type || "").trim().toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueCards.push(card);
      }
    });
  });

  return uniqueCards;
}

function migrateRelationCards(decks: Deck[]): Deck[] {
  const nlToEn: Record<string, string> = {};
  
  decks.forEach((deck) => {
    deck.cards.forEach((card) => {
      if (card.dutch && card.english && card.type !== "synonym" && card.type !== "antonym") {
        const cleanDutch = card.dutch.toLowerCase().trim();
        if (!nlToEn[cleanDutch]) {
          nlToEn[cleanDutch] = card.english.trim();
        }
      }
    });
  });

  decks.forEach((deck) => {
    deck.cards.forEach((card) => {
      if (card.dutch && card.examSkill && card.examSkill.startsWith("Meaning:")) {
        const cleanDutch = card.dutch.toLowerCase().trim();
        const meaningText = card.examSkill.replace("Meaning:", "").trim();
        if (meaningText && !nlToEn[cleanDutch]) {
          nlToEn[cleanDutch] = meaningText;
        }
      }
    });
  });

  return decks.map((deck) => {
    const updatedCards = deck.cards.map((card) => {
      if ((card.type === "synonym" || card.type === "antonym") && !card.topic) {
        const cleanRelated = card.english.toLowerCase().trim();
        const relatedMeaning = nlToEn[cleanRelated];
        if (relatedMeaning) {
          return {
            ...card,
            topic: `Related Meaning: ${relatedMeaning}`,
          };
        }
      }
      return card;
    });

    return {
      ...deck,
      cards: updatedCards,
    };
  });
}

function parseMultiSheetVocab(workbook: XLSX.WorkBook): Flashcard[] {
  const cards: Flashcard[] = [];
  const cleanWord = (w: any) => String(w || '').replace(/^\uFEFF/, '').trim();

  workbook.SheetNames.forEach(sheetName => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
    if (rows.length === 0) return;

    if (sheetName === 'Sheet4') {
      rows.forEach(row => {
        const text = cleanWord(row[0]);
        if (!text) return;
        const parts = text.split(/[-–—\\]/);
        if (parts.length >= 2) {
          const dutch = cleanWord(parts[0]);
          const english = cleanWord(parts[1]);
          if (dutch && english && 
              dutch.toLowerCase() !== 'nederlands' && 
              english.toLowerCase() !== 'english') {
            cards.push({
              id: createId(),
              dutch,
              english,
              known: false,
              difficult: false,
              type: 'Vocabulary',
              topic: 'Miscellaneous',
              examSkill: '',
              reviewCount: 0,
              nextReviewDate: '',
              lastReviewedDate: '',
              ease: DEFAULT_EASE,
              intervalDays: 0,
            });
          }
        }
      });
      return;
    }

    // Determine the max columns in this sheet
    let maxCols = 0;
    rows.forEach(row => {
      if (row.length > maxCols) {
        maxCols = row.length;
      }
    });

    // Process in pairs of columns (colIdx and colIdx + 1)
    for (let colIdx = 0; colIdx < maxCols; colIdx += 2) {
      // Find category name from Row 0
      let category = cleanWord(rows[0][colIdx]);
      const catLower = category.toLowerCase();
      if (!category || 
          catLower === 'nederlands' || 
          catLower === 'english' || 
          catLower === 'engels' || 
          catLower === 'dutch') {
        category = 'Vocabulary';
      }

      // Loop through all rows for this column pair
      rows.forEach((row, rowIdx) => {
        const dutchVal = cleanWord(row[colIdx]);
        const englishVal = cleanWord(row[colIdx + 1]);

        if (dutchVal && englishVal) {
          const dLower = dutchVal.toLowerCase();
          const eLower = englishVal.toLowerCase();

          // Skip header placeholders
          if (dLower === 'nederlands' && eLower === 'english') return;
          if (dLower === 'nederlands' && eLower === 'engels') return;
          if (dLower === 'dutch' && eLower === 'english') return;
          if (dLower === category.toLowerCase()) return; // skip header itself if matched

          cards.push({
            id: createId(),
            dutch: dutchVal,
            english: englishVal,
            known: false,
            difficult: false,
            type: category,
            topic: sheetName,
            examSkill: '',
            reviewCount: 0,
            nextReviewDate: '',
            lastReviewedDate: '',
            ease: DEFAULT_EASE,
            intervalDays: 0,
          });
        }
      });
    }
  });

  return cards;
}

export default function FlashcardsSection() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [shuffledGlobalCards, setShuffledGlobalCards] = useState<Flashcard[] | null>(null);
  const [deckName, setDeckName] = useState("");
  const [pendingCards, setPendingCards] = useState<Flashcard[]>([]);
  const [pendingFileName, setPendingFileName] = useState("");

  const [studyMode, setStudyMode] = useState<StudyMode>("practice");
  const [dailyLimit, setDailyLimit] = useState("20");
  const [speechRate, setSpeechRate] = useState<number>(0.6);
  const [lastSpeechText, setLastSpeechText] = useState("");
  const [useSlowSpeech, setUseSlowSpeech] = useState(false);
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
  const [newListName, setNewListName] = useState("");

  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);
  const [mouseStartX, setMouseStartX] = useState<number | null>(null);
  const [mouseEndX, setMouseEndX] = useState<number | null>(null);
  const cardSwipeTriggeredRef = useRef(false);

  const [studyDirection, setStudyDirection] = useState<"nl-en" | "en-nl">("nl-en");
  const [isSpellingMode, setIsSpellingMode] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [spellingResult, setSpellingResult] = useState<{
    isCorrect: boolean;
    typed: string;
    correct: string;
  } | null>(null);
  const [spellingMistakes, setSpellingMistakes] = useState<Flashcard[]>([]);
  const [showSpellingMistakes, setShowSpellingMistakes] = useState(false);

  function isDifficultList(deck: Deck) {
    return deck.name.trim().toLowerCase() === DIFFICULT_LIST_NAME.toLowerCase();
  }

  const loadDefaultLists = async (currentDecks: Deck[]) => {
    try {
      const defaultLists = [
        {
          name: "Dutch Vocabulary",
          path: "/lists/dutch_vocabulary.xlsx"
        },
        {
          name: "Synonyms & Antonyms",
          path: "/lists/synonyms_antonyms.xlsx"
        },
        {
          name: "Inburgering Practice Test",
          path: "/lists/inburgering_practice_test.xlsx"
        },
        {
          name: "A2 Exam Prep",
          path: "/lists/a2_exam_prep.csv"
        },
        {
          name: "1000 Common Words",
          path: "/lists/common_1000_words.csv"
        },
        {
          name: "Daily Phrases (Easy)",
          path: "/lists/daily_phrases.csv"
        },
        {
          name: "Merged Flashcards",
          path: "/lists/merged_flashcards.csv"
        },
        {
          name: "Basic Dutch-English",
          path: "/lists/basic_vocabulary.csv"
        },
        {
          name: "Dutch Numbers",
          path: "/lists/number_translations.xlsx"
        },
        {
          name: "Dutch Time Words",
          path: "/lists/time_words.xlsx"
        },
        {
          name: "Dutch Alphabet & Sounds",
          path: "/lists/alphabet_pronunciation.csv"
        },
        {
          name: "Dutch Colors",
          path: "/lists/colors.csv"
        }
      ];

      const oldDefaultNames = [
        "Dutch Relations (Click Import)",
        "Most Used Synonyms & Antonyms",
        "Inburgering A2 Practice Test",
        "A2 Dutch Exam Prep",
        "1000 Most Common Words",
        "Daily Phrases (Easy)",
        "Merged Dutch-English Cards",
        "Basic Dutch-English Cards",
        "Synonyms & Antonyms (Standard)",
        "Dutch Numbers",
        "Dutch Time Words"
      ];

      const defaultNames = defaultLists.map(l => l.name);

      // Clean up old default lists to avoid duplicates with the new readable name list format
      let updatedDecks = currentDecks.filter(
        (deck) => !oldDefaultNames.includes(deck.name) && !defaultNames.includes(deck.name)
      );

      for (const list of defaultLists) {
        const res = await fetch(list.path);
        if (!res.ok) continue;
        const arrayBuffer = await res.arrayBuffer();
        
        let parsedCards: Flashcard[] = [];
        if (list.path.endsWith('.csv')) {
          const decoder = new TextDecoder("utf-8");
          const text = decoder.decode(arrayBuffer);
          const results = Papa.parse<Record<string, unknown>>(text, {
            header: true,
            skipEmptyLines: true,
            delimiter: "",
            delimitersToGuess: [",", ";", "\t", "|"],
            transformHeader: (header) =>
              header.replace(/^\uFEFF/, "").trim().toLowerCase(),
          });
          parsedCards = rowsToCards(results.data);
        } else {
          const workbook = XLSX.read(arrayBuffer);
          if (workbook.SheetNames.includes("Sheet1") && workbook.SheetNames.includes("Sheet2")) {
            parsedCards = parseMultiSheetVocab(workbook);
          } else {
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);
            parsedCards = rowsToCards(rows);
          }
        }
        
        if (parsedCards.length > 0) {
          const newDeck: Deck = {
            id: createId(),
            name: list.name,
            cards: parsedCards,
            createdAt: new Date().toISOString()
          };
          updatedDecks = [newDeck, ...updatedDecks];
        }
      }

      setDecks(updatedDecks);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedDecks));
      localStorage.setItem("dutch-default-lists-loaded-v10", "true");
      
      if (updatedDecks.length > 0) {
        // Select the newly loaded relation deck as default
        const relationDeck = updatedDecks.find(d => !isDifficultList(d));
        setSelectedDeckId(relationDeck ? relationDeck.id : updatedDecks[0].id);
      }
    } catch (err) {
      console.error("Failed to load default lists", err);
    }
  };

  // Load decks on mount
  useEffect(() => {
    const savedDecks = localStorage.getItem(STORAGE_KEY);
    let parsedDecks: Deck[] = [];

    if (savedDecks) {
      try {
        parsedDecks = normalizeSavedDecks(JSON.parse(savedDecks));
        parsedDecks = migrateRelationCards(parsedDecks);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }

    // Ensure Difficult_words list ALWAYS exists and survives normalization
    const hasDifficultList = parsedDecks.some(isDifficultList);
    if (!hasDifficultList) {
      const initialDifficultDeck: Deck = {
        id: createId(),
        name: DIFFICULT_LIST_NAME,
        cards: [],
        createdAt: new Date().toISOString(),
      };
      parsedDecks = [...parsedDecks, initialDifficultDeck];
    }

    const defaultsLoaded = localStorage.getItem("dutch-default-lists-loaded-v10");
    if (!defaultsLoaded) {
      loadDefaultLists(parsedDecks);
    } else {
      setDecks(parsedDecks);
      if (parsedDecks.length > 0) {
        setSelectedDeckId(parsedDecks[0].id);
      }
    }

    const savedDailyLimit = localStorage.getItem(DAILY_LIMIT_KEY);
    if (savedDailyLimit) {
      setDailyLimit(savedDailyLimit);
    }

    const savedSpeechRate = localStorage.getItem("speech_rate");
    if (savedSpeechRate) {
      setSpeechRate(parseFloat(savedSpeechRate));
    }

    const savedMistakes = localStorage.getItem("dutch-spelling-mistakes");
    if (savedMistakes) {
      try {
        setSpellingMistakes(JSON.parse(savedMistakes));
      } catch (e) {
        console.error("Failed to parse spelling mistakes", e);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeSpeechRate = (rate: number) => {
    setSpeechRate(rate);
    localStorage.setItem("speech_rate", String(rate));
  };

  const handleSpeakDutch = (text: string) => {
    let speakSlow = false;
    if (text === lastSpeechText) {
      speakSlow = !useSlowSpeech;
    }
    setLastSpeechText(text);
    setUseSlowSpeech(speakSlow);
    speakDutch(text, speakSlow ? 0.4 : speechRate);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUseSlowSpeech(false);
    setLastSpeechText("");
    setTypedAnswer("");
    setSpellingResult(null);
  }, [currentIndex, selectedDeckId]);

  // Save decks when state updates
  useEffect(() => {
    if (decks.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
    }
  }, [decks]);

  useEffect(() => {
    localStorage.setItem("dutch-spelling-mistakes", JSON.stringify(spellingMistakes));
  }, [spellingMistakes]);

  useEffect(() => {
    localStorage.setItem(DAILY_LIMIT_KEY, dailyLimit);
  }, [dailyLimit]);

  const selectedDeck = useMemo(() => {
    if (selectedDeckId === "global-practice") {
      const globalCards = shuffledGlobalCards || getGlobalCards(decks);
      return {
        id: "global-practice",
        name: "Practice Global List",
        cards: globalCards,
        createdAt: new Date().toISOString()
      };
    }
    return decks.find((deck) => deck.id === selectedDeckId);
  }, [decks, selectedDeckId, shuffledGlobalCards]);

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

  // Create a memoized mapping of Dutch words to their English meanings
  const wordMeaningsMap = useMemo(() => {
    const map: Record<string, string> = {};
    
    // 1. Populate from standard vocabulary cards across all decks
    decks.forEach((deck) => {
      deck.cards.forEach((card) => {
        if (card.dutch && card.english && card.type !== "synonym" && card.type !== "antonym") {
          const dutch = card.dutch.trim().toLowerCase();
          if (!map[dutch]) {
            map[dutch] = card.english.trim();
          }
        }
      });
    });

    // 2. Populate from synonym/antonym cards' main meanings (examSkill)
    decks.forEach((deck) => {
      deck.cards.forEach((card) => {
        if (card.dutch && card.examSkill && (card.type === "synonym" || card.type === "antonym")) {
          const dutch = card.dutch.trim().toLowerCase();
          const m = card.examSkill.replace(/^meaning:\s*/i, "").trim();
          if (m && !map[dutch]) {
            map[dutch] = m;
          }
        }
      });
    });

    // 3. Populate from synonym/antonym cards' related meanings (topic)
    decks.forEach((deck) => {
      deck.cards.forEach((card) => {
        if (card.english && card.topic && (card.type === "synonym" || card.type === "antonym")) {
          const related = card.english.trim().toLowerCase();
          const m = card.topic.replace(/^related meaning:\s*/i, "").trim();
          if (m && !map[related]) {
            map[related] = m;
          }
        }
      });
    });

    return map;
  }, [decks]);

  const isRelationCard = Boolean(currentCard && (currentCard.type === "synonym" || currentCard.type === "antonym"));

  // Extract relations elements if it's a relation card
  const relationData = useMemo(() => {
    if (!currentCard || !isRelationCard) return null;

    const wordA = currentCard.dutch.trim(); // always Dutch main word, e.g. "achter"
    const wordB = currentCard.english.trim(); // always Dutch related word, e.g. "voor"

    // Lookup meaning for A
    let meaningA = currentCard.examSkill ? currentCard.examSkill.replace(/^meaning:\s*/i, "").trim() : "";
    if (!meaningA && wordMeaningsMap[wordA.toLowerCase()]) {
      meaningA = wordMeaningsMap[wordA.toLowerCase()];
    }

    // Lookup meaning for B
    let meaningB = currentCard.topic ? currentCard.topic.replace(/^related meaning:\s*/i, "").trim() : "";
    if (!meaningB && wordMeaningsMap[wordB.toLowerCase()]) {
      meaningB = wordMeaningsMap[wordB.toLowerCase()];
    }

    return {
      wordA,
      meaningA,
      wordB,
      meaningB,
      relationType: currentCard.type,
      promptWord: studyDirection === "nl-en" ? wordA : wordB,
      promptMeaning: studyDirection === "nl-en" ? meaningA : meaningB,
      targetWord: studyDirection === "nl-en" ? wordB : wordA,
      targetMeaning: studyDirection === "nl-en" ? meaningB : meaningA,
    };
  }, [currentCard, isRelationCard, wordMeaningsMap, studyDirection]);

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

    if (selectedDeckId === "global-practice") {
      const currentGlobalCards = shuffledGlobalCards || getGlobalCards(decks);
      const updatedGlobalCards = updater(currentGlobalCards);

      setShuffledGlobalCards(updatedGlobalCards);

      setDecks((existingDecks) => {
        const changedCardsMap = new Map<string, Flashcard>();
        updatedGlobalCards.forEach((updatedCard) => {
          const originalCard = currentGlobalCards.find((c) => c.id === updatedCard.id);
          if (originalCard && JSON.stringify(originalCard) !== JSON.stringify(updatedCard)) {
            changedCardsMap.set(updatedCard.id, updatedCard);
          }
        });

        if (changedCardsMap.size === 0) return existingDecks;

        return existingDecks.map((deck) => {
          const updatedCards = deck.cards.map((card) => {
            if (changedCardsMap.has(card.id)) {
              return { ...card, ...changedCardsMap.get(card.id) };
            }
            return card;
          });
          return { ...deck, cards: updatedCards };
        });
      });
    } else {
      setDecks((existingDecks) =>
          existingDecks.map((deck) =>
              deck.id === selectedDeck.id
                  ? { ...deck, cards: updater(deck.cards) }
                  : deck
          )
      );
    }
  }

  function isSameFlashcard(firstCard: Flashcard, secondCard: Flashcard) {
    return (
        firstCard.dutch.trim().toLowerCase() ===
        secondCard.dutch.trim().toLowerCase() &&
        firstCard.english.trim().toLowerCase() ===
        secondCard.english.trim().toLowerCase()
    );
  }

  function createDifficultCardCopy(card: Flashcard): Flashcard {
    return {
      ...card,
      id: createId(),
      known: false,
      difficult: true,
      reviewCount: 0,
      nextReviewDate: "",
      lastReviewedDate: "",
      ease: DEFAULT_EASE,
      intervalDays: 0,
    };
  }

  function saveCardToDifficultList(card: Flashcard) {
    if (selectedDeck && isDifficultList(selectedDeck)) {
      return "skipped";
    }

    const existingDifficultDeck = decks.find(isDifficultList);
    const alreadySaved = existingDifficultDeck?.cards.some((savedCard) =>
        isSameFlashcard(savedCard, card)
    );

    if (alreadySaved) {
      return "already-saved";
    }

    setDecks((existingDecks) => {
      const difficultDeck = existingDecks.find(isDifficultList);

      if (!difficultDeck) {
        const newDifficultDeck: Deck = {
          id: createId(),
          name: DIFFICULT_LIST_NAME,
          cards: [createDifficultCardCopy(card)],
          createdAt: new Date().toISOString(),
        };

        return [newDifficultDeck, ...existingDecks];
      }

      return existingDecks.map((deck) =>
          deck.id === difficultDeck.id
              ? {
                ...deck,
                cards: [createDifficultCardCopy(card), ...deck.cards],
              }
              : deck
      );
    });

    return "saved";
  }

  function createEmptyList() {
    setError("");
    setMessage("");

    const name = newListName.trim();

    if (!name) {
      setError("Please enter a list name.");
      return;
    }

    const newDeck: Deck = {
      id: createId(),
      name,
      cards: [],
      createdAt: new Date().toISOString(),
    };

    setDecks((existingDecks) => [newDeck, ...existingDecks]);
    setSelectedDeckId(newDeck.id);
    setStudyMode("practice");
    setCurrentIndex(0);
    setShowAnswer(false);
    setNewListName("");
    setMessage(`Created new list "${newDeck.name}".`);
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
        if (workbook.SheetNames.includes("Sheet1") && workbook.SheetNames.includes("Sheet2")) {
          parsedCards = parseMultiSheetVocab(workbook);
        } else {
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);
          parsedCards = rowsToCards(rows);
        }
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

    if (selectedDeckId === "global-practice") {
      const targetDeck = decks.find((d) => !isDifficultList(d) && d.id !== "global-practice");
      if (targetDeck) {
        setDecks((existingDecks) =>
          existingDecks.map((deck) =>
            deck.id === targetDeck.id
              ? { ...deck, cards: [newCard, ...deck.cards] }
              : deck
          )
        );
        setMessage(`Added "${dutch}" to list "${targetDeck.name}".`);
      } else {
        const newDeck: Deck = {
          id: createId(),
          name: "My words",
          cards: [newCard],
          createdAt: new Date().toISOString(),
        };
        setDecks((existingDecks) => [newDeck, ...existingDecks]);
        setMessage(`Created "My words" and added "${dutch}".`);
      }
    } else if (selectedDeck) {
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
              ? Math.max(1, Math.round(currentInterval * 1.2))
              : 1;
      ease = Math.max(1.3, currentEase - 0.15);
      difficult = true;
    }

    if (rating === "good") {
      if (currentInterval === 0) {
        intervalDays = 2; // Graduation step 1
      } else if (currentInterval === 2) {
        intervalDays = 5; // Graduation step 2
      } else {
        intervalDays = Math.max(4, Math.round(currentInterval * ease));
      }
      difficult = false;
    }

    if (rating === "easy") {
      if (currentInterval === 0) {
        intervalDays = 4;
      } else {
        intervalDays = Math.max(6, Math.round(currentInterval * ease * 1.3));
      }
      ease = currentEase + 0.15;
      difficult = false;
      known = false; // Kept in review cycle
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

    const difficultListSaveStatus =
        rating === "again" || rating === "hard"
            ? saveCardToDifficultList(currentCard)
            : "skipped";

    setMessage(
        difficultListSaveStatus === "saved"
            ? `Saved to "${DIFFICULT_LIST_NAME}" list.`
            : difficultListSaveStatus === "already-saved"
                ? `Already in "${DIFFICULT_LIST_NAME}" list.`
                : known
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

  function markCurrentCardAsKnown() {
    if (!currentCard) return;

    updateSelectedDeckCards((cards) =>
        cards.map((card) =>
            card.id === currentCard.id
                ? {
                  ...card,
                  known: true,
                  difficult: false,
                  nextReviewDate: "",
                  lastReviewedDate: getTodayKey(),
                }
                : card
        )
    );

    setMessage(`Marked "${currentCard.dutch}" as known.`);

    if (studyMode === "today") {
      moveTodayCardAfterAnswer(currentCard.id, "easy");
      return;
    }

    goToNextCard();
  }

  // Touch handlers
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

  // Mouse drag handling
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
    setMessage("Current list shuffled (Numbers remained sequential).");
  }

  function resetAndShuffleCurrentDeck() {
    if (!selectedDeck) return;

    updateSelectedDeckCards((cards) => {
      // 1. Reset metrics for all cards
      const resetCards = cards.map((card) => ({
        ...card,
        known: false,
        difficult: false,
        reviewCount: 0,
        nextReviewDate: "",
        lastReviewedDate: "",
        ease: DEFAULT_EASE,
        intervalDays: 0,
      }));

      // 2. Use our smart shuffle function
      return shuffleCards(resetCards);
    });

    setCurrentIndex(0);
    setShowAnswer(false);
    setMessage("Deck progress reset! Vocabulary shuffled, numbers remained sequential.");
  }

  function deleteCurrentDeck() {
    if (!selectedDeck) return;

    if (selectedDeckId === "global-practice") {
      alert("The Practice Global List cannot be deleted because it is generated dynamically.");
      return;
    }

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
    setShuffledGlobalCards(null); // Reset global shuffle when deck changes
    setStudyMode("practice");
    setCurrentIndex(0);
    setShowAnswer(false);
    setMessage("");
  }

  function handleCheckSpelling() {
    if (!currentCard) return;

    const correctAnswer = studyDirection === "nl-en" ? currentCard.english : currentCard.dutch;

    const clean = (text: string) =>
      text
        .toLowerCase()
        .trim()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "")
        .replace(/\s+/g, " ");

    const isCorrect = clean(typedAnswer) === clean(correctAnswer);

    setSpellingResult({
      isCorrect,
      typed: typedAnswer,
      correct: correctAnswer,
    });

    setShowAnswer(true);

    if (!isCorrect) {
      // Add to spelling mistakes if not already present
      setSpellingMistakes((prev) => {
        const exists = prev.some((c) => c.id === currentCard.id);
        if (exists) return prev;
        return [currentCard, ...prev];
      });

      // Mark the card as difficult automatically
      updateSelectedDeckCards((cards) =>
        cards.map((card) =>
          card.id === currentCard.id ? { ...card, difficult: true } : card
        )
      );
    }
  }

  function createDeckFromSpellingMistakes() {
    if (spellingMistakes.length === 0) return;
    
    const newDeck: Deck = {
      id: createId(),
      name: `Spelling Mistakes (${new Date().toLocaleDateString()})`,
      cards: spellingMistakes.map(c => ({
        ...c,
        id: createId(),
        known: false,
        difficult: true,
        reviewCount: 0,
        nextReviewDate: "",
        lastReviewedDate: "",
        ease: DEFAULT_EASE,
        intervalDays: 0
      })),
      createdAt: new Date().toISOString()
    };
    
    setDecks(prev => [newDeck, ...prev]);
    setSelectedDeckId(newDeck.id);
    setStudyMode("practice");
    setCurrentIndex(0);
    setShowAnswer(false);
    setMessage(`Created spelling practice list: "${newDeck.name}"`);
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

              {/* Study Direction and Spelling Mode Toggles */}
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t pt-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Practice Direction:</span>
                  <div className="flex bg-gray-100 rounded-lg p-0.5 select-none">
                    <button
                        type="button"
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                            studyDirection === "nl-en"
                                ? "bg-white text-gray-900 shadow-sm"
                                : "text-gray-500 hover:text-gray-900"
                        }`}
                        onClick={() => {
                          setStudyDirection("nl-en");
                          setShowAnswer(false);
                        }}
                    >
                      NL → EN
                    </button>
                    <button
                        type="button"
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                            studyDirection === "en-nl"
                                ? "bg-white text-gray-900 shadow-sm"
                                : "text-gray-500 hover:text-gray-900"
                        }`}
                        onClick={() => {
                          setStudyDirection("en-nl");
                          setShowAnswer(false);
                        }}
                    >
                      EN → NL
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Spelling Practice:</span>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={isSpellingMode}
                      onChange={(e) => {
                        setIsSpellingMode(e.target.checked);
                        setTypedAnswer("");
                        setSpellingResult(null);
                      }}
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
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

              <div className="relative mb-4 min-h-[320px] rounded-2xl border border-gray-200 bg-white">
                <div
                    role="button"
                    tabIndex={0}
                    className="flex min-h-[320px] w-full flex-col items-center justify-center rounded-2xl px-8 py-10 text-center transition cursor-pointer select-none active:scale-[0.99] hover:bg-gray-50/10"
                    onClick={(event) => {
                      if (cardSwipeTriggeredRef.current) {
                        cardSwipeTriggeredRef.current = false;
                        return;
                      }

                      // Check if clicked target is an interactive element to prevent unwanted flips
                      const target = event.target as HTMLElement;
                      if (
                        target.closest('input') || 
                        target.closest('textarea') ||
                        target.closest('button') || 
                        target.closest('span[role="button"]')
                      ) {
                        return;
                      }

                      if (isSpellingMode && !showAnswer) {
                        handleCheckSpelling();
                      } else {
                        setShowAnswer((value) => !value);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        const target = event.target as HTMLElement;
                        if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") {
                          if (isSpellingMode && !showAnswer) {
                            handleCheckSpelling();
                          } else {
                            setShowAnswer((value) => !value);
                          }
                        }
                      }
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
                        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                    Review: {currentCard.nextReviewDate}
                  </span>
                    )}

                    {currentCard.reviewCount ? (
                        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                    Reviews: {currentCard.reviewCount}
                  </span>
                    ) : null}

                    {currentCard.type && (
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                          isRelationCard
                            ? currentCard.type === "antonym"
                              ? "bg-red-100 text-red-700"
                              : "bg-teal-100 text-teal-700"
                            : "bg-blue-100 text-blue-700"
                        }`}>
                          {currentCard.type}
                        </span>
                    )}

                    {currentCard.examSkill && !isRelationCard && (
                        <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">
                          {currentCard.examSkill}
                        </span>
                    )}
                  </div>

                  {isRelationCard && relationData ? (
                    <div className="w-full flex flex-col items-center justify-center">
                      <div className="mb-2 flex flex-col items-center">
                        <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                          relationData.relationType === "antonym"
                            ? "bg-red-50 text-red-600 border border-red-100"
                            : "bg-teal-50 text-teal-600 border border-teal-100"
                        }`}>
                          {relationData.relationType === "antonym" ? "⚠️ Find the Antonym" : "🤝 Find the Synonym"}
                        </span>
                        <p className="mt-2 text-xs text-gray-400">
                          What is the {relationData.relationType} of this word?
                        </p>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
                        <p className="break-words text-4xl font-bold text-gray-900">
                          {relationData.promptWord}
                        </p>

                        <span
                          role="button"
                          tabIndex={0}
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl shadow active:scale-95 transition-all duration-300 ${
                            useSlowSpeech && relationData.promptWord === lastSpeechText
                              ? "bg-orange-100 text-orange-700 scale-105 ring-2 ring-orange-300"
                              : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleSpeakDutch(relationData.promptWord);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.stopPropagation();
                              handleSpeakDutch(relationData.promptWord);
                            }
                          }}
                          aria-label="Hear pronunciation"
                        >
                          {useSlowSpeech && relationData.promptWord === lastSpeechText ? "🐢" : "🔊"}
                        </span>
                      </div>

                      {relationData.promptMeaning && (
                        <p className="mt-2 text-base font-medium text-gray-500 italic">
                          ({relationData.promptMeaning})
                        </p>
                      )}

                      <div
                        className="mt-4 flex items-center justify-center gap-1.5"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <span className="text-xs text-gray-500 mr-1">Speed:</span>
                        {[0.4, 0.6, 0.8, 1.0].map((rate) => (
                          <span
                            key={rate}
                            role="button"
                            tabIndex={0}
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold cursor-pointer active:scale-95 select-none transition-colors ${
                              speechRate === rate
                                ? "bg-blue-600 text-white shadow-sm"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                            onClick={() => changeSpeechRate(rate)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                changeSpeechRate(rate);
                              }
                            }}
                          >
                            {rate}x
                          </span>
                        ))}
                      </div>

                      {isSpellingMode && (
                        <div 
                          className="mt-6 w-full max-w-sm px-4"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            type="text"
                            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-center text-lg font-medium shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all animate-fade-in"
                            placeholder={`Type Dutch ${relationData.relationType}`}
                            value={typedAnswer}
                            onChange={(event) => setTypedAnswer(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                handleCheckSpelling();
                              }
                            }}
                            disabled={showAnswer}
                          />
                          {!showAnswer && (
                            <button
                              type="button"
                              className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-2.5 font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition-all duration-150"
                              onClick={handleCheckSpelling}
                            >
                              Check Spelling
                            </button>
                          )}
                        </div>
                      )}

                      {showAnswer ? (
                        <div className="w-full mt-6 flex flex-col items-center border-t pt-5">
                          {isSpellingMode && spellingResult && (
                            <div className={`mb-4 w-full max-w-sm rounded-xl p-3 text-sm ${
                              spellingResult.isCorrect 
                                ? "bg-green-50 text-green-800 border border-green-200" 
                                : "bg-red-50 text-red-800 border border-red-200"
                            }`}>
                              <p className="font-semibold flex items-center justify-center gap-1.5">
                                {spellingResult.isCorrect ? "✅ Correct spelling!" : "❌ Spelling incorrect"}
                              </p>
                              {!spellingResult.isCorrect && (
                                <div className="mt-2 space-y-1 text-xs text-left">
                                  <p>
                                    <span className="text-gray-500">Your typed answer:</span>{" "}
                                    <span className="font-semibold line-through text-red-600">
                                      {spellingResult.typed || "(empty)"}
                                    </span>
                                  </p>
                                  <p>
                                    <span className="text-gray-500">Correct spelling:</span>{" "}
                                    <span className="font-semibold text-green-700">
                                      {spellingResult.correct}
                                    </span>
                                  </p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Relationship Comparison Panel */}
                          <div className="w-full flex flex-col md:flex-row items-stretch justify-center gap-4 mt-2">
                            {/* Original Box */}
                            <div className="flex-1 flex flex-col items-center justify-center p-4 rounded-xl bg-gray-50 border border-gray-200/60 min-h-[110px]">
                              <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">
                                Original Word
                              </span>
                              <div className="flex items-center gap-1.5">
                                <p className="text-xl font-bold text-gray-800">{relationData.promptWord}</p>
                                <span
                                  role="button"
                                  tabIndex={0}
                                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs shadow active:scale-95 transition-all duration-300 ${
                                    useSlowSpeech && relationData.promptWord === lastSpeechText
                                      ? "bg-orange-100 text-orange-700 scale-105 ring-2 ring-orange-300"
                                      : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                                  }`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleSpeakDutch(relationData.promptWord);
                                  }}
                                  aria-label="Hear pronunciation"
                                >
                                  {useSlowSpeech && relationData.promptWord === lastSpeechText ? "🐢" : "🔊"}
                                </span>
                              </div>
                              {relationData.promptMeaning && (
                                <p className="text-xs font-semibold text-gray-500 italic mt-0.5">
                                  ({relationData.promptMeaning})
                                </p>
                              )}
                            </div>

                            {/* Connection */}
                            <div className="flex items-center justify-center flex-col py-1 md:py-0">
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                relationData.relationType === "antonym" ? "bg-red-100 text-red-700" : "bg-teal-100 text-teal-700"
                              }`}>
                                {relationData.relationType === "antonym" ? "↔ Antonym" : "≈ Synonym"}
                              </span>
                              <span className="hidden md:inline text-gray-300 text-lg font-light">──</span>
                              <span className="md:hidden text-gray-300 text-lg font-light">│</span>
                            </div>

                            {/* Answer Box */}
                            <div className={`flex-1 flex flex-col items-center justify-center p-4 rounded-xl border min-h-[110px] ${
                              relationData.relationType === "antonym"
                                ? "bg-red-50/30 border-red-200/50"
                                : "bg-teal-50/30 border-teal-200/50"
                            }`}>
                              <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">
                                {relationData.relationType === "antonym" ? "Opposite Word" : "Equivalent Word"}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <p className="text-xl font-bold text-gray-900">{relationData.targetWord}</p>
                                <span
                                  role="button"
                                  tabIndex={0}
                                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs shadow active:scale-95 transition-all duration-300 ${
                                    useSlowSpeech && relationData.targetWord === lastSpeechText
                                      ? "bg-orange-100 text-orange-700 scale-105 ring-2 ring-orange-300"
                                      : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                                  }`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleSpeakDutch(relationData.targetWord);
                                  }}
                                  aria-label="Hear pronunciation"
                                >
                                  {useSlowSpeech && relationData.targetWord === lastSpeechText ? "🐢" : "🔊"}
                                </span>
                              </div>
                              {relationData.targetMeaning && (
                                <p className="text-xs font-semibold text-gray-500 italic mt-0.5">
                                  ({relationData.targetMeaning})
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : isSpellingMode ? (
                        <p className="mt-6 text-sm text-gray-400">
                          Type {relationData.relationType} and press Enter to check
                        </p>
                      ) : (
                        <p className="mt-6 text-sm text-gray-400">
                          Tap card to see answer
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="w-full flex flex-col items-center justify-center">
                      <p className="text-xs uppercase tracking-wide text-gray-500">
                        {studyDirection === "nl-en" ? "Dutch" : "English"}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                        <p className="break-words text-4xl font-bold">
                          {studyDirection === "nl-en" ? currentCard.dutch : currentCard.english}
                        </p>

                        <span
                            role="button"
                            tabIndex={0}
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl shadow active:scale-95 transition-all duration-300 ${
                                useSlowSpeech && (studyDirection === "nl-en" ? currentCard.dutch : currentCard.english) === lastSpeechText
                                    ? "bg-orange-100 text-orange-700 scale-105 ring-2 ring-orange-300"
                                    : "bg-blue-100 text-blue-700"
                            }`}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (studyDirection === "nl-en") {
                                handleSpeakDutch(currentCard.dutch);
                              } else {
                                speakEnglish(currentCard.english);
                              }
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.stopPropagation();
                                if (studyDirection === "nl-en") {
                                  handleSpeakDutch(currentCard.dutch);
                                } else {
                                  speakEnglish(currentCard.english);
                                }
                              }
                            }}
                            aria-label="Hear pronunciation"
                        >
                          {useSlowSpeech && (studyDirection === "nl-en" ? currentCard.dutch : currentCard.english) === lastSpeechText ? "🐢" : "🔊"}
                        </span>
                      </div>

                      <div
                          className="mt-3 flex items-center justify-center gap-1.5"
                          onClick={(event) => event.stopPropagation()}
                      >
                        <span className="text-xs text-gray-500 mr-1">Speed:</span>
                        {[0.4, 0.6, 0.8, 1.0].map((rate) => (
                            <span
                                key={rate}
                                role="button"
                                tabIndex={0}
                                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold cursor-pointer active:scale-95 select-none transition-colors ${
                                    speechRate === rate
                                        ? "bg-blue-600 text-white shadow-sm"
                                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                }`}
                                onClick={() => changeSpeechRate(rate)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    changeSpeechRate(rate);
                                  }
                                }}
                            >
                              {rate}x
                            </span>
                        ))}
                      </div>

                      {isSpellingMode && (
                        <div 
                          className="mt-6 w-full max-w-sm px-4"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            type="text"
                            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-center text-lg font-medium shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all animate-fade-in"
                            placeholder={studyDirection === "nl-en" ? "Type English translation" : "Type Dutch translation"}
                            value={typedAnswer}
                            onChange={(event) => setTypedAnswer(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                handleCheckSpelling();
                              }
                            }}
                            disabled={showAnswer}
                          />
                          {!showAnswer && (
                            <button
                              type="button"
                              className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-2.5 font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition-all duration-150"
                              onClick={handleCheckSpelling}
                            >
                              Check Spelling
                            </button>
                          )}
                        </div>
                      )}

                      {showAnswer ? (
                          <div className="mt-6 w-full border-t pt-5">
                            {isSpellingMode && spellingResult && (
                              <div className={`mb-4 rounded-xl p-3 text-sm ${
                                spellingResult.isCorrect 
                                  ? "bg-green-50 text-green-800 border border-green-200" 
                                  : "bg-red-50 text-red-800 border border-red-200"
                              }`}>
                                <p className="font-semibold flex items-center justify-center gap-1.5">
                                  {spellingResult.isCorrect ? "✅ Correct spelling!" : "❌ Spelling incorrect"}
                                </p>
                                {!spellingResult.isCorrect && (
                                  <div className="mt-2 space-y-1 text-xs">
                                    <p>
                                      <span className="text-gray-500">Your typed answer:</span>{" "}
                                      <span className="font-semibold line-through text-red-600">
                                        {spellingResult.typed || "(empty)"}
                                      </span>
                                    </p>
                                    <p>
                                      <span className="text-gray-500">Correct spelling:</span>{" "}
                                      <span className="font-semibold text-green-700">
                                        {spellingResult.correct}
                                      </span>
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}

                            <p className="text-xs uppercase tracking-wide text-gray-500">
                              {studyDirection === "nl-en" ? "English" : "Dutch"}
                            </p>

                            <div className="mt-3 flex items-center justify-center gap-3">
                              <p className="text-3xl font-semibold">
                                {studyDirection === "nl-en" ? currentCard.english : currentCard.dutch}
                              </p>
                              {studyDirection === "en-nl" && (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm shadow active:scale-95 transition-all duration-300 ${
                                    useSlowSpeech && currentCard.dutch === lastSpeechText
                                      ? "bg-orange-100 text-orange-700 scale-105 ring-2 ring-orange-300"
                                      : "bg-blue-100 text-blue-700"
                                  }`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleSpeakDutch(currentCard.dutch);
                                  }}
                                  aria-label="Hear pronunciation"
                                >
                                  {useSlowSpeech && currentCard.dutch === lastSpeechText ? "🐢" : "🔊"}
                                </span>
                              )}
                              {studyDirection === "nl-en" && (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm shadow active:scale-95 transition-all duration-300 ${
                                    useSlowSpeech && currentCard.english === lastSpeechText
                                      ? "bg-orange-100 text-orange-700 scale-105 ring-2 ring-orange-300"
                                      : "bg-blue-100 text-blue-700"
                                  }`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    speakEnglish(currentCard.english);
                                  }}
                                  aria-label="Hear pronunciation"
                                >
                                  {useSlowSpeech && currentCard.english === lastSpeechText ? "🐢" : "🔊"}
                                </span>
                              )}
                            </div>

                            {currentCard.topic && (
                              <div className="mt-2 text-sm text-gray-500">
                                {currentCard.topic.startsWith("Related Meaning:") ? (
                                  <p className="italic">({currentCard.topic.replace("Related Meaning:", "").trim()})</p>
                                ) : (
                                  <p>Topic: {currentCard.topic}</p>
                                )}
                              </div>
                            )}
                          </div>
                      ) : isSpellingMode ? (
                          <p className="mt-6 text-sm text-gray-400">
                            Type translation and press Enter to check
                          </p>
                      ) : (
                          <p className="mt-6 text-sm text-gray-400">
                            Tap card to see answer
                          </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {studyMode === "known" ? (
                  <button
                      className="mb-3 w-full rounded-xl bg-green-100 px-4 py-3 font-semibold text-green-700"
                      onClick={removeCurrentCardFromKnown}
                  >
                    Move back to practice
                  </button>
              ) : (
                <div className="flex flex-col gap-2 mb-3">
                  {!currentCard.known && showAnswer && (
                    <button
                        className="w-full rounded-xl bg-green-50 hover:bg-green-100 border border-green-200 px-4 py-3 font-semibold text-green-700 active:scale-95 transition-all duration-150"
                        onClick={markCurrentCardAsKnown}
                    >
                      ✅ Mark as Known (Remove from practice)
                    </button>
                  )}
                  {currentCard.difficult ? (
                    <button
                        className="w-full rounded-xl bg-gray-100 px-4 py-3 font-semibold text-gray-700"
                        onClick={removeDifficultFromCurrentCard}
                    >
                      Remove hard flag
                    </button>
                  ) : null}
                </div>
              )}

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

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                    className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-800 shadow hover:bg-gray-50"
                    onClick={reshuffleCurrentDeck}
                >
                  Just Shuffle
                </button>

                <button
                    className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 shadow hover:bg-blue-100"
                    onClick={resetAndShuffleCurrentDeck}
                >
                  Reset & Smart Shuffle 🔄
                </button>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
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
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="mb-3 font-semibold">Create your own list</p>

                  <div className="space-y-2">
                    <input
                        type="text"
                        className="w-full rounded-lg border border-gray-300 p-2 text-sm"
                        placeholder="Example: My A2 exam words"
                        value={newListName}
                        onChange={(event) => setNewListName(event.target.value)}
                    />

                    <button
                        className="w-full rounded-xl bg-gray-900 px-4 py-3 font-semibold text-white"
                        onClick={createEmptyList}
                    >
                      Create empty list
                    </button>
                  </div>

                  <p className="mt-2 text-xs text-gray-500">
                    After creating a list, select it and add your own words below.
                  </p>
                </div>

                {decks.length > 0 && (
                    <label className="block">
                <span className="mb-2 block text-sm font-medium">
                  Current list
                </span>

                      <select
                          className="w-full rounded-lg border border-gray-300 p-2 text-sm bg-gray-50/50"
                          value={selectedDeckId}
                          onChange={(event) => handleDeckChange(event.target.value)}
                      >
                        <option value="global-practice" className="font-semibold text-blue-700">
                          🌎 Practice Global List ({getGlobalCards(decks).length} unique cards)
                        </option>
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
                    <textarea
                        className="w-full rounded-lg border border-gray-300 p-2 text-sm resize-y min-h-[60px]"
                        rows={2}
                        placeholder="Dutch word or phrase"
                        value={manualDutch}
                        onChange={(event) => setManualDutch(event.target.value)}
                    />

                    <textarea
                        className="w-full rounded-lg border border-gray-300 p-2 text-sm resize-y min-h-[60px]"
                        rows={2}
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
                    Create new list from file
                  </button>

                  <button
                      className="rounded-xl bg-blue-100 px-4 py-3 font-semibold text-blue-700 disabled:opacity-50"
                      onClick={addPendingCardsToCurrentDeck}
                      disabled={pendingCards.length === 0 || !selectedDeck}
                  >
                    Add file cards to current list
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

        {/* Spelling Mistakes Log Section */}
        <section className="mt-4 rounded-2xl bg-white p-4 shadow">
          <button
              className="flex w-full items-center justify-between font-semibold"
              onClick={() => setShowSpellingMistakes((value) => !value)}
          >
            <span>Spelling mistakes ({spellingMistakes.length})</span>
            <span>{showSpellingMistakes ? "−" : "+"}</span>
          </button>

          {showSpellingMistakes && (
              <div className="mt-4 space-y-4">
                {spellingMistakes.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No spelling mistakes recorded yet. Keep practicing!
                  </p>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="flex-1 rounded-xl bg-blue-100 px-3 py-2 text-xs font-semibold text-blue-700 active:scale-95 transition"
                        onClick={createDeckFromSpellingMistakes}
                      >
                        Create practice list from mistakes
                      </button>
                      <button
                        type="button"
                        className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 active:scale-95 transition"
                        onClick={() => {
                          if (confirm("Are you sure you want to clear your spelling mistakes history?")) {
                            setSpellingMistakes([]);
                          }
                        }}
                      >
                        Clear
                      </button>
                    </div>

                    <div className="max-h-[300px] overflow-y-auto divide-y divide-gray-100">
                      {spellingMistakes.map((card) => (
                        <div key={card.id} className="py-2 text-sm flex items-center justify-between">
                          <div className="text-left">
                            <p className="font-semibold text-gray-900">{card.dutch}</p>
                            <p className="text-xs text-gray-500">{card.english}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                              {card.type || "Vocab"}
                            </span>
                            <button
                              type="button"
                              className="text-gray-400 hover:text-gray-600 text-lg active:scale-90 transition p-1"
                              onClick={() => speakDutch(card.dutch)}
                              aria-label="Hear pronunciation"
                            >
                              🔊
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
          )}
        </section>
      </>
  );
}
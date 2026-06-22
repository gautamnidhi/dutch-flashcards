import type { Deck, Flashcard } from "./types";

export const STORAGE_KEY = "dutch-english-flashcard-decks";
export const DAILY_LIMIT_KEY = "dutch-daily-card-limit";
export const DEFAULT_EASE = 2.5;

export function createId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function shuffleCards(cards: Flashcard[]) {
    // 1. Helper to safely detect if a card is a number string
    const isNumberCard = (card: Flashcard) => {
        const type = (card.type || "").toLowerCase();
        const topic = (card.topic || "").toLowerCase();
        return type.includes("number") || topic.includes("number") || type.includes("getal");
    };

    // 2. Isolate only the shuffleable cards (non-numbers)
    const shuffleableCards = cards.filter(card => !isNumberCard(card));

    // 3. Shuffle the isolated pool using the Fisher-Yates algorithm
    const shuffledPool = [...shuffleableCards];
    for (let i = shuffledPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledPool[i], shuffledPool[j]] = [shuffledPool[j], shuffledPool[i]];
    }

    // 4. Map back onto the original slots: insert numbers unchanged, pull vocabulary from shuffled pool
    let shuffledIndex = 0;
    return cards.map((originalCard) => {
        if (isNumberCard(originalCard)) {
            return originalCard; // Lock number cards exactly where they belong chronologically
        }
        const nextShuffledCard = shuffledPool[shuffledIndex];
        shuffledIndex += 1;
        return nextShuffledCard;
    });
}

export function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
}

export function addDaysToToday(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
}

export function isDueToday(card: Flashcard) {
    if (!card.nextReviewDate) return false;
    return card.nextReviewDate <= getTodayKey();
}

export function hashString(value: string) {
    let hash = 0;

    for (let index = 0; index < value.length; index += 1) {
        hash = (hash << 5) - hash + value.charCodeAt(index);
        hash |= 0;
    }

    return Math.abs(hash);
}

export function getTodayInitialCardIds(
    cards: Flashcard[],
    limit: string,
    refreshSeed: string
) {
    const newCards = cards.filter((card) => !card.known && !card.nextReviewDate);

    const dueCards = cards.filter(
        (card) => !card.known && card.nextReviewDate && isDueToday(card)
    );

    const sortedNewCards = [...newCards].sort((a, b) => {
        return (
            hashString(`${refreshSeed}-${limit}-${a.id}-${a.dutch}`) -
            hashString(`${refreshSeed}-${limit}-${b.id}-${b.dutch}`)
        );
    });

    const sortedDueCards = [...dueCards].sort((a, b) => {
        return (
            hashString(`${refreshSeed}-due-${a.id}-${a.dutch}`) -
            hashString(`${refreshSeed}-due-${b.id}-${b.dutch}`)
        );
    });

    const selectedNewCards =
        limit === "all"
            ? sortedNewCards
            : sortedNewCards.slice(0, Number(limit) || 20);

    return [...selectedNewCards, ...sortedDueCards].map((card) => card.id);
}

export function speakDutch(text: string) {
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

export function normalizeSavedCards(cards: Partial<Flashcard>[]): Flashcard[] {
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
            reviewCount: Number(card.reviewCount || 0),
            nextReviewDate: String(card.nextReviewDate || "").trim(),
            lastReviewedDate: String(card.lastReviewedDate || "").trim(),
            ease: Number(card.ease || DEFAULT_EASE),
            intervalDays: Number(card.intervalDays || 0),
        }));
}

export function normalizeSavedDecks(decks: Partial<Deck>[]): Deck[] {
    return decks
        .filter((deck) => deck.name && Array.isArray(deck.cards))
        .map((deck) => ({
            id: deck.id || createId(),
            name: String(deck.name || "Untitled list").trim(),
            cards: normalizeSavedCards(deck.cards || []),
            createdAt: deck.createdAt || new Date().toISOString(),
        })); // <-- Removed the filter that deleted empty lists!
}

export function rowsToCards(rows: Record<string, unknown>[]) {
    return rows
        .map((row) => {
            const normalizedRow: Record<string, string> = {};

            Object.entries(row).forEach(([key, value]) => {
                const cleanKey = key.replace(/^\uFEFF/, "").trim().toLowerCase();
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
                reviewCount: 0,
                nextReviewDate: "",
                lastReviewedDate: "",
                ease: DEFAULT_EASE,
                intervalDays: 0,
            };
        })
        .filter((card) => card.dutch && card.english);
}
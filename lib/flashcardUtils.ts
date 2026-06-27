import type { Deck, Flashcard, WordRelation } from "./types";

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

// Pre-initialize voices list in the browser as early as possible
if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.getVoices();
}

export function speakDutch(text: string, rate: number = 0.6) {
    if (typeof window === "undefined") return;

    if (!("speechSynthesis" in window)) {
        alert("Speech is not supported on this device.");
        return;
    }

    window.speechSynthesis.cancel();

    // Replace slashes (like 'ou / au' or 'ij / ei') with commas to introduce a pause 
    // instead of pronouncing the word 'slash' or 'schuine streep' literally.
    const cleanText = text
        .replace(/\s*[\/\\]\s*/g, ", ")
        .trim();
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "nl-NL";
    utterance.rate = rate;
    utterance.pitch = 1;

    let voices = window.speechSynthesis.getVoices();
    let nlVoices = voices.filter(
        (voice) =>
            voice.lang.toLowerCase() === "nl-nl" ||
            voice.lang.toLowerCase().startsWith("nl-") ||
            voice.lang.toLowerCase() === "nl"
    );

    // If voices are empty (common on first call in Chrome), try to reload
    if (nlVoices.length === 0) {
        window.speechSynthesis.getVoices();
        voices = window.speechSynthesis.getVoices();
        nlVoices = voices.filter(
            (voice) =>
                voice.lang.toLowerCase() === "nl-nl" ||
                voice.lang.toLowerCase().startsWith("nl-") ||
                voice.lang.toLowerCase() === "nl"
        );
    }

    if (nlVoices.length > 0) {
        // Prioritize higher quality voices:
        // 1. Google Dutch voice (Chrome)
        // 2. Siri/Premium/Enhanced/Natural voices (macOS/iOS/Windows)
        // 3. Known high-quality macOS voices (Xander, Ellen)
        const googleVoice = nlVoices.find((v) => v.name.toLowerCase().includes("google"));
        const siriVoice = nlVoices.find((v) => v.name.toLowerCase().includes("siri"));
        const premiumVoice = nlVoices.find(
            (v) =>
                v.name.toLowerCase().includes("premium") ||
                v.name.toLowerCase().includes("natural") ||
                v.name.toLowerCase().includes("enhanced")
        );
        const namedVoice = nlVoices.find(
            (v) =>
                v.name.toLowerCase().includes("xander") ||
                v.name.toLowerCase().includes("ellen")
        );
        const nlNLVoice = nlVoices.find((v) => v.lang.toLowerCase() === "nl-nl");

        const bestVoice = googleVoice || siriVoice || premiumVoice || namedVoice || nlNLVoice || nlVoices[0];
        utterance.voice = bestVoice;
    }

    window.speechSynthesis.speak(utterance);
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

export function rowsToCards(rows: Record<string, unknown>[]): Flashcard[] {
    const enToNl: Record<string, string> = {};
    rows.forEach((row) => {
        const normalizedRow: Record<string, string> = {};
        Object.entries(row).forEach(([key, val]) => {
            normalizedRow[key.toLowerCase().trim()] = String(val ?? "").trim();
        });

        const dutchWord =
            normalizedRow["dutch meaning"] ||
            normalizedRow["word"] ||
            normalizedRow["dutch"] ||
            normalizedRow["nederlands"] ||
            normalizedRow["hoofdwoord"] ||
            "";

        const englishWord =
            normalizedRow["base word"] ||
            normalizedRow["meaning"] ||
            normalizedRow["english"] ||
            normalizedRow["engels"] ||
            normalizedRow["translation"] ||
            normalizedRow["betekenis"] ||
            "";

        if (dutchWord && englishWord) {
            const cleanEn = englishWord.toLowerCase().trim();
            if (cleanEn && !enToNl[cleanEn]) {
                enToNl[cleanEn] = dutchWord.trim();
            }
        }
    });

    return rows.flatMap((row) => {
        const normalizedRow: Record<string, string> = {};
        Object.entries(row).forEach(([key, value]) => {
            const cleanKey = key.replace(/^\uFEFF/, "").trim().toLowerCase();
            normalizedRow[cleanKey] = String(value ?? "").trim();
        });

        // A. Check if it's the user's synonym/antonym format with multiple items
        const isUserRelationFormat = "dutch meaning" in normalizedRow && "base word" in normalizedRow;
        if (isUserRelationFormat) {
            const word = normalizedRow["dutch meaning"] || "";
            const meaning = normalizedRow["base word"] || "";
            const synonymsStr = normalizedRow["common synonyms"] || "";
            const antonymsStr = normalizedRow["common antonyms"] || "";

            const cards: Flashcard[] = [];

            if (synonymsStr) {
                const synonyms = synonymsStr.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
                synonyms.forEach((syn) => {
                    const cleanSyn = syn.toLowerCase();
                    const dutchSyn = enToNl[cleanSyn] || syn;
                    cards.push({
                        id: createId(),
                        dutch: word.trim(),
                        english: dutchSyn.trim(),
                        known: false,
                        difficult: false,
                        type: "synonym",
                        topic: `Related Meaning: ${syn.trim()}`,
                        examSkill: meaning.trim() ? `Meaning: ${meaning.trim()}` : "",
                        reviewCount: 0,
                        nextReviewDate: "",
                        lastReviewedDate: "",
                        ease: DEFAULT_EASE,
                        intervalDays: 0,
                    });
                });
            }

            if (antonymsStr) {
                const antonyms = antonymsStr.split(/[;,]/).map((a) => a.trim()).filter(Boolean);
                antonyms.forEach((ant) => {
                    const cleanAnt = ant.toLowerCase();
                    const dutchAnt = enToNl[cleanAnt] || ant;
                    cards.push({
                        id: createId(),
                        dutch: word.trim(),
                        english: dutchAnt.trim(),
                        known: false,
                        difficult: false,
                        type: "antonym",
                        topic: `Related Meaning: ${ant.trim()}`,
                        examSkill: meaning.trim() ? `Meaning: ${meaning.trim()}` : "",
                        reviewCount: 0,
                        nextReviewDate: "",
                        lastReviewedDate: "",
                        ease: DEFAULT_EASE,
                        intervalDays: 0,
                    });
                });
            }

            return cards;
        }

        // B. Check if it's the standard relation format (e.g. Word, Type, Related, Meaning)
        const isStandardRelationFormat = "related" in normalizedRow && ("word" in normalizedRow || "dutch" in normalizedRow);
        if (isStandardRelationFormat) {
            const word =
                normalizedRow["word"] ||
                normalizedRow["dutch"] ||
                normalizedRow["nederlands"] ||
                normalizedRow["hoofdwoord"] ||
                "";

            const typeStr = (
                normalizedRow["type"] ||
                normalizedRow["relation"] ||
                normalizedRow["relatie"] ||
                "synonym"
            ).toLowerCase();

            const typeLabel = typeStr.includes("ant") ? "antonym" : "synonym";

            const related =
                normalizedRow["related"] ||
                normalizedRow["match"] ||
                normalizedRow["synonym"] ||
                normalizedRow["antonym"] ||
                normalizedRow["synoniem"] ||
                normalizedRow["antoniem"] ||
                "";

            const meaning =
                normalizedRow["meaning"] ||
                normalizedRow["english"] ||
                normalizedRow["engels"] ||
                normalizedRow["translation"] ||
                normalizedRow["betekenis"] ||
                "";

            const relatedMeaning =
                normalizedRow["related meaning"] ||
                normalizedRow["relatedmeaning"] ||
                normalizedRow["match meaning"] ||
                "";

            if (word && related) {
                return [{
                    id: createId(),
                    dutch: word.trim(),
                    english: related.trim(),
                    known: false,
                    difficult: false,
                    type: typeLabel,
                    topic: relatedMeaning.trim() ? `Related Meaning: ${relatedMeaning.trim()}` : "",
                    examSkill: meaning.trim() ? `Meaning: ${meaning.trim()}` : "",
                    reviewCount: 0,
                    nextReviewDate: "",
                    lastReviewedDate: "",
                    ease: DEFAULT_EASE,
                    intervalDays: 0,
                }];
            }
        }

        // C. Standard single card format
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

        if (!dutch || !english) return [];

        return [{
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
        }];
    });
}

export function rowsToRelations(rows: Record<string, unknown>[]): WordRelation[] {
    const enToNl: Record<string, string> = {};
    rows.forEach((row) => {
        const normalizedRow: Record<string, string> = {};
        Object.entries(row).forEach(([key, val]) => {
            normalizedRow[key.toLowerCase().trim()] = String(val ?? "").trim();
        });

        const dutchWord =
            normalizedRow["dutch meaning"] ||
            normalizedRow["word"] ||
            normalizedRow["dutch"] ||
            normalizedRow["nederlands"] ||
            normalizedRow["hoofdwoord"] ||
            "";

        const englishWord =
            normalizedRow["base word"] ||
            normalizedRow["meaning"] ||
            normalizedRow["english"] ||
            normalizedRow["engels"] ||
            normalizedRow["translation"] ||
            normalizedRow["betekenis"] ||
            "";

        if (dutchWord && englishWord) {
            const cleanEn = englishWord.toLowerCase().trim();
            if (cleanEn && !enToNl[cleanEn]) {
                enToNl[cleanEn] = dutchWord.trim();
            }
        }
    });

    return rows.flatMap((row) => {
        const normalizedRow: Record<string, string> = {};
        Object.entries(row).forEach(([key, val]) => {
            normalizedRow[key.toLowerCase().trim()] = String(val ?? "").trim();
        });

        // Detect user's specific format: "dutch meaning" and "base word"
        const isUserFormat = "dutch meaning" in normalizedRow && "base word" in normalizedRow;

        if (isUserFormat) {
            const word = normalizedRow["dutch meaning"] || "";
            const meaning = normalizedRow["base word"] || "";
            const synonymsStr = normalizedRow["common synonyms"] || "";
            const antonymsStr = normalizedRow["common antonyms"] || "";

            const relationsList: WordRelation[] = [];

            if (synonymsStr) {
                const synonyms = synonymsStr.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
                synonyms.forEach((syn) => {
                    const cleanSyn = syn.toLowerCase();
                    const dutchSyn = enToNl[cleanSyn];
                    relationsList.push({
                        id: createId(),
                        word,
                        type: "synonym",
                        related: dutchSyn || syn,
                        meaning,
                        isEnglishRelated: !dutchSyn,
                    });
                });
            }

            if (antonymsStr) {
                const antonyms = antonymsStr.split(/[;,]/).map((a) => a.trim()).filter(Boolean);
                antonyms.forEach((ant) => {
                    const cleanAnt = ant.toLowerCase();
                    const dutchAnt = enToNl[cleanAnt];
                    relationsList.push({
                        id: createId(),
                        word,
                        type: "antonym",
                        related: dutchAnt || ant,
                        meaning,
                        isEnglishRelated: !dutchAnt,
                    });
                });
            }

            return relationsList;
        }

        // Standard format (1-to-1 relation)
        const word =
            normalizedRow["word"] ||
            normalizedRow["dutch"] ||
            normalizedRow["nederlands"] ||
            normalizedRow["hoofdwoord"] ||
            "";

        const typeStr = (
            normalizedRow["type"] ||
            normalizedRow["relation"] ||
            normalizedRow["relatie"] ||
            "synonym"
        ).toLowerCase();

        const type: "synonym" | "antonym" = typeStr.includes("ant") ? "antonym" : "synonym";

        const related =
            normalizedRow["related"] ||
            normalizedRow["match"] ||
            normalizedRow["synonym"] ||
            normalizedRow["antonym"] ||
            normalizedRow["synoniem"] ||
            normalizedRow["antoniem"] ||
            "";

        const meaning =
            normalizedRow["meaning"] ||
            normalizedRow["english"] ||
            normalizedRow["engels"] ||
            normalizedRow["translation"] ||
            normalizedRow["betekenis"] ||
            "";

        if (!word || !related) return [];

        return [{
            id: createId(),
            word: word.trim(),
            type,
            related: related.trim(),
            meaning: meaning.trim(),
            isEnglishRelated: false,
        }];
    });
}

export function speakEnglish(text: string, rate: number = 0.6) {
    if (typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) {
        alert("Speech is not supported on this device.");
        return;
    }

    window.speechSynthesis.cancel();
    const cleanText = text.trim();
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "en-US";
    utterance.rate = rate;
    utterance.pitch = 1;

    const voices = window.speechSynthesis.getVoices();
    const enVoice = voices.find((v) => v.lang.toLowerCase() === "en-us" || v.lang.toLowerCase().startsWith("en"));
    if (enVoice) {
        utterance.voice = enVoice;
    }
    window.speechSynthesis.speak(utterance);
}
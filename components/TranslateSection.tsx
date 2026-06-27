"use client";

import { useEffect, useMemo, useState } from "react";
import type { Deck, Flashcard } from "../lib/types";
import { createId, speakDutch, STORAGE_KEY } from "../lib/flashcardUtils";

let cachedDutchDictionary: Set<string> | null = null;

function getLevenshteinDistance(a: string, b: string): number {
  const tmp: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    tmp[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    tmp[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        tmp[i][j] = tmp[i - 1][j - 1];
      } else {
        tmp[i][j] = Math.min(
          tmp[i - 1][j - 1] + 1, // substitution
          tmp[i][j - 1] + 1,     // insertion
          tmp[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return tmp[b.length][a.length];
}

function getSpellingSuggestions(word: string, dictionary: Set<string>): string[] {
  const results: { word: string; dist: number }[] = [];
  const minLen = Math.max(1, word.length - 1);
  const maxLen = word.length + 1;

  for (const dictWord of dictionary) {
    if (dictWord.length < minLen || dictWord.length > maxLen) continue;
    
    const dist = getLevenshteinDistance(word, dictWord);
    if (dist <= 1) {
      results.push({ word: dictWord, dist });
    }
  }

  if (results.length < 3) {
    const minLen2 = Math.max(1, word.length - 2);
    const maxLen2 = word.length + 2;
    for (const dictWord of dictionary) {
      if (dictWord.length < minLen2 || dictWord.length > maxLen2) continue;
      
      const dist = getLevenshteinDistance(word, dictWord);
      if (dist === 2) {
        results.push({ word: dictWord, dist });
      }
    }
  }

  results.sort((a, b) => {
    if (a.dist !== b.dist) return a.dist - b.dist;
    
    // Prioritize sharing first letter
    const aFirstMatch = a.word[0] === word[0];
    const bFirstMatch = b.word[0] === word[0];
    if (aFirstMatch !== bFirstMatch) return aFirstMatch ? -1 : 1;
    
    return a.word.localeCompare(b.word);
  });
  
  // Deduplicate results
  const unique: { word: string; dist: number }[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (!seen.has(r.word)) {
      seen.add(r.word);
      unique.push(r);
    }
  }
  
  return unique.slice(0, 3).map(r => r.word);
}

export default function TranslateSection() {
  const [inputText, setInputText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [translationDirection, setTranslationDirection] = useState<"nl-en" | "en-nl">("nl-en");
  const [finalDutch, setFinalDutch] = useState("");
  const [finalEnglish, setFinalEnglish] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [dutchDictionary, setDutchDictionary] = useState<Set<string> | null>(() => cachedDutchDictionary);

  // Alternating speech rate state
  const [lastSpeechText, setLastSpeechText] = useState("");
  const [useSlowSpeech, setUseSlowSpeech] = useState(false);
  const [speechRate, setSpeechRate] = useState<number>(0.6);

  useEffect(() => {
    const savedDecks = localStorage.getItem(STORAGE_KEY);
    const savedInputText = localStorage.getItem("dutch-translate-input");
    const savedTranslatedText = localStorage.getItem("dutch-translate-output");
    const savedDirection = localStorage.getItem("dutch-translate-direction");
    const savedFinalDutch = localStorage.getItem("dutch-translate-final-dutch");
    const savedFinalEnglish = localStorage.getItem("dutch-translate-final-english");
    const savedSelectedDeckId = localStorage.getItem("dutch-translate-selected-deck-id");

    if (savedInputText) setInputText(savedInputText);
    if (savedTranslatedText) setTranslatedText(savedTranslatedText);
    if (savedDirection) setTranslationDirection(savedDirection as any);
    if (savedFinalDutch) setFinalDutch(savedFinalDutch);
    if (savedFinalEnglish) setFinalEnglish(savedFinalEnglish);

    if (savedDecks) {
      try {
        const parsedDecks = JSON.parse(savedDecks) as Deck[];
        setDecks(parsedDecks);
        if (parsedDecks.length > 0) {
          const targetId = savedSelectedDeckId && parsedDecks.some((d) => d.id === savedSelectedDeckId)
            ? savedSelectedDeckId
            : parsedDecks[0].id;
          setSelectedDeckId(targetId);
        }
      } catch (e) {
        console.error("Failed to parse decks from local storage", e);
      }
    }
    const savedSpeechRate = localStorage.getItem("speech_rate");
    if (savedSpeechRate) {
      setSpeechRate(parseFloat(savedSpeechRate));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("dutch-translate-input", inputText);
  }, [inputText]);

  useEffect(() => {
    localStorage.setItem("dutch-translate-output", translatedText);
  }, [translatedText]);

  useEffect(() => {
    localStorage.setItem("dutch-translate-direction", translationDirection);
  }, [translationDirection]);

  useEffect(() => {
    localStorage.setItem("dutch-translate-final-dutch", finalDutch);
  }, [finalDutch]);

  useEffect(() => {
    localStorage.setItem("dutch-translate-final-english", finalEnglish);
  }, [finalEnglish]);

  useEffect(() => {
    if (selectedDeckId) {
      localStorage.setItem("dutch-translate-selected-deck-id", selectedDeckId);
    }
  }, [selectedDeckId]);

  useEffect(() => {
    if (cachedDutchDictionary) {
      setDutchDictionary(cachedDutchDictionary);
      return;
    }

    const loadDictionary = async () => {
      try {
        const res = await fetch("/dutch_dictionary.txt");
        if (!res.ok) throw new Error("Failed to load dictionary");
        const text = await res.text();
        const words = text.split(/\r?\n/).filter(Boolean);
        const dictSet = new Set(words);
        cachedDutchDictionary = dictSet;
        setDutchDictionary(dictSet);
      } catch (err) {
        console.error("Failed to fetch dictionary", err);
      }
    };

    loadDictionary();
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

  const handleTranslate = async () => {
    const text = inputText.trim();
    if (!text) return;

    setLoading(true);
    setError("");
    setSuccessMessage("");
    setTranslatedText("");
    setFinalDutch("");
    setFinalEnglish("");
    setUseSlowSpeech(false);
    setLastSpeechText("");

    try {
      const langpair = translationDirection === "nl-en" ? "nl|en" : "en|nl";
      const response = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
          text
        )}&langpair=${langpair}`
      );
      if (!response.ok) {
        throw new Error("Translation request failed.");
      }
      const data = await response.json();
      if (data.responseData && data.responseData.translatedText) {
        // Clear HTML entities if returned (like &apos; or &quot;)
        const parser = new DOMParser();
        const doc = parser.parseFromString(data.responseData.translatedText, "text/html");
        const resultText = doc.documentElement.textContent || data.responseData.translatedText;
        setTranslatedText(resultText);

        if (translationDirection === "nl-en") {
          setFinalDutch(text);
          setFinalEnglish(resultText);
        } else {
          setFinalDutch(resultText);
          setFinalEnglish(text);
        }
      } else {
        throw new Error("Could not translate this word.");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to fetch translation. Please check your internet connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleTranslate();
  };

  // Check spelling on Dutch text against the actual Dutch dictionary
  const spellingErrors = useMemo(() => {
    if (translationDirection !== "nl-en") return [];
    if (!finalDutch.trim() || !dutchDictionary || dutchDictionary.size === 0) return [];
    
    const words = finalDutch.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, " ").split(/\s+/).filter(Boolean);
    const errors: string[] = [];
    
    words.forEach(word => {
      if (!isNaN(Number(word))) return;
      if (word.length <= 1) return;
      
      const commonExclusions = ["ik", "je", "ze", "we", "me", "u", "er", "te", "om", "en", "of", "de", "het", "een", "in", "op", "aan", "bij", "met", "van", "naar", "voor", "uit", "door", "over", "om", "na", "tot", "als", "dan", "dat", "die", "dit", "deze", "gene", "zulk", "zo", "hoe", "wat", "wie", "waar", "wanneer", "waarom", "omdat", "hoewel", "tenzij", "mits", "india", "nidhi", "nederlands", "engels", "english", "dutch"];
      
      if (commonExclusions.includes(word)) return;
      
      if (!dutchDictionary.has(word)) {
        errors.push(word);
      }
    });
    
    return [...new Set(errors)];
  }, [finalDutch, dutchDictionary, translationDirection]);

  const existingDeckMatches = useMemo(() => {
    if (!finalDutch.trim()) return [];
    const search = finalDutch.trim().toLowerCase();
    const matches: { deckName: string; english: string }[] = [];
    decks.forEach((deck) => {
      deck.cards.forEach((card) => {
        if (card.dutch.trim().toLowerCase() === search) {
          matches.push({ deckName: deck.name, english: card.english });
        }
      });
    });
    return matches;
  }, [decks, finalDutch]);

  const handleAddToDeck = () => {
    const dutchWord = finalDutch.trim();
    const englishWord = finalEnglish.trim();
    if (!dutchWord || !englishWord) return;

    const targetDeckId = selectedDeckId || (decks.length > 0 ? decks[0].id : null);
    if (!targetDeckId) {
      setError("Please create a deck first in the Flashcards section.");
      return;
    }

    const newCard: Flashcard = {
      id: createId(),
      dutch: dutchWord,
      english: englishWord,
      known: false,
      difficult: false,
    };

    const updatedDecks = decks.map((deck) => {
      if (deck.id === targetDeckId) {
        return {
          ...deck,
          cards: [...deck.cards, newCard],
        };
      }
      return deck;
    });

    setDecks(updatedDecks);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedDecks));
    
    const deckName = decks.find((d) => d.id === targetDeckId)?.name || "selected";
    setSuccessMessage(`Added "${dutchWord}" to the "${deckName}" deck!`);
    setTimeout(() => setSuccessMessage(""), 4000);
  };

  const replaceInputWord = (oldWord: string, newWord: string) => {
    const regex = new RegExp(`\\b${oldWord}\\b`, "gi");
    setInputText((prev) => {
      return prev.replace(regex, (match) => {
        if (match[0] === match[0].toUpperCase()) {
          return newWord.charAt(0).toUpperCase() + newWord.slice(1);
        }
        return newWord;
      });
    });
    setFinalDutch("");
    setTranslatedText("");
  };

  return (
    <section className="rounded-2xl bg-white p-6 shadow">
      <h2 className="text-xl font-bold">
        {translationDirection === "nl-en" ? "Dutch ➔ English Translator" : "English ➔ Dutch Translator"}
      </h2>
      <p className="mt-1 text-sm text-gray-650">
        Translate any {translationDirection === "nl-en" ? "Dutch word or phrase to English" : "English word or phrase to Dutch"}, hear its pronunciation, and save it as a flashcard.
      </p>

      <form onSubmit={handleSubmit} className="mt-6">
        <div className="flex flex-col gap-3">
          {/* Direction Selector Panel */}
          <div className="flex items-center justify-between bg-gray-50 rounded-xl p-2 select-none border border-gray-150">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider pl-2">Translation Mode:</span>
            <div className="flex bg-gray-200/70 rounded-lg p-0.5">
              <button
                  type="button"
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      translationDirection === "nl-en"
                          ? "bg-white text-gray-900 shadow-sm font-semibold"
                          : "text-gray-500 hover:text-gray-900"
                  }`}
                  onClick={() => {
                    setTranslationDirection("nl-en");
                    setInputText("");
                    setTranslatedText("");
                    setFinalDutch("");
                    setFinalEnglish("");
                    setError("");
                  }}
              >
                NL → EN
              </button>
              <button
                  type="button"
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      translationDirection === "en-nl"
                          ? "bg-white text-gray-900 shadow-sm font-semibold"
                          : "text-gray-500 hover:text-gray-900"
                  }`}
                  onClick={() => {
                    setTranslationDirection("en-nl");
                    setInputText("");
                    setTranslatedText("");
                    setFinalDutch("");
                    setFinalEnglish("");
                    setError("");
                  }}
              >
                EN → NL
              </button>
            </div>
          </div>

          <div className="relative">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={translationDirection === "nl-en" ? "Type Dutch word or phrase..." : "Type English word or phrase..."}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 pr-10 text-sm focus:border-gray-900 focus:outline-none resize-y min-h-[100px]"
              rows={3}
              disabled={loading}
              required
            />
            {inputText && (
              <button
                type="button"
                onClick={() => {
                  setInputText("");
                  setTranslatedText("");
                  setFinalDutch("");
                  setFinalEnglish("");
                  setError("");
                }}
                className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Spelling Warnings */}
          {spellingErrors.length > 0 && (
            <div className="rounded-xl bg-orange-50 border border-orange-200/60 p-3 text-sm text-orange-855 text-left animate-fade-in animate-pulse-subtle flex flex-col gap-2">
              <p className="font-semibold flex items-center gap-1.5 text-orange-800">
                ⚠️ Potential spelling mistake{spellingErrors.length > 1 ? "s" : ""}:
              </p>
              <div className="text-xs text-orange-700 leading-relaxed flex flex-col gap-1.5">
                {spellingErrors.map((word) => {
                  const suggestions = dutchDictionary ? getSpellingSuggestions(word, dutchDictionary) : [];
                  return (
                    <div key={word}>
                      The word <span className="font-semibold underline">"{word}"</span> was not found in the Dutch dictionary.
                      {suggestions.length > 0 && (
                        <span className="ml-1 text-orange-900 block sm:inline mt-0.5 sm:mt-0">
                          Did you mean:{" "}
                          {suggestions.map((s, idx) => (
                            <span key={s}>
                              <button
                                type="button"
                                className="font-bold text-orange-950 underline hover:text-orange-800 cursor-pointer inline-block bg-transparent border-none p-0 focus:outline-none"
                                onClick={() => replaceInputWord(word, s)}
                              >
                                {s}
                              </button>
                              {idx < suggestions.length - 1 ? ", " : ""}
                            </span>
                          ))}?
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !inputText.trim()}
            className="w-full rounded-xl bg-gray-900 px-5 py-3 font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? "Translating..." : "Translate"}
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {translatedText && (
        <div className="mt-6 rounded-2xl border border-blue-50 bg-blue-50/30 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 text-left">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Translation</span>
              <p className="mt-2 text-2xl font-bold text-gray-900 whitespace-pre-wrap">{translatedText}</p>
            </div>
            
            <button
              type="button"
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl shadow-md active:scale-95 transition-all duration-300 ${
                useSlowSpeech && finalDutch === lastSpeechText
                  ? "bg-orange-100 text-orange-700 scale-105 ring-2 ring-orange-300"
                  : "bg-blue-100 text-blue-700 hover:bg-blue-200"
              }`}
              onClick={() => handleSpeakDutch(finalDutch)}
              aria-label={
                useSlowSpeech && finalDutch === lastSpeechText
                  ? "Hear slow Dutch pronunciation"
                  : "Hear Dutch pronunciation"
              }
            >
              {useSlowSpeech && finalDutch === lastSpeechText ? "🐢" : "🔊"}
            </button>
          </div>

          <div className="mt-3 flex items-center gap-1.5">
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

          {existingDeckMatches.length > 0 && (
            <div className="mt-5 border-t border-gray-100 pt-4 text-left">
              <span className="text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                ✓ Already in deck: {existingDeckMatches.map((m) => `"${m.deckName}"`).join(", ")}
              </span>
            </div>
          )}

          <div className="mt-5 border-t border-gray-200/60 pt-4 text-left">
            <p className="text-xs font-semibold text-gray-500 mb-2">
              {existingDeckMatches.length > 0 ? "Add to another list" : "Save to Flashcards"}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              {decks.length > 0 ? (
                <>
                  <select
                    value={selectedDeckId}
                    onChange={(e) => setSelectedDeckId(e.target.value)}
                    className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-gray-900 focus:outline-none"
                  >
                    {decks.map((deck) => (
                      <option key={deck.id} value={deck.id}>
                        {deck.name}
                      </option>
                    ))}
                  </select>
                  
                  <button
                    type="button"
                    onClick={handleAddToDeck}
                    className="flex-1 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700 active:scale-95"
                  >
                    + Save Word to Flashcards
                  </button>
                </>
              ) : (
                <p className="text-xs text-gray-500 italic">
                  Go to the Flashcards section to create a deck first.
                </p>
              )}
            </div>
          </div>

          {successMessage && (
            <div className="mt-3 rounded-lg bg-green-50 p-2 text-xs font-medium text-green-700 text-center animate-pulse">
              {successMessage}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

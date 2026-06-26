"use client";

import { useEffect, useMemo, useState } from "react";
import type { Deck, Flashcard } from "../lib/types";
import { createId, speakDutch, STORAGE_KEY } from "../lib/flashcardUtils";

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

  // Alternating speech rate state
  const [lastSpeechText, setLastSpeechText] = useState("");
  const [useSlowSpeech, setUseSlowSpeech] = useState(false);
  const [speechRate, setSpeechRate] = useState<number>(0.6);

  useEffect(() => {
    const savedDecks = localStorage.getItem(STORAGE_KEY);
    if (savedDecks) {
      try {
        const parsedDecks = JSON.parse(savedDecks);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDecks(parsedDecks);
        if (parsedDecks.length > 0) {
          setSelectedDeckId(parsedDecks[0].id);
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

  // Compile a list of all correctly spelled Dutch words from current decks
  const allDutchWords = useMemo(() => {
    const words = new Set<string>();
    decks.forEach(deck => {
      deck.cards.forEach(card => {
        const tokens = card.dutch.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "").split(/\s+/);
        tokens.forEach(t => {
          if (t.length > 1) {
            words.add(t);
          }
        });
      });
    });
    return words;
  }, [decks]);

  // Check spelling on Dutch text (either input for nl-en, or output for en-nl)
  const spellingErrors = useMemo(() => {
    const textToCheck = translationDirection === "nl-en" ? inputText : translatedText;
    if (!textToCheck.trim() || allDutchWords.size === 0) return [];
    
    const words = textToCheck.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, " ").split(/\s+/).filter(Boolean);
    const errors: string[] = [];
    
    words.forEach(word => {
      if (!isNaN(Number(word))) return;
      if (word.length <= 1) return;
      
      const commonExclusions = [
        "ik", "je", "ze", "we", "me", "u", "er", "te", "om", "en", "of", "de", "het", "een", "in", "op", "aan", "bij", "met", "van", "naar", "voor", "uit", "door", "over", "om", "na", "tot", "als", "dan", "dat", "die", "dit", "deze", "gene", "zulk", "zo", "hoe", "wat", "wie", "waar", "wanneer", "waarom", "omdat", "hoewel", "tenzij", "mits", "india", "nidhi", "nederlands", "engels", "english", "dutch",
        // Common Dutch vocabulary words to exclude from spellcheck warning
        "deel", "jaar", "dag", "tijd", "man", "vrouw", "kind", "naam", "land", "stad", "huis", "werk", "leven", "vriend", "moeder", "vader", "zoon", "dochter", "school", "boek", "hand", "oog", "hoofd", "weg", "water", "geld", "recht", "plaats", "week", "maand", "uur", "minuut", "seconde", "wereld", "groot", "klein", "nieuw", "oud", "goed", "slecht", "mooi", "leuk", "lang", "kort", "doen", "maken", "zeggen", "willen", "kunnen", "moeten", "zullen", "mogen", "laten", "zien", "horen", "denken", "weten", "vinden", "geven", "nemen", "houden", "komen", "gaan", "staan", "liggen", "zitten", "vragen", "antwoorden", "heet", "woon", "woont", "wonen"
      ];
      
      if (commonExclusions.includes(word)) return;
      
      if (!allDutchWords.has(word)) {
        errors.push(word);
      }
    });
    
    return [...new Set(errors)];
  }, [inputText, translatedText, allDutchWords, translationDirection]);

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
            <div className="rounded-xl bg-orange-50 border border-orange-200/60 p-3 text-sm text-orange-850 text-left animate-fade-in">
              <p className="font-semibold flex items-center gap-1.5 text-orange-800">
                ⚠️ Potential spelling mistake{spellingErrors.length > 1 ? "s" : ""}:
              </p>
              <p className="mt-1 text-xs text-orange-700 leading-relaxed">
                The word{spellingErrors.length > 1 ? "s" : ""} <span className="font-semibold underline">{spellingErrors.map(w => `"${w}"`).join(", ")}</span> {spellingErrors.length > 1 ? "were" : "was"} not found in your loaded flashcard lists. Note: This spellchecker matches spelling against the Dutch words present in your imported flashcards.
              </p>
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

"use client";

import { useEffect, useMemo, useState } from "react";
import type { Deck, Flashcard } from "../lib/types";
import { createId, speakDutch } from "../lib/flashcardUtils";

export default function TranslateSection() {
  const [inputText, setInputText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [translatedDutchText, setTranslatedDutchText] = useState("");
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
    const savedDecks = localStorage.getItem("dutch-flashcards-decks");
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
    setTranslatedDutchText("");
    setUseSlowSpeech(false);
    setLastSpeechText("");

    try {
      const response = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
          text
        )}&langpair=nl|en`
      );
      if (!response.ok) {
        throw new Error("Translation request failed.");
      }
      const data = await response.json();
      if (data.responseData && data.responseData.translatedText) {
        // Clear HTML entities if returned (like &apos; or &quot;)
        const parser = new DOMParser();
        const doc = parser.parseFromString(data.responseData.translatedText, "text/html");
        setTranslatedText(doc.documentElement.textContent || data.responseData.translatedText);
        setTranslatedDutchText(text);
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

  const existingDeckMatches = useMemo(() => {
    if (!translatedDutchText.trim()) return [];
    const search = translatedDutchText.trim().toLowerCase();
    const matches: { deckName: string; english: string }[] = [];
    decks.forEach((deck) => {
      deck.cards.forEach((card) => {
        if (card.dutch.trim().toLowerCase() === search) {
          matches.push({ deckName: deck.name, english: card.english });
        }
      });
    });
    return matches;
  }, [decks, translatedDutchText]);

  const handleAddToDeck = () => {
    const dutchWord = translatedDutchText.trim();
    const englishWord = translatedText.trim();
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
    localStorage.setItem("dutch-flashcards-decks", JSON.stringify(updatedDecks));
    
    const deckName = decks.find((d) => d.id === targetDeckId)?.name || "selected";
    setSuccessMessage(`Added "${dutchWord}" to the "${deckName}" deck!`);
    setTimeout(() => setSuccessMessage(""), 4000);
  };

  return (
    <section className="rounded-2xl bg-white p-6 shadow">
      <h2 className="text-xl font-bold">Dutch ➔ English Translator</h2>
      <p className="mt-1 text-sm text-gray-600">
        Translate any Dutch word or phrase to English, hear its pronunciation, and save it as a flashcard.
      </p>

      <form onSubmit={handleSubmit} className="mt-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type Dutch word or phrase..."
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-gray-900 focus:outline-none"
              disabled={loading}
              required
            />
            {inputText && (
              <button
                type="button"
                onClick={() => {
                  setInputText("");
                  setTranslatedText("");
                  setTranslatedDutchText("");
                  setError("");
                }}
                className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !inputText.trim()}
            className="rounded-xl bg-gray-900 px-5 py-3 font-semibold text-white transition active:scale-95 disabled:opacity-50"
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
            <div className="flex-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Translation</span>
              <p className="mt-2 text-2xl font-bold text-gray-900">{translatedText}</p>
            </div>
            
            <button
              type="button"
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl shadow-md active:scale-95 transition-all duration-300 ${
                useSlowSpeech && translatedDutchText === lastSpeechText
                  ? "bg-orange-100 text-orange-700 scale-105 ring-2 ring-orange-300"
                  : "bg-blue-100 text-blue-700 hover:bg-blue-200"
              }`}
              onClick={() => handleSpeakDutch(translatedDutchText)}
              aria-label={
                useSlowSpeech && translatedDutchText === lastSpeechText
                  ? "Hear slow Dutch pronunciation"
                  : "Hear Dutch pronunciation"
              }
            >
              {useSlowSpeech && translatedDutchText === lastSpeechText ? "🐢" : "🔊"}
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
            <div className="mt-5 border-t border-gray-100 pt-4">
              <span className="text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                ✓ Already in deck: {existingDeckMatches.map((m) => `"${m.deckName}"`).join(", ")}
              </span>
            </div>
          )}

          <div className="mt-5 border-t border-gray-200/60 pt-4">
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
                    + Add to Deck
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

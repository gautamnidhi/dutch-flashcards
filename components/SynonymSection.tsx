"use client";

import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { Deck, Flashcard, WordRelation } from "../lib/types";
import { createId, speakDutch, speakEnglish, rowsToRelations } from "../lib/flashcardUtils";

export default function SynonymSection() {
  const [relations, setRelations] = useState<WordRelation[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "synonym" | "antonym">("all");
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState("");

  // Reveal states
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [revealAll, setRevealAll] = useState(false);

  // Speech control state
  const [lastSpeechText, setLastSpeechText] = useState("");
  const [useSlowSpeech, setUseSlowSpeech] = useState(false);
  const [speechRate, setSpeechRate] = useState<number>(0.6);

  // Manual input state
  const [newWord, setNewWord] = useState("");
  const [newType, setNewType] = useState<"synonym" | "antonym">("synonym");
  const [newRelated, setNewRelated] = useState("");
  const [newMeaning, setNewMeaning] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showManualForm, setShowManualForm] = useState(false);
  const [showUploadArea, setShowUploadArea] = useState(false);

  useEffect(() => {
    // Load relations
    const savedRelations = localStorage.getItem("dutch-word-relations");
    if (savedRelations) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRelations(JSON.parse(savedRelations));
      } catch (e) {
        console.error("Failed to parse relations", e);
      }
    }

    // Load decks
    const savedDecks = localStorage.getItem("dutch-flashcards-decks");
    if (savedDecks) {
      try {
        const parsedDecks = JSON.parse(savedDecks);
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

  const saveRelations = (newRelations: WordRelation[]) => {
    setRelations(newRelations);
    localStorage.setItem("dutch-word-relations", JSON.stringify(newRelations));
  };

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

  const handleSpeakEnglish = (text: string) => {
    let speakSlow = false;
    if (text === lastSpeechText) {
      speakSlow = !useSlowSpeech;
    }
    setLastSpeechText(text);
    setUseSlowSpeech(speakSlow);
    speakEnglish(text, speakSlow ? 0.4 : speechRate);
  };

  const toggleReveal = (id: string, event?: React.MouseEvent) => {
    if (event) {
      const target = event.target as HTMLElement;
      if (
        target.closest("button") ||
        target.closest("select") ||
        target.closest("option")
      ) {
        return;
      }
    }
    setRevealedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setMessage("");
    setLoading(true);

    const fileName = file.name.toLowerCase();

    try {
      let parsedRelations: WordRelation[] = [];

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
        parsedRelations = rowsToRelations(results.data);
      } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);
        parsedRelations = rowsToRelations(rows);
      } else {
        setError("Please upload a CSV or Excel file.");
        setLoading(false);
        return;
      }

      if (parsedRelations.length === 0) {
        setError(
          "No valid synonyms or antonyms found. Use columns named Word, Type, Related, and Meaning."
        );
        setLoading(false);
        return;
      }

      const merged = [...relations];
      let addedCount = 0;
      parsedRelations.forEach((newRel) => {
        const exists = merged.some(
          (r) =>
            r.word.toLowerCase() === newRel.word.toLowerCase() &&
            r.type === newRel.type &&
            r.related.toLowerCase() === newRel.related.toLowerCase()
        );
        if (!exists) {
          merged.push(newRel);
          addedCount++;
        }
      });

      saveRelations(merged);
      setMessage(`Successfully imported ${addedCount} relations from "${file.name}".`);
      setShowUploadArea(false);
    } catch (err) {
      console.error(err);
      setError("Failed to read file. Please ensure it is a valid format.");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const handleAddManualRelation = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    const w = newWord.trim();
    const r = newRelated.trim();
    const m = newMeaning.trim();

    if (!w || !r || !m) {
      setError("Please fill out all fields.");
      return;
    }

    const exists = relations.some(
      (rel) =>
        rel.word.toLowerCase() === w.toLowerCase() &&
        rel.type === newType &&
        rel.related.toLowerCase() === r.toLowerCase()
    );

    if (exists) {
      setError("This relation already exists in your list.");
      return;
    }

    const newRelation: WordRelation = {
      id: createId(),
      word: w,
      type: newType,
      related: r,
      meaning: m,
    };

    saveRelations([...relations, newRelation]);
    setMessage(`Added "${w}" ➔ "${r}" (${newType}) manually.`);
    setNewWord("");
    setNewRelated("");
    setNewMeaning("");
  };

  const handleDeleteRelation = (id: string) => {
    const filtered = relations.filter((r) => r.id !== id);
    saveRelations(filtered);
    setMessage("Removed relation.");
  };

  const handleClearAllRelations = () => {
    if (window.confirm("Are you sure you want to clear your synonyms & antonyms list?")) {
      saveRelations([]);
      setMessage("Cleared all relations.");
    }
  };

  const handleAddToDeck = (relation: WordRelation) => {
    const targetDeckId = selectedDeckId || (decks.length > 0 ? decks[0].id : null);
    if (!targetDeckId) {
      setError("Please create a deck first in the Flashcards section.");
      return;
    }

    const relationSymbol = relation.type === "synonym" ? "≈" : "≠";
    const relationLabel = relation.type === "synonym" ? "Synonym" : "Antonym";

    const newCard: Flashcard = {
      id: createId(),
      dutch: `${relation.word} (${relationSymbol} ${relation.related})`,
      english: `${relation.meaning} (${relationLabel})`,
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
    setMessage(`Added "${relation.word}" card to the "${deckName}" deck!`);
    setTimeout(() => setMessage(""), 4000);
  };

  const filteredRelations = useMemo(() => {
    return relations.filter((rel) => {
      if (filterType !== "all" && rel.type !== filterType) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          rel.word.toLowerCase().includes(query) ||
          rel.related.toLowerCase().includes(query) ||
          rel.meaning.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [relations, filterType, searchQuery]);

  return (
    <section className="rounded-2xl bg-white p-6 shadow">
      <style>{`
        .perspective-1000 {
          perspective: 1000px;
        }
        .preserve-3d {
          transform-style: preserve-3d;
        }
        .backface-hidden {
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .rotate-y-180 {
          transform: rotateY(180deg);
        }
      `}</style>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Synonyms & Antonyms</h2>
          <p className="mt-1 text-sm text-gray-600">
            Study word relations, hear pronunciations, and export them directly to your decks.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {relations.length > 0 && (
            <button
              type="button"
              onClick={handleClearAllRelations}
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 shadow-sm transition hover:bg-red-100 hover:text-red-800 active:scale-95"
            >
              🗑 Clear List
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setShowUploadArea((v) => !v);
              setShowManualForm(false);
            }}
            className={`rounded-xl px-4 py-2 text-xs font-semibold shadow transition active:scale-95 ${
              showUploadArea
                ? "bg-gray-200 text-gray-800"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {showUploadArea ? "✕ Close Upload" : "↑ Upload List"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowManualForm((v) => !v);
              setShowUploadArea(false);
            }}
            className={`rounded-xl px-4 py-2 text-xs font-semibold shadow transition active:scale-95 ${
              showManualForm
                ? "bg-gray-200 text-gray-800"
                : "bg-gray-900 text-white hover:bg-gray-850"
            }`}
          >
            {showManualForm ? "✕ Close Form" : "+ Add Manually"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {message && (
        <div className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-700 text-center animate-pulse">
          {message}
        </div>
      )}

      {/* Upload area */}
      {showUploadArea && (
        <div className="mt-6 rounded-2xl border-2 border-dashed border-gray-300 p-6 text-center bg-gray-50 transition-all">
          <div className="mx-auto flex max-w-md flex-col items-center">
            <svg
              className="h-10 w-10 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 13h6m-3-3v6m-9 1V4a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
              />
            </svg>
            <p className="mt-3 text-sm font-semibold text-gray-900">Import Relations file</p>
            <p className="mt-1 text-xs text-gray-500">
              CSV or Excel spreadsheet. Columns should include: <strong>Word</strong> (Dutch), <strong>Type</strong> (synonym/antonym), <strong>Related</strong> (Dutch relation), and <strong>Meaning</strong> (English meaning).
            </p>
            <label className="mt-4 cursor-pointer rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow hover:bg-blue-700 active:scale-95 transition-all">
              {loading ? "Reading..." : "Select File"}
              <input
                type="file"
                accept=".csv, .xlsx, .xls"
                onChange={handleFileUpload}
                className="hidden"
                disabled={loading}
              />
            </label>
          </div>
        </div>
      )}

      {/* Manual Entry Form */}
      {showManualForm && (
        <form onSubmit={handleAddManualRelation} className="mt-6 rounded-2xl border border-gray-200 p-5 bg-gray-50/50">
          <h3 className="text-sm font-bold text-gray-800 mb-4">Add Synonym/Antonym Relation</h3>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-5">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Dutch Word</label>
              <input
                type="text"
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                placeholder="e.g. groot"
                className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                required
              />
            </div>
            
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Relation Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as "synonym" | "antonym")}
                className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-900 focus:outline-none h-[38px]"
              >
                <option value="synonym">Synonym (≈)</option>
                <option value="antonym">Antonym (≠)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Related Word</label>
              <input
                type="text"
                value={newRelated}
                onChange={(e) => setNewRelated(e.target.value)}
                placeholder="e.g. reusachtig"
                className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">English Meaning</label>
              <input
                type="text"
                value={newMeaning}
                onChange={(e) => setNewMeaning(e.target.value)}
                placeholder="e.g. large / giant"
                className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                required
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="w-full rounded-xl bg-gray-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-gray-800 transition active:scale-95"
              >
                + Add Row
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Filters and Search */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setFilterType("all")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              filterType === "all"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            All ({relations.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType("synonym")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              filterType === "synonym"
                ? "bg-emerald-500 text-white shadow-sm font-bold"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Synonyms ({relations.filter((r) => r.type === "synonym").length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType("antonym")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              filterType === "antonym"
                ? "bg-rose-500 text-white shadow-sm font-bold"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Antonyms ({relations.filter((r) => r.type === "antonym").length})
          </button>
        </div>

        <div className="flex flex-1 max-w-sm">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search word, synonym/antonym, meaning..."
            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-xs focus:border-gray-900 focus:outline-none"
          />
        </div>
      </div>

      {/* Global Speed Selector */}
      {filteredRelations.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-gray-100 pt-4">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 mr-1">Voice Speed:</span>
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

          <button
            type="button"
            onClick={() => {
              const nextRevealAll = !revealAll;
              setRevealAll(nextRevealAll);
              setRevealedIds({});
            }}
            className="rounded-xl bg-gray-100 hover:bg-gray-250 px-4 py-2 text-xs font-semibold text-gray-700 transition active:scale-95 shadow-sm"
          >
            {revealAll ? "👁 Hide All" : "👁 Reveal All"}
          </button>
        </div>
      )}

      {/* Deck select tool for saves */}
      {filteredRelations.length > 0 && decks.length > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-gray-50 border border-gray-100 p-3 text-xs text-gray-600">
          <span className="font-semibold">Target Practice Deck:</span>
          <select
            value={selectedDeckId}
            onChange={(e) => setSelectedDeckId(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs focus:outline-none"
          >
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-gray-400"> (Relations saved here will appear as cards)</span>
        </div>
      )}

      {/* Relations Grid list */}
      <div className="mt-6">
        {filteredRelations.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-12 text-center text-gray-500">
            <p className="font-medium">No synonyms or antonyms found.</p>
            <p className="mt-1 text-xs text-gray-400">
              {relations.length === 0
                ? 'Upload a spreadsheet or use "+ Add Manually" to begin study.'
                : "Try a different search query or filter."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredRelations.map((rel) => {
              const isRevealed = revealAll || !!revealedIds[rel.id];
              return (
                <div
                  key={rel.id}
                  className="perspective-1000 w-full h-[270px] group"
                >
                  <div
                    onClick={(e) => toggleReveal(rel.id, e)}
                    className={`relative w-full h-full duration-500 preserve-3d transition-transform ${
                      isRevealed ? "rotate-y-180" : ""
                    }`}
                  >
                    {/* FRONT SIDE (Card Front) */}
                    <div className="absolute inset-0 w-full h-full backface-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between cursor-pointer select-none">
                      <div>
                        {/* Top row */}
                        <div className="flex items-center justify-between">
                          <span className={`rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            rel.type === "synonym"
                              ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                              : "bg-rose-50 border-rose-100 text-rose-700"
                          }`}>
                            {rel.type === "synonym" ? "Find Synonym" : "Find Antonym"}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSpeakDutch(rel.word);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 active:scale-95 transition"
                            title="Listen"
                          >
                            🔊
                          </button>
                        </div>

                        {/* Word & Meaning */}
                        <div className="mt-4 text-center">
                          <h3 className="text-2xl font-extrabold text-gray-900 break-all tracking-tight">{rel.word}</h3>
                          <div className="mt-1 flex items-center justify-center gap-1">
                            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Meaning:</span>
                            <span className="text-xs text-gray-600 italic font-medium">{rel.meaning}</span>
                          </div>
                        </div>
                      </div>

                      {/* Click indicator */}
                      <div className="my-2 flex flex-col items-center justify-center p-3 border border-dashed border-gray-200 rounded-xl bg-gray-50/50 group-hover:bg-blue-50/20 group-hover:border-blue-300 transition duration-300">
                        <span className="text-[10px] font-bold text-blue-600">Reveal {rel.type === "synonym" ? "Synonym" : "Antonym"}</span>
                        <span className="text-[8px] text-gray-400 mt-0.5">Click card to flip</span>
                      </div>

                      {/* Footer actions */}
                      <div className="pt-3 border-t border-gray-150 flex items-center justify-between">
                        {decks.length > 0 ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddToDeck(rel);
                            }}
                            className="flex items-center gap-1 rounded-lg bg-green-50 px-2.5 py-1 text-[10px] font-bold text-green-700 hover:bg-green-100 active:scale-95 transition"
                          >
                            + Save to Deck
                          </button>
                        ) : (
                          <span className="text-[10px] text-gray-400 italic">No decks created</span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteRelation(rel.id);
                          }}
                          className="text-red-400 hover:text-red-600 transition active:scale-90 p-1"
                          title="Remove relation"
                        >
                          🗑
                        </button>
                      </div>
                    </div>

                    {/* BACK SIDE (Card Back) */}
                    <div className="absolute inset-0 w-full h-full backface-hidden rotate-y-180 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/40 via-white to-white p-5 shadow-md flex flex-col justify-between cursor-pointer select-none">
                      <div>
                        {/* Top row */}
                        <div className="flex items-center justify-between">
                          <span className={`rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            rel.type === "synonym"
                              ? "bg-emerald-100 border-emerald-200 text-emerald-800"
                              : "bg-rose-100 border-rose-200 text-rose-800"
                          }`}>
                            {rel.type === "synonym" ? "≈ synonym" : "≠ antonym"}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (rel.isEnglishRelated) {
                                handleSpeakEnglish(rel.related);
                              } else {
                                handleSpeakDutch(rel.related);
                              }
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition"
                            title="Listen"
                          >
                            🔊
                          </button>
                        </div>

                        {/* Related word & type */}
                        <div className="mt-4 text-center">
                          <h3 className="text-2xl font-extrabold text-blue-750 break-all tracking-tight">{rel.related}</h3>
                          <div className="mt-1 flex items-center justify-center gap-1">
                            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Type:</span>
                            <span className="text-xs text-gray-600 font-medium uppercase">{rel.type === "synonym" ? "Dutch Synonym" : "Dutch Antonym"}</span>
                          </div>
                        </div>
                      </div>

                      {/* Success / Solved badge */}
                      <div className="my-2 flex flex-col items-center justify-center p-3 border border-emerald-150 rounded-xl bg-emerald-50/40">
                        <span className="text-[10px] font-bold text-emerald-700">Solved</span>
                        <span className="text-[8px] text-emerald-600 mt-0.5">Click to flip back</span>
                      </div>

                      {/* Footer actions (matching the front) */}
                      <div className="pt-3 border-t border-blue-100/50 flex items-center justify-between">
                        {decks.length > 0 ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddToDeck(rel);
                            }}
                            className="flex items-center gap-1 rounded-lg bg-green-50 px-2.5 py-1 text-[10px] font-bold text-green-700 hover:bg-green-100 active:scale-95 transition"
                          >
                            + Save to Deck
                          </button>
                        ) : (
                          <span className="text-[10px] text-gray-400 italic">No decks created</span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteRelation(rel.id);
                          }}
                          className="text-red-400 hover:text-red-650 transition active:scale-90 p-1"
                          title="Remove relation"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}


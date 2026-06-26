"use client";

import { useState } from "react";
import FlashcardsSection from "../components/FlashcardsSection";
import ListeningSection from "../components/ListeningSection";
import TranslateSection from "../components/TranslateSection";
import GrammarSection from "../components/GrammarSection";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"flashcards" | "listening" | "translate" | "grammar">(
    "flashcards"
  );

  function scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
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

        <div className="mb-4 grid grid-cols-4 gap-1.5 rounded-2xl bg-white p-2 shadow text-[10px] sm:text-xs">
          <button
            className={`rounded-xl py-3 font-semibold text-center ${
              activeTab === "flashcards"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-700"
            }`}
            onClick={() => setActiveTab("flashcards")}
          >
            Flashcards
          </button>

          <button
            className={`rounded-xl py-3 font-semibold text-center ${
              activeTab === "listening"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-700"
            }`}
            onClick={() => setActiveTab("listening")}
          >
            Listening
          </button>

          <button
            className={`rounded-xl py-3 font-semibold text-center ${
              activeTab === "translate"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-700"
            }`}
            onClick={() => setActiveTab("translate")}
          >
            Translate
          </button>

          <button
            className={`rounded-xl py-3 font-semibold text-center ${
              activeTab === "grammar"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-700"
            }`}
            onClick={() => setActiveTab("grammar")}
          >
            Grammar
          </button>
        </div>

        {activeTab === "flashcards" && <FlashcardsSection />}
        {activeTab === "listening" && <ListeningSection />}
        {activeTab === "translate" && <TranslateSection />}
        {activeTab === "grammar" && <GrammarSection />}
      </div>

      <button
        className="fixed bottom-4 right-4 z-50 rounded-full bg-gray-900 px-4 py-3 text-sm font-bold text-white shadow-lg active:scale-95"
        onClick={scrollToTop}
        aria-label="Go to top"
      >
        ↑ Top
      </button>
    </main>
  );
}

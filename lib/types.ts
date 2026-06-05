export type Flashcard = {
  id: string;
  dutch: string;
  english: string;
  known: boolean;
  difficult: boolean;
  type?: string;
  topic?: string;
  examSkill?: string;
  reviewCount?: number;
  nextReviewDate?: string;
  lastReviewedDate?: string;
  ease?: number;
  intervalDays?: number;
};

export type Deck = {
  id: string;
  name: string;
  cards: Flashcard[];
  createdAt: string;
};

export type AudioLesson = {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
  fileName?: string;
  fileSize?: number;
};

export type StudyMode = "practice" | "today" | "difficult" | "known";

export type ReviewRating = "again" | "hard" | "good" | "easy";

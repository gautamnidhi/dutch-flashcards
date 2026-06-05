import type { AudioLesson } from "./types";

export const AUDIO_LESSONS_KEY = "dutch-listening-lessons";
export const AUDIO_DB_NAME = "dutch-listening-audio-db";
export const AUDIO_STORE_NAME = "audio-files";

export function getLessonSortParts(title: string) {
  const numbers = title.match(/\d+/g)?.map(Number) || [];

  return {
    disc: numbers.length >= 2 ? numbers[numbers.length - 2] : 0,
    lesson:
      numbers.length >= 1
        ? numbers[numbers.length - 1]
        : Number.MAX_SAFE_INTEGER,
  };
}

export function sortAudioLessons(lessons: AudioLesson[]) {
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

export function normalizeSavedLessons(
  lessons: Partial<AudioLesson>[]
): AudioLesson[] {
  return lessons
    .filter((lesson) => lesson.id && lesson.title)
    .map((lesson) => ({
      id: String(lesson.id),
      title: String(lesson.title || "Audio lesson").trim(),
      done: Boolean(lesson.done),
      createdAt: lesson.createdAt || new Date().toISOString(),
      fileName: String(lesson.fileName || "").trim(),
      fileSize: Number(lesson.fileSize || 0),
    }));
}

export function openAudioDb(): Promise<IDBDatabase> {
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

export async function saveAudioBlob(id: string, blob: Blob) {
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

export async function getAudioBlob(id: string): Promise<Blob | null> {
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

export async function deleteAudioBlob(id: string) {
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

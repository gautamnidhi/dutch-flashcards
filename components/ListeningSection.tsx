"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AudioLesson } from "../lib/types";
import {
  AUDIO_LESSONS_KEY,
  deleteAudioBlob,
  getAudioBlob,
  normalizeSavedLessons,
  saveAudioBlob,
  sortAudioLessons,
} from "../lib/audioUtils";
import { createId } from "../lib/flashcardUtils";

const AUDIO_PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];

export default function ListeningSection() {
  const [audioLessons, setAudioLessons] = useState<AudioLesson[]>([]);
  const [audioMessage, setAudioMessage] = useState("");
  const [audioError, setAudioError] = useState("");
  const [currentAudioLessonId, setCurrentAudioLessonId] = useState("");
  const [currentAudioUrl, setCurrentAudioUrl] = useState("");
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioPlaybackRate, setAudioPlaybackRate] = useState(1);
  const [audioTouchStartX, setAudioTouchStartX] = useState<number | null>(null);
  const [audioTouchEndX, setAudioTouchEndX] = useState<number | null>(null);
  const [autoplay, setAutoplay] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioPlayRequestRef = useRef(0);

  useEffect(() => {
    const savedLessons = localStorage.getItem(AUDIO_LESSONS_KEY);

    if (savedLessons) {
      try {
        const parsedLessons = normalizeSavedLessons(JSON.parse(savedLessons));
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAudioLessons(sortAudioLessons(parsedLessons));
      } catch {
        localStorage.removeItem(AUDIO_LESSONS_KEY);
      }
    }

    const savedAutoplay = localStorage.getItem("audio_autoplay");
    if (savedAutoplay !== null) {
      setAutoplay(savedAutoplay === "true");
    }
  }, []);

  const toggleAutoplay = () => {
    const nextAutoplay = !autoplay;
    setAutoplay(nextAutoplay);
    localStorage.setItem("audio_autoplay", String(nextAutoplay));
  };

  useEffect(() => {
    localStorage.setItem(AUDIO_LESSONS_KEY, JSON.stringify(audioLessons));
  }, [audioLessons]);

  useEffect(() => {
    return () => {
      if (currentAudioUrl) {
        URL.revokeObjectURL(currentAudioUrl);
      }
    };
  }, [currentAudioUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = audioPlaybackRate;
    }
  }, [audioPlaybackRate]);

  const sortedAudioLessons = useMemo(() => {
    return sortAudioLessons(audioLessons);
  }, [audioLessons]);

  const currentAudioLesson = useMemo(() => {
    return sortedAudioLessons.find(
        (lesson) => lesson.id === currentAudioLessonId
    );
  }, [sortedAudioLessons, currentAudioLessonId]);

  const listeningStats = useMemo(() => {
    const done = audioLessons.filter((lesson) => lesson.done).length;

    return {
      total: audioLessons.length,
      done,
      remaining: audioLessons.length - done,
    };
  }, [audioLessons]);

  const listeningProgressPercent =
      listeningStats.total > 0
          ? Math.round((listeningStats.done / listeningStats.total) * 100)
          : 0;

  async function handleAudioUpload(files: FileList | null) {
    if (!files || files.length === 0) return;

    setAudioMessage("");
    setAudioError("");

    try {
      const newLessons: AudioLesson[] = [];

      const existingFileKeys = new Set(
          audioLessons.map(
              (lesson) =>
                  `${String(lesson.fileName || lesson.title).toLowerCase()}-${
                      lesson.fileSize || 0
                  }`
          )
      );

      let skippedDuplicates = 0;

      for (const file of Array.from(files)) {
        const fileName = file.name.toLowerCase();

        const isAudioFile =
            file.type.startsWith("audio/") ||
            fileName.endsWith(".mp3") ||
            fileName.endsWith(".m4a") ||
            fileName.endsWith(".aac") ||
            fileName.endsWith(".wav") ||
            fileName.endsWith(".ogg");

        if (!isAudioFile) {
          continue;
        }

        const fileKey = `${file.name.toLowerCase()}-${file.size}`;

        if (existingFileKeys.has(fileKey)) {
          skippedDuplicates += 1;
          continue;
        }

        existingFileKeys.add(fileKey);

        const id = createId();
        const cleanTitle = file.name.replace(/\.[^/.]+$/, "");

        await saveAudioBlob(id, file);

        newLessons.push({
          id,
          title: cleanTitle,
          done: false,
          createdAt: new Date().toISOString(),
          fileName: file.name,
          fileSize: file.size,
        });
      }

      if (newLessons.length === 0 && skippedDuplicates > 0) {
        setAudioError(`Skipped ${skippedDuplicates} duplicate file(s).`);
        return;
      }

      if (newLessons.length === 0) {
        setAudioError("Please upload MP3, M4A, AAC, WAV, or OGG audio files.");
        return;
      }

      setAudioLessons((existingLessons) =>
          sortAudioLessons([...existingLessons, ...newLessons])
      );

      setAudioMessage(
          skippedDuplicates > 0
              ? `Uploaded ${newLessons.length} audio lesson(s). Skipped ${skippedDuplicates} duplicate file(s).`
              : `Uploaded ${newLessons.length} audio lesson(s).`
      );
    } catch (error) {
      console.error(error);
      setAudioError("Could not save audio. Your browser storage may be full.");
    }
  }

  async function playAudioLesson(lesson: AudioLesson) {
    setAudioMessage("");
    setAudioError("");

    const requestId = audioPlayRequestRef.current + 1;
    audioPlayRequestRef.current = requestId;

    try {
      const audioElement = audioRef.current;

      if (currentAudioLessonId === lesson.id && audioElement) {
        if (audioElement.paused) {
          try {
            audioElement.playbackRate = audioPlaybackRate;
            await audioElement.play();

            if (audioPlayRequestRef.current === requestId) {
              setIsAudioPlaying(true);
            }
          } catch (error) {
            const playError = error as DOMException;

            if (playError.name !== "AbortError") {
              console.error(error);
              setAudioError("Could not play this audio.");
            }

            setIsAudioPlaying(false);
          }
        } else {
          audioElement.pause();
          setIsAudioPlaying(false);
        }

        return;
      }

      if (audioElement) {
        audioElement.pause();
        audioElement.removeAttribute("src");
        audioElement.load();
      }

      if (currentAudioUrl) {
        URL.revokeObjectURL(currentAudioUrl);
      }

      const blob = await getAudioBlob(lesson.id);

      if (!blob) {
        setAudioError("Audio file was not found. Please upload it again.");
        return;
      }

      if (audioPlayRequestRef.current !== requestId) {
        return;
      }

      const url = URL.createObjectURL(blob);

      setCurrentAudioUrl(url);
      setCurrentAudioLessonId(lesson.id);

      requestAnimationFrame(async () => {
        const freshAudioElement = audioRef.current;

        if (!freshAudioElement || audioPlayRequestRef.current !== requestId) {
          URL.revokeObjectURL(url);
          return;
        }

        try {
          freshAudioElement.src = url;
          freshAudioElement.playbackRate = audioPlaybackRate;
          freshAudioElement.load();

          await freshAudioElement.play();

          if (audioPlayRequestRef.current === requestId) {
            setIsAudioPlaying(true);
          }
        } catch (error) {
          const playError = error as DOMException;

          if (playError.name !== "AbortError") {
            console.error(error);
            setAudioError("Could not play this audio.");
          }

          setIsAudioPlaying(false);
        }
      });
    } catch (error) {
      console.error(error);
      setAudioError("Could not play this audio.");
      setIsAudioPlaying(false);
    }
  }

  function playRelativeAudioLesson(direction: "previous" | "next") {
    if (sortedAudioLessons.length === 0) return;

    const currentAudioIndex = sortedAudioLessons.findIndex(
        (lesson) => lesson.id === currentAudioLessonId
    );

    if (direction === "next" && currentAudioLessonId) {
      setAudioLessons((existingLessons) =>
          sortAudioLessons(
              existingLessons.map((lesson) =>
                  lesson.id === currentAudioLessonId
                      ? { ...lesson, done: true }
                      : lesson
              )
          )
      );
    }

    let nextIndex = 0;

    if (currentAudioIndex >= 0) {
      if (direction === "previous") {
        nextIndex =
            currentAudioIndex === 0
                ? sortedAudioLessons.length - 1
                : currentAudioIndex - 1;
      } else {
        nextIndex =
            currentAudioIndex === sortedAudioLessons.length - 1
                ? 0
                : currentAudioIndex + 1;
      }
    }

    void playAudioLesson(sortedAudioLessons[nextIndex]);
  }

  function toggleLessonDone(lessonId: string) {
    setAudioLessons((existingLessons) =>
        sortAudioLessons(
            existingLessons.map((lesson) =>
                lesson.id === lessonId ? { ...lesson, done: !lesson.done } : lesson
            )
        )
    );
  }

  async function deleteAudioLesson(lesson: AudioLesson) {
    const confirmed = window.confirm(`Delete "${lesson.title}"?`);

    if (!confirmed) return;

    try {
      if (currentAudioLessonId === lesson.id && audioRef.current) {
        audioRef.current.pause();
        setCurrentAudioLessonId("");
        setIsAudioPlaying(false);

        if (currentAudioUrl) {
          URL.revokeObjectURL(currentAudioUrl);
          setCurrentAudioUrl("");
        }
      }

      await deleteAudioBlob(lesson.id);

      setAudioLessons((existingLessons) =>
          sortAudioLessons(existingLessons.filter((item) => item.id !== lesson.id))
      );

      setAudioMessage(`Deleted "${lesson.title}".`);
    } catch (error) {
      console.error(error);
      setAudioError("Could not delete this audio.");
    }
  }

  function handleAudioLessonSwipe(lesson: AudioLesson) {
    if (audioTouchStartX === null || audioTouchEndX === null) return;

    const swipeDistance = audioTouchEndX - audioTouchStartX;
    const minimumSwipeDistance = 80;

    setAudioTouchStartX(null);
    setAudioTouchEndX(null);

    if (Math.abs(swipeDistance) < minimumSwipeDistance) {
      return;
    }

    if (swipeDistance > 0) {
      toggleLessonDone(lesson.id);
    } else {
      void deleteAudioLesson(lesson);
    }
  }

  function clearAllAudioLessons() {
    if (audioLessons.length === 0) return;

    const confirmed = window.confirm(
        "Delete all listening lessons? This cannot be undone."
    );

    if (!confirmed) return;

    Promise.all(audioLessons.map((lesson) => deleteAudioBlob(lesson.id)))
        .then(() => {
          if (audioRef.current) {
            audioRef.current.pause();
          }

          if (currentAudioUrl) {
            URL.revokeObjectURL(currentAudioUrl);
          }

          setAudioLessons([]);
          setCurrentAudioLessonId("");
          setCurrentAudioUrl("");
          setIsAudioPlaying(false);
          setAudioMessage("Deleted all listening lessons.");
        })
        .catch((error) => {
          console.error(error);
          setAudioError("Could not delete all audio lessons.");
        });
  }

  return (
      <>
        <section className="rounded-2xl bg-white p-4 shadow">
          <h2 className="text-xl font-bold">Listening Practice</h2>
          <p className="mt-1 text-sm text-gray-600">
            Upload audio lessons, listen, and mark them as done.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-gray-50 p-3 text-center">
              <p className="text-2xl font-bold">{listeningStats.total}</p>
              <p className="text-xs text-gray-500">Lessons</p>
            </div>

            <div className="rounded-xl bg-gray-50 p-3 text-center">
              <p className="text-2xl font-bold">{listeningStats.done}</p>
              <p className="text-xs text-gray-500">Done</p>
            </div>

            <div className="rounded-xl bg-gray-50 p-3 text-center">
              <p className="text-2xl font-bold">{listeningStats.remaining}</p>
              <p className="text-xs text-gray-500">Left</p>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex justify-between text-sm text-gray-500">
              <span>Progress</span>
              <span>{listeningProgressPercent}%</span>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-gray-200">
              <div
                  className="h-full rounded-full bg-gray-900 transition-all"
                  style={{ width: `${listeningProgressPercent}%` }}
              />
            </div>
          </div>

          <label className="mt-4 block">
          <span className="mb-2 block text-sm font-medium">
            Upload audio lessons
          </span>

            <input
                type="file"
                accept=".mp3,.MP3,.m4a,.M4A,.aac,.AAC,.wav,.WAV,.ogg,.OGG,audio/mpeg,audio/mp3,audio/*"
                multiple
                className="block w-full rounded-lg border border-gray-300 p-2 text-sm"
                onChange={(event) => {
                  handleAudioUpload(event.target.files);
                  event.target.value = "";
                }}
            />
          </label>

          <p className="mt-2 text-xs text-gray-500">
            You can upload multiple MP3/audio files. They are stored on this
            device/browser.
          </p>

          <p className="mt-1 text-xs text-gray-400">
            Swipe right = mark done · Swipe left = delete
          </p>

          {audioMessage && (
              <p className="mt-3 rounded-lg bg-green-50 p-2 text-sm text-green-700">
                {audioMessage}
              </p>
          )}

          {audioError && (
              <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">
                {audioError}
              </p>
          )}
        </section>

        {currentAudioUrl && (
            <section className="mt-4 rounded-2xl bg-white p-4 shadow">
              <p className="mb-2 text-sm font-medium">Now playing</p>

              {currentAudioLesson && (
                  <p className="mb-3 text-sm text-gray-600">
                    {currentAudioLesson.title}
                  </p>
              )}

              <audio
                  ref={audioRef}
                  controls
                  className="w-full"
                  onLoadedMetadata={(event) => {
                    event.currentTarget.playbackRate = audioPlaybackRate;
                  }}
                  onPlay={() => setIsAudioPlaying(true)}
                  onPause={() => setIsAudioPlaying(false)}
                  onEnded={() => {
                    setIsAudioPlaying(false);
                    if (autoplay) {
                      playRelativeAudioLesson("next");
                    }
                  }}
              />

              <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
                <span className="text-sm font-medium">Autoplay next</span>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                      type="checkbox"
                      checked={autoplay}
                      onChange={toggleAutoplay}
                      className="peer sr-only"
                  />
                  <div className="h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-gray-900 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none" />
                </label>
              </div>

              <div className="mt-3">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium">Audio speed</span>
                  <span className="text-gray-500">{audioPlaybackRate}x</span>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {AUDIO_PLAYBACK_RATES.map((rate) => (
                      <button
                          key={rate}
                          type="button"
                          className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                              audioPlaybackRate === rate
                                  ? "bg-gray-900 text-white"
                                  : "bg-gray-100 text-gray-700"
                          }`}
                          onClick={() => setAudioPlaybackRate(rate)}
                      >
                        {rate}x
                      </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                    className="rounded-xl bg-gray-100 px-4 py-3 font-semibold text-gray-700"
                    onClick={() => playRelativeAudioLesson("previous")}
                >
                  ← Previous audio
                </button>

                <button
                    className="rounded-xl bg-gray-900 px-4 py-3 font-semibold text-white"
                    onClick={() => playRelativeAudioLesson("next")}
                >
                  Next audio →
                </button>
              </div>
            </section>
        )}

        <section className="mt-4 space-y-3">
          {audioLessons.length === 0 ? (
              <div className="rounded-2xl bg-white p-6 text-center shadow">
                <p className="text-gray-600">
                  Upload your first audio lesson to start listening practice.
                </p>
              </div>
          ) : (
              sortedAudioLessons.map((lesson) => (
                  <div
                      key={lesson.id}
                      className="rounded-2xl bg-white p-4 shadow"
                      onTouchStart={(event) => {
                        setAudioTouchEndX(null);
                        setAudioTouchStartX(event.targetTouches[0].clientX);
                      }}
                      onTouchMove={(event) => {
                        setAudioTouchEndX(event.targetTouches[0].clientX);
                      }}
                      onTouchEnd={() => handleAudioLessonSwipe(lesson)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="mb-2 flex flex-wrap gap-2">
                          {lesson.done && (
                              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                        Done
                      </span>
                          )}

                          {currentAudioLessonId === lesson.id && isAudioPlaying && (
                              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                        Playing
                      </span>
                          )}
                        </div>

                        <h3 className="font-semibold">{lesson.title}</h3>
                        <p className="mt-1 text-xs text-gray-500">
                          Uploaded {new Date(lesson.createdAt).toLocaleDateString()}
                        </p>
                      </div>

                      <input
                          type="checkbox"
                          checked={lesson.done}
                          onChange={() => toggleLessonDone(lesson.id)}
                          className="mt-1 h-6 w-6"
                          aria-label="Mark lesson done"
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                          className="rounded-xl bg-gray-900 px-3 py-3 text-sm font-semibold text-white"
                          onClick={() => void playAudioLesson(lesson)}
                      >
                        {currentAudioLessonId === lesson.id && isAudioPlaying
                            ? "Pause"
                            : "Play"}
                      </button>

                      <button
                          className={`rounded-xl px-3 py-3 text-sm font-semibold ${
                              lesson.done
                                  ? "bg-green-500 text-white"
                                  : "bg-green-100 text-green-700"
                          }`}
                          onClick={() => toggleLessonDone(lesson.id)}
                      >
                        {lesson.done ? "Done" : "Mark done"}
                      </button>
                    </div>
                  </div>
              ))
          )}
        </section>

        {audioLessons.length > 0 && (
            <button
                className="mt-4 w-full rounded-xl bg-red-50 px-4 py-3 font-semibold text-red-700"
                onClick={clearAllAudioLessons}
            >
              Delete all listening lessons
            </button>
        )}
      </>
  );
}

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
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [customUploadFolder, setCustomUploadFolder] = useState("");
  const [selectedFolderFilter, setSelectedFolderFilter] = useState<string>("all");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioPlayRequestRef = useRef(0);

  // Refs for seamless background audio playback and Media Session integrations
  const nextAudioLessonIdRef = useRef<string>("");
  const nextAudioUrlRef = useRef<string>("");
  const playRelativeAudioLessonRef = useRef<((direction: "previous" | "next") => void) | null>(null);

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

    const savedLastPlayedId = localStorage.getItem("dutch-last-played-audio-id");
    if (savedLastPlayedId) {
      setCurrentAudioLessonId(savedLastPlayedId);
    }

    const savedFolderFilter = localStorage.getItem("dutch-listening-selected-folder-filter");
    if (savedFolderFilter) {
      setSelectedFolderFilter(savedFolderFilter);
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
    if (currentAudioLessonId) {
      localStorage.setItem("dutch-last-played-audio-id", currentAudioLessonId);
    }
  }, [currentAudioLessonId]);

  useEffect(() => {
    if (selectedFolderFilter) {
      localStorage.setItem("dutch-listening-selected-folder-filter", selectedFolderFilter);
    }
  }, [selectedFolderFilter]);

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

  const availableFolders = useMemo(() => {
    const folders = new Set<string>();
    audioLessons.forEach((lesson) => {
      if (lesson.folder) {
        folders.add(lesson.folder);
      }
    });
    return Array.from(folders).sort();
  }, [audioLessons]);

  const filteredAudioLessons = useMemo(() => {
    return sortedAudioLessons.filter((lesson) => {
      if (selectedFolderFilter === "all") return true;
      if (selectedFolderFilter === "uncategorized") return !lesson.folder;
      return lesson.folder === selectedFolderFilter;
    });
  }, [sortedAudioLessons, selectedFolderFilter]);

  const groupedLessons = useMemo(() => {
    const groups: Record<string, AudioLesson[]> = {};
    const uncategorized: AudioLesson[] = [];

    filteredAudioLessons.forEach((lesson) => {
      if (lesson.folder) {
        if (!groups[lesson.folder]) {
          groups[lesson.folder] = [];
        }
        groups[lesson.folder].push(lesson);
      } else {
        uncategorized.push(lesson);
      }
    });

    return { groups, uncategorized };
  }, [filteredAudioLessons]);

  const toggleFolderCollapse = (folderName: string) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderName]: !prev[folderName],
    }));
  };

  const currentAudioLesson = useMemo(() => {
    return filteredAudioLessons.find(
        (lesson) => lesson.id === currentAudioLessonId
    );
  }, [filteredAudioLessons, currentAudioLessonId]);

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

        const pathParts = (file as any).webkitRelativePath ? (file as any).webkitRelativePath.split("/") : [];
        const folder = customUploadFolder.trim()
          ? customUploadFolder.trim()
          : (pathParts.length > 1 ? pathParts.slice(0, -1).join("/") : undefined);

        newLessons.push({
          id,
          title: cleanTitle,
          done: false,
          createdAt: new Date().toISOString(),
          fileName: file.name,
          fileSize: file.size,
          folder,
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

      let url = "";
      if (nextAudioLessonIdRef.current === lesson.id && nextAudioUrlRef.current) {
        url = nextAudioUrlRef.current;
        // Transfer ownership of preloaded url to currentAudioUrl state, clear preload refs
        nextAudioUrlRef.current = "";
        nextAudioLessonIdRef.current = "";
      } else {
        const blob = await getAudioBlob(lesson.id);

        if (!blob) {
          setAudioError("Audio file was not found. Please upload it again.");
          return;
        }

        if (audioPlayRequestRef.current !== requestId) {
          return;
        }

        url = URL.createObjectURL(blob);
      }

      setCurrentAudioUrl(url);
      setCurrentAudioLessonId(lesson.id);

      if (audioElement) {
        try {
          audioElement.src = url;
          audioElement.playbackRate = audioPlaybackRate;
          audioElement.load();

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
      }
    } catch (error) {
      console.error(error);
      setAudioError("Could not play this audio.");
      setIsAudioPlaying(false);
    }
  }

  function playRelativeAudioLesson(direction: "previous" | "next") {
    if (filteredAudioLessons.length === 0) return;

    const currentAudioIndex = filteredAudioLessons.findIndex(
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
                ? filteredAudioLessons.length - 1
                : currentAudioIndex - 1;
      } else {
        nextIndex =
            currentAudioIndex === filteredAudioLessons.length - 1
                ? 0
                : currentAudioIndex + 1;
      }
    }

    void playAudioLesson(filteredAudioLessons[nextIndex]);
  }

  // Keep the ref for stable access inside Media Session handlers
  useEffect(() => {
    playRelativeAudioLessonRef.current = playRelativeAudioLesson;
  }, [playRelativeAudioLesson]);

  // Pre-load the next audio lesson to ensure seamless background playback
  useEffect(() => {
    if (filteredAudioLessons.length <= 1 || !currentAudioLessonId) {
      if (nextAudioUrlRef.current) {
        URL.revokeObjectURL(nextAudioUrlRef.current);
        nextAudioUrlRef.current = "";
      }
      nextAudioLessonIdRef.current = "";
      return;
    }

    const currentIndex = filteredAudioLessons.findIndex(
      (lesson) => lesson.id === currentAudioLessonId
    );
    if (currentIndex < 0) return;

    const nextIndex = (currentIndex + 1) % filteredAudioLessons.length;
    const nextLesson = filteredAudioLessons[nextIndex];

    if (nextAudioLessonIdRef.current === nextLesson.id) {
      return;
    }

    if (nextAudioUrlRef.current) {
      URL.revokeObjectURL(nextAudioUrlRef.current);
      nextAudioUrlRef.current = "";
    }

    nextAudioLessonIdRef.current = nextLesson.id;

    getAudioBlob(nextLesson.id).then((blob) => {
      if (nextAudioLessonIdRef.current === nextLesson.id && blob) {
        nextAudioUrlRef.current = URL.createObjectURL(blob);
      }
    }).catch(err => {
      console.error("Failed to preload next audio lesson blob:", err);
    });

    return () => {
      if (nextAudioUrlRef.current) {
        URL.revokeObjectURL(nextAudioUrlRef.current);
        nextAudioUrlRef.current = "";
      }
      nextAudioLessonIdRef.current = "";
    };
  }, [currentAudioLessonId, filteredAudioLessons]);

  // Set up Media Session API metadata and action handlers
  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) {
      return;
    }

    if (currentAudioLesson) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentAudioLesson.title,
        artist: "Dutch Flashcards",
        album: "Listening Practice",
      });
    } else {
      navigator.mediaSession.metadata = null;
    }
  }, [currentAudioLesson]);

  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) {
      return;
    }
    navigator.mediaSession.playbackState = isAudioPlaying ? "playing" : "paused";
  }, [isAudioPlaying]);

  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) {
      return;
    }

    try {
      navigator.mediaSession.setActionHandler("play", () => {
        audioRef.current?.play();
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        audioRef.current?.pause();
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        playRelativeAudioLessonRef.current?.("previous");
      });
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        playRelativeAudioLessonRef.current?.("next");
      });
    } catch (e) {
      console.warn("Media Session Action Handler registration failed:", e);
    }

    return () => {
      if (typeof window !== "undefined" && "mediaSession" in navigator) {
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
        navigator.mediaSession.setActionHandler("previoustrack", null);
        navigator.mediaSession.setActionHandler("nexttrack", null);
      }
    };
  }, []);

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

      // Clean up preload refs if they point to the deleted lesson
      if (nextAudioLessonIdRef.current === lesson.id) {
        if (nextAudioUrlRef.current) {
          URL.revokeObjectURL(nextAudioUrlRef.current);
          nextAudioUrlRef.current = "";
        }
        nextAudioLessonIdRef.current = "";
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

          // Clean up preload refs
          if (nextAudioUrlRef.current) {
            URL.revokeObjectURL(nextAudioUrlRef.current);
            nextAudioUrlRef.current = "";
          }
          nextAudioLessonIdRef.current = "";

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

  function deleteFolderLessons(folderName: string) {
    const lessonsInFolder = audioLessons.filter((l) => l.folder === folderName);
    if (lessonsInFolder.length === 0) return;

    const confirmed = window.confirm(
      `Delete all ${lessonsInFolder.length} audios in folder "${folderName}"? This cannot be undone.`
    );
    if (!confirmed) return;

    Promise.all(lessonsInFolder.map((lesson) => deleteAudioBlob(lesson.id)))
      .then(() => {
        const isCurrentPlayingInFolder = lessonsInFolder.some((l) => l.id === currentAudioLessonId);
        if (isCurrentPlayingInFolder) {
          if (audioRef.current) {
            audioRef.current.pause();
          }
          if (currentAudioUrl) {
            URL.revokeObjectURL(currentAudioUrl);
          }
          if (nextAudioUrlRef.current) {
            URL.revokeObjectURL(nextAudioUrlRef.current);
            nextAudioUrlRef.current = "";
          }
          nextAudioLessonIdRef.current = "";
          setCurrentAudioLessonId("");
          setCurrentAudioUrl("");
          setIsAudioPlaying(false);
        }

        setAudioLessons((existing) => {
          const next = existing.filter((l) => l.folder !== folderName);
          localStorage.setItem(AUDIO_LESSONS_KEY, JSON.stringify(next));
          return next;
        });

        setAudioMessage(`Deleted all audios in folder "${folderName}".`);
      })
      .catch((error) => {
        console.error(error);
        setAudioError(`Could not delete audios in folder "${folderName}".`);
      });
  }

  function scrollToActiveLesson() {
    if (!currentAudioLessonId) return;

    const currentLesson = audioLessons.find((l) => l.id === currentAudioLessonId);
    if (currentLesson && currentLesson.folder) {
      setCollapsedFolders((prev) => ({
        ...prev,
        [currentLesson.folder!]: false,
      }));
    }

    setTimeout(() => {
      const element = document.getElementById(`audio-lesson-card-${currentAudioLessonId}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  }

  const renderLessonCard = (lesson: AudioLesson) => {
    return (
      <div
        key={lesson.id}
        id={`audio-lesson-card-${lesson.id}`}
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

            <h3 className="font-semibold text-sm sm:text-base text-gray-900 break-all">{lesson.title}</h3>
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
            {currentAudioLessonId === lesson.id && isAudioPlaying ? "Pause" : "Play"}
          </button>

          <button
            className={`rounded-xl px-3 py-3 text-sm font-semibold ${
              lesson.done ? "bg-green-500 text-white" : "bg-green-100 text-green-700"
            }`}
            onClick={() => toggleLessonDone(lesson.id)}
          >
            {lesson.done ? "Done" : "Mark done"}
          </button>
        </div>
      </div>
    );
  };

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

          {availableFolders.length > 0 && (
            <div className="mt-4 flex flex-col gap-1.5 text-xs">
              <label htmlFor="folder-filter" className="font-bold text-gray-500 uppercase tracking-wider text-left">
                📁 Focus Folder / Playlist:
              </label>
              <select
                id="folder-filter"
                value={selectedFolderFilter}
                onChange={(e) => setSelectedFolderFilter(e.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white p-2.5 font-semibold text-gray-750 focus:border-gray-900 focus:outline-none shadow-sm"
              >
                <option value="all">📁 All Folders & Files</option>
                {availableFolders.map((folder) => (
                  <option key={folder} value={folder}>
                    📁 {folder}
                  </option>
                ))}
                {audioLessons.some((l) => !l.folder) && (
                  <option value="uncategorized">📄 Individual Files (Uncategorized)</option>
                )}
              </select>
            </div>
          )}

          <div className="mt-4">
            <span className="mb-1.5 block text-sm font-medium text-gray-700 text-left">
              Assign to Folder (Optional)
            </span>
            <input
              type="text"
              placeholder="e.g. Chapter 1, Vocabulary, Dialogues..."
              value={customUploadFolder}
              onChange={(e) => setCustomUploadFolder(e.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white p-2.5 text-xs focus:border-gray-900 focus:outline-none shadow-sm mb-3"
            />

            <span className="mb-2 block text-sm font-medium text-gray-700 text-left">
              Upload audio lessons
            </span>
            <div className="grid grid-cols-2 gap-3">
              {/* Upload Files Button */}
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 hover:border-gray-900 rounded-2xl p-4 bg-white cursor-pointer active:scale-98 transition-all duration-200">
                <span className="text-2xl mb-1" role="img" aria-label="file">📄</span>
                <span className="text-xs font-semibold text-gray-750">Upload Files</span>
                <span className="text-[10px] text-gray-400 mt-0.5 text-center">Select multiple audios</span>
                <input
                  type="file"
                  accept=".mp3,.MP3,.m4a,.M4A,.aac,.AAC,.wav,.WAV,.ogg,.OGG,audio/mpeg,audio/mp3,audio/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    handleAudioUpload(event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>

              {/* Upload Folder Button */}
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 hover:border-gray-900 rounded-2xl p-4 bg-white cursor-pointer active:scale-98 transition-all duration-200">
                <span className="text-2xl mb-1" role="img" aria-label="folder">📁</span>
                <span className="text-xs font-semibold text-gray-750">Upload Folder</span>
                <span className="text-[10px] text-gray-400 mt-0.5 text-center">Upload folder recursively</span>
                <input
                  type="file"
                  {...({
                    webkitdirectory: "",
                    directory: ""
                  } as any)}
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    handleAudioUpload(event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>

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

              <button
                type="button"
                onClick={scrollToActiveLesson}
                className="mt-3 w-full rounded-xl border border-gray-300 bg-white py-3 text-xs font-semibold text-gray-750 hover:bg-gray-50 active:scale-98 transition-all flex items-center justify-center gap-1.5 shadow-sm"
              >
                <span>🔍</span> Scroll to active lesson in list
              </button>
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
            <>
              {/* Grouped Folder Lessons */}
              {Object.entries(groupedLessons.groups).map(([folderName, lessons]) => {
                const total = lessons.length;
                const doneCount = lessons.filter((l) => l.done).length;
                const isCollapsed = collapsedFolders[folderName] || false;
                const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;

                return (
                  <div key={folderName} className="space-y-2 border-b border-gray-200 pb-3">
                    <button
                      type="button"
                      onClick={() => toggleFolderCollapse(folderName)}
                      className="flex w-full items-center justify-between rounded-xl bg-gray-50 border border-gray-200 p-3 hover:bg-gray-100 transition active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-2 text-left">
                        <span className="text-xl">📁</span>
                        <div>
                          <h4 className="font-bold text-sm text-gray-800 break-all">{folderName}</h4>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-semibold text-gray-500">
                              {doneCount}/{total} completed ({percent}%)
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden hidden sm:block">
                          <div className="h-full bg-green-500" style={{ width: `${percent}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 font-bold">
                          {isCollapsed ? "▼ Expand" : "▲ Collapse"}
                        </span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteFolderLessons(folderName);
                          }}
                          className="ml-1 rounded-lg bg-red-50 p-1.5 text-xs font-semibold text-red-750 hover:bg-red-100 transition active:scale-90"
                          title={`Delete folder "${folderName}"`}
                          aria-label={`Delete folder ${folderName}`}
                        >
                          🗑️
                        </button>
                      </div>
                    </button>

                    {!isCollapsed && (
                      <div className="pl-3 border-l-2 border-gray-200 ml-4 space-y-3 pt-1">
                        {lessons.map((lesson) => renderLessonCard(lesson))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Uncategorized Lessons */}
              {groupedLessons.uncategorized.length > 0 && (
                <div className="space-y-3 pt-2">
                  {Object.keys(groupedLessons.groups).length > 0 && (
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider pl-1">
                      Individual Files
                    </h4>
                  )}
                  {groupedLessons.uncategorized.map((lesson) => renderLessonCard(lesson))}
                </div>
              )}
            </>
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

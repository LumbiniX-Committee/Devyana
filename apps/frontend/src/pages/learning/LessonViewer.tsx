import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Flower2, PlayCircle, Square, Volume2, X, Captions, AlertCircle } from "lucide-react";
import { ZenYouTubePlayer } from "./ZenYouTubePlayer";
import type { LessonNode } from "./types";

function parseTimestamp(timestamp: string) {
  const clean = timestamp.trim().replace(",", ".");
  const parts = clean.split(":");
  if (parts.length < 2) return 0;
  const seconds = Number(parts.pop());
  const minutes = Number(parts.pop());
  const hours = parts.length ? Number(parts.pop()) : 0;
  return hours * 3600 + minutes * 60 + seconds;
}

function parseVtt(vttText: string) {
  if (!vttText || typeof vttText !== "string") return [];
  const normalized = vttText.replace(/\r/g, "").trim();
  const blocks = normalized.split(/\n\n+/);
  const cues: Array<{ start: number; end: number; text: string }> = [];
  blocks.forEach((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length || lines[0].startsWith("WEBVTT") || lines[0].startsWith("NOTE")) return;
    const timingIndex = lines.findIndex((l) => l.includes("-->"));
    if (timingIndex === -1) return;
    const [startRaw, endRaw] = lines[timingIndex].split("-->").map((p) => p.trim().split(/\s+/)[0]);
    const text = lines.slice(timingIndex + 1).join(" ").replace(/<[^>]*>/g, "").trim();
    if (text) cues.push({ start: parseTimestamp(startRaw), end: parseTimestamp(endRaw), text });
  });
  return cues;
}

function formatTime(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

interface LessonViewerProps {
  lesson: LessonNode | null;
  onClose: () => void;
  onComplete: (lessonId: string) => void;
}

function TextLesson({ lesson }: { lesson: NonNullable<LessonViewerProps["lesson"]> }) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const content = lesson.content;

  useEffect(() => {
    setSpeechSupported(typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window);
    return () => { if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel(); };
  }, [lesson.id]);

  const handleListen = () => {
    if (!speechSupported || !content.body) return;
    window.speechSynthesis.cancel();
    const utter = new window.SpeechSynthesisUtterance(content.body);
    utter.lang = content.audioLang || "en-US";
    utter.rate = 0.92;
    utter.pitch = 0.95;
    utter.onend = () => setIsSpeaking(false);
    utter.onerror = () => setIsSpeaking(false);
    utteranceRef.current = utter;
    setIsSpeaking(true);
    window.speechSynthesis.speak(utter);
  };

  const handleStop = () => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  return (
    <div className="lesson-text-content">
      <div className="mb-4 flex items-center gap-2">
        {!isSpeaking ? (
          <button type="button" className="grid h-9 w-9 place-items-center rounded-full border transition-colors hover:bg-black/5" style={{ borderColor: "#E0D7C6" }} onClick={handleListen} disabled={!speechSupported} aria-label="Listen to lesson">
            <Volume2 size={19} aria-hidden="true" />
          </button>
        ) : (
          <button type="button" className="grid h-9 w-9 place-items-center rounded-full border transition-colors" style={{ borderColor: "#C17A5A", backgroundColor: "rgba(193, 122, 90, 0.1)" }} onClick={handleStop} aria-label="Stop read-aloud">
            <Square size={16} aria-hidden="true" />
          </button>
        )}
        <span className="text-xs" style={{ color: "#85705B" }}>{speechSupported ? "Listen to the lesson" : "Read-aloud unavailable"}</span>
      </div>
      <div className="space-y-4 text-sm leading-relaxed" style={{ color: "#5C4B3A", fontFamily: '"Georgia", "Times New Roman", serif' }}>
        {content.body?.split(/\n\n+/).map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
    </div>
  );
}

function VideoLesson({ lesson }: { lesson: NonNullable<LessonViewerProps["lesson"]> }) {
  if (lesson.content.videoUrl) {
    return <ZenYouTubePlayer videoUrl={lesson.content.videoUrl} title={lesson.content.videoTitle ?? lesson.title} playIcon="dharma" />;
  }

  return <LocalVideoLesson lesson={lesson} />;
}

function LocalVideoLesson({ lesson }: { lesson: NonNullable<LessonViewerProps["lesson"]> }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const cueRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const [cues, setCues] = useState<Array<{ start: number; end: number; text: string }>>([]);
  const [subtitlesState, setSubtitlesState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [currentTime, setCurrentTime] = useState(0);
  const content = lesson.content;

  const defaultTrack = useMemo(() => {
    if (!content.subtitles?.length) return null;
    return content.subtitles.find((s) => s.default) || content.subtitles[0];
  }, [content.subtitles]);

  useEffect(() => {
    let isMounted = true;
    setVideoUnavailable(false);
    setCurrentTime(0);
    setCues([]);

    if (!defaultTrack?.src) {
      setSubtitlesState("empty");
      return () => { isMounted = false; };
    }

    setSubtitlesState("loading");
    fetch(defaultTrack.src)
      .then((r) => { if (!r.ok) throw new Error("Subtitle file unavailable"); return r.text(); })
      .then((text) => {
        if (!isMounted) return;
        const parsed = parseVtt(text);
        setCues(parsed);
        setSubtitlesState(parsed.length ? "ready" : "empty");
      })
      .catch(() => { if (isMounted) setSubtitlesState("error"); });

    return () => { isMounted = false; };
  }, [defaultTrack?.src, lesson.id]);

  const activeCueIndex = useMemo(() => cues.findIndex((cue) => currentTime >= cue.start && currentTime < cue.end), [cues, currentTime]);

  useEffect(() => {
    if (activeCueIndex < 0) return;
    const active = cueRefs.current[activeCueIndex];
    if (active && transcriptRef.current) active.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeCueIndex]);

  const handleCueClick = (cue: typeof cues[0]) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = cue.start + 0.05;
    setCurrentTime(cue.start + 0.05);
    videoRef.current.play().catch(() => undefined);
  };

  return (
    <div className="lesson-video-content">
      <div className="video-frame mb-4">
        <video ref={videoRef} controls preload="metadata" poster={content.poster} className="w-full rounded-xl" onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)} onError={() => setVideoUnavailable(true)}>
          <source src={content.src} type="video/mp4" onError={() => setVideoUnavailable(true)} />
          {content.subtitles?.map((subtitle) => (
            <track key={`${subtitle.srclang}-${subtitle.label}`} kind="subtitles" src={subtitle.src} srcLang={subtitle.srclang} label={subtitle.label} default={Boolean(subtitle.default)} />
          ))}
        </video>
        {videoUnavailable && (
          <div className="flex items-center gap-3 rounded-xl border p-4 text-sm" style={{ borderColor: "rgba(184, 92, 74, 0.3)", backgroundColor: "rgba(184, 92, 74, 0.05)" }}>
            <AlertCircle size={22} style={{ color: "#B85C4A" }} />
            <div>
              <strong style={{ color: "#5C4B3A" }}>Video asset unavailable</strong>
              <span className="block text-xs mt-1" style={{ color: "#85705B" }}>Add the MP4 later and this player will work automatically.</span>
            </div>
          </div>
        )}
      </div>
      <section className="transcript-panel" aria-label="Interactive transcript">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "#85705B" }}><Captions size={16} /> Interactive transcript</span>
          {defaultTrack && <em className="text-xs" style={{ color: "#B0A090" }}>{defaultTrack.label}</em>}
        </div>
        {subtitlesState === "loading" && <p className="text-sm" style={{ color: "#85705B" }}>Loading transcript...</p>}
        {subtitlesState === "ready" && (
          <div ref={transcriptRef} className="max-h-48 space-y-1 overflow-y-auto">
            {cues.map((cue, index) => (
              <button key={`${cue.start}-${cue.text}`} type="button" ref={(el) => { cueRefs.current[index] = el; }}
                className={`w-full flex gap-3 rounded-lg p-2 text-left text-xs transition-colors ${activeCueIndex === index ? "bg-[#8B9A6E]/10" : "hover:bg-black/5"}`}
                style={{ fontFamily: '"Georgia", "Times New Roman", serif' }}
                onClick={() => handleCueClick(cue)}>
                <span className="shrink-0 font-medium" style={{ color: "#8B9A6E", minWidth: "36px" }}>{formatTime(cue.start)}</span>
                <p style={{ color: "#5C4B3A" }}>{cue.text}</p>
              </button>
            ))}
          </div>
        )}
        {subtitlesState === "error" && <p className="text-sm" style={{ color: "#B85C4A" }}>Subtitle file is not available yet.</p>}
        {subtitlesState === "empty" && <p className="text-sm" style={{ color: "#85705B" }}>No subtitles available for this video.</p>}
      </section>
    </div>
  );
}

export function LessonViewer({ lesson, onClose, onComplete }: LessonViewerProps) {
  const FONT = '"Georgia", "Times New Roman", serif';

  if (!lesson) {
    return (
      <aside className="rounded-3xl border p-6 text-center" style={{ backgroundColor: "#FDF8F2", borderColor: "rgba(92, 75, 58, 0.16)", boxShadow: "0 14px 34px rgba(60, 40, 20, 0.09)" }}>
        <div className="mb-4 flex justify-center"><Flower2 size={42} strokeWidth={1.3} style={{ color: "#8B9A6E", opacity: 0.6 }} /></div>
        <p className="text-xs font-medium tracking-wide mb-1" style={{ color: "#85705B", fontFamily: FONT }}>Begin the path</p>
        <h2 className="buddha-heading text-lg mb-2" style={{ color: "#5C4B3A" }}>Select a lesson</h2>
        <p className="text-sm" style={{ color: "#85705B", fontFamily: FONT }}>Choose a gold or sage node on the map to open a teaching.</p>
      </aside>
    );
  }

  const isCompleted = lesson.status === "completed";

  return (
    <aside className="rounded-3xl border p-5 sm:p-6" style={{ backgroundColor: "#FDF8F2", borderColor: "rgba(92, 75, 58, 0.16)", boxShadow: "0 14px 34px rgba(60, 40, 20, 0.09)" }}>
      <div className="mb-4 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "#85705B", fontFamily: FONT }}>
          {lesson.type === "video" ? <PlayCircle size={15} /> : <BookOpen size={15} />}
          {lesson.type === "video" ? "Video lesson" : "Text lesson"}
        </span>
        <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-black/5" aria-label="Close lesson viewer">
          <X size={16} />
        </button>
      </div>
      <header className="mb-4">
        <h2 className="buddha-heading text-lg mb-1" style={{ color: "#5C4B3A" }}>{lesson.title}</h2>
        <p className="text-xs" style={{ color: "#85705B", fontFamily: FONT }}>{lesson.description}</p>
      </header>
      {lesson.type === "text" ? <TextLesson lesson={lesson} /> : <VideoLesson lesson={lesson} />}
      <div className="mt-6 flex items-center justify-between rounded-xl border p-4" style={{ borderColor: "rgba(139, 154, 110, 0.2)", backgroundColor: "rgba(139, 154, 110, 0.05)" }}>
        <div className="min-w-0">
          <strong className="block text-sm" style={{ color: "#5C4B3A", fontFamily: FONT }}>{isCompleted ? "Completed lesson" : "Ready to continue?"}</strong>
          <span className="text-xs" style={{ color: "#85705B", fontFamily: FONT }}>{isCompleted ? "Review this teaching any time." : "Continue whenever you are ready. Every lesson remains open."}</span>
        </div>
        <button type="button" onClick={() => !isCompleted && onComplete(lesson.id)}
          className="shrink-0 rounded-full border px-4 py-2 text-xs font-medium transition-colors"
          style={{ borderColor: "#8B9A6E", color: "#8B9A6E", backgroundColor: "white" }}
          aria-label={isCompleted ? "Review completed lesson" : "Continue to the next lesson"}>
          {isCompleted ? "Review" : "Continue"}
        </button>
      </div>
    </aside>
  );
}

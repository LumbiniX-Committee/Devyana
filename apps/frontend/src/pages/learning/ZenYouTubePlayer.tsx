import { useState } from "react";

interface ZenYouTubePlayerProps {
  videoUrl: string;
  title: string;
  playIcon?: "triangle" | "dharma";
}

function getYouTubeEmbedUrl(videoUrl: string) {
  try {
    const url = new URL(videoUrl);
    const hostname = url.hostname.replace(/^www\./, "");
    const videoId = hostname === "youtu.be"
      ? url.pathname.slice(1)
      : url.searchParams.get("v") ?? (url.pathname.startsWith("/embed/") ? url.pathname.split("/")[2] : null);

    if (!videoId) return null;

    const params = new URLSearchParams({ autoplay: "1", rel: "0", modestbranding: "1" });
    const playlist = url.searchParams.get("list");
    if (playlist) params.set("list", playlist);
    return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
  } catch {
    return null;
  }
}

function DharmaWheel() {
  return (
    <svg viewBox="0 0 48 48" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="24" cy="24" r="19" />
      <circle cx="24" cy="24" r="4.5" />
      {Array.from({ length: 8 }, (_, index) => {
        const angle = (index * Math.PI) / 4;
        return <line key={`spoke-${angle}`} x1={24 + Math.cos(angle) * 4.5} y1={24 + Math.sin(angle) * 4.5} x2={24 + Math.cos(angle) * 19} y2={24 + Math.sin(angle) * 19} />;
      })}
    </svg>
  );
}

export function ZenYouTubePlayer({ videoUrl, title, playIcon = "triangle" }: ZenYouTubePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const embedUrl = getYouTubeEmbedUrl(videoUrl);

  if (!embedUrl) {
    return <p className="rounded-xl border p-4 text-sm" style={{ borderColor: "#E0D7C6", color: "#85705B" }}>This video link is unavailable.</p>;
  }

  return (
    <div className="w-full" data-testid="zen-youtube-player">
      <div className="p-3 sm:p-4" style={{ backgroundColor: "#FAF8F5", boxShadow: "0 16px 34px -24px rgba(62,42,36,0.5)" }}>
        <div className="relative aspect-video overflow-hidden" style={{ border: "1px solid #D4AF37", backgroundColor: "#FAF8F5" }}>
          {isPlaying && (
            <iframe
              className="absolute inset-0 h-full w-full"
              src={embedUrl}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}
          <button
            type="button"
            onClick={() => setIsPlaying(true)}
            disabled={isPlaying}
            aria-label={`Play video: ${title}`}
            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-700 ${isPlaying ? "pointer-events-none opacity-0" : "opacity-100"}`}
            style={{
              background: "radial-gradient(circle at center, rgba(212,175,55,0.16), rgba(250,248,245,0) 68%), #FAF8F5",
              cursor: isPlaying ? "default" : "pointer"
            }}
          >
            <span className="absolute inset-4 rounded-full border opacity-20" style={{ borderColor: "#D4AF37" }} aria-hidden="true" />
            <span className="absolute inset-10 rounded-full border opacity-20" style={{ borderColor: "#D4AF37" }} aria-hidden="true" />
            <span className="relative grid h-16 w-16 place-items-center rounded-full border transition-transform hover:scale-105 sm:h-20 sm:w-20" style={{ color: "#3E2A24", backgroundColor: "#D4AF37", borderColor: "#D4AF37" }}>
              {playIcon === "dharma" ? <DharmaWheel /> : <span className="ml-1 text-3xl leading-none" aria-hidden="true">&#9654;</span>}
            </span>
          </button>
        </div>
        <div className="mx-auto mt-3 h-px w-9" style={{ backgroundColor: "#D4AF37" }} aria-hidden="true" />
      </div>
    </div>
  );
}

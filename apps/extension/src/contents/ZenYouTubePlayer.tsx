import { useState } from "react"

interface ZenYouTubePlayerProps {
    videoUrl: string
    title: string
}

function getYouTubeEmbedUrl(videoUrl: string): string | null {
    try {
        const url = new URL(videoUrl)
        const hostname = url.hostname.replace(/^www\./, "")
        const videoId = hostname === "youtu.be"
            ? url.pathname.slice(1)
            : url.searchParams.get("v") ?? (url.pathname.startsWith("/embed/") ? url.pathname.split("/")[2] : null)

        if (!videoId) return null

        const params = new URLSearchParams({ autoplay: "1", rel: "0", modestbranding: "1" })
        const playlist = url.searchParams.get("list")
        if (playlist) params.set("list", playlist)
        return `https://www.youtube.com/embed/${videoId}?${params.toString()}`
    } catch {
        return null
    }
}

function DharmaWheel() {
    return (
        <svg viewBox="0 0 48 48" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <circle cx="24" cy="24" r="19" />
            <circle cx="24" cy="24" r="4.5" />
            {Array.from({ length: 8 }, (_, index) => {
                const angle = (index * Math.PI) / 4
                return <line key={`spoke-${angle}`} x1={24 + Math.cos(angle) * 4.5} y1={24 + Math.sin(angle) * 4.5} x2={24 + Math.cos(angle) * 19} y2={24 + Math.sin(angle) * 19} />
            })}
        </svg>
    )
}

/**
 * The content-script version of the video renderer. It intentionally mounts
 * YouTube only after an explicit click so intervention pages do not preload
 * third-party media.
 */
export function ZenYouTubePlayer({ videoUrl, title }: ZenYouTubePlayerProps) {
    const [isPlaying, setIsPlaying] = useState(false)
    const embedUrl = getYouTubeEmbedUrl(videoUrl)

    if (!embedUrl) {
        return <p className="zen-video-unavailable">This story video is unavailable.</p>
    }

    return (
        <div className="zen-video-player">
            <div className="zen-video-frame">
                {isPlaying && (
                    <iframe
                        className="zen-video-iframe"
                        src={embedUrl}
                        title={title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    />
                )}
                <button
                    type="button"
                    className={`zen-video-overlay ${isPlaying ? "is-playing" : ""}`}
                    onClick={() => setIsPlaying(true)}
                    disabled={isPlaying}
                    aria-label={`Play video: ${title}`}
                >
                    <span className="zen-video-ring zen-video-ring-outer" aria-hidden="true" />
                    <span className="zen-video-ring zen-video-ring-inner" aria-hidden="true" />
                    <span className="zen-video-play" aria-hidden="true"><DharmaWheel /></span>
                </button>
            </div>
            <div className="zen-video-marker" aria-hidden="true" />
        </div>
    )
}

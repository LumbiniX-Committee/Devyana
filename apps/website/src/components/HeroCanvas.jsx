import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useCanvasVideo } from '../hooks/useCanvasVideo';

gsap.registerPlugin(ScrollTrigger);

export default function HeroCanvas({ scrollTrackRef }) {
    const canvasRef = useRef(null);
    const textRef1 = useRef(null);
    const textRef2 = useRef(null);
    const textRef3 = useRef(null);
    const ctaRef = useRef(null);

    // Use the hook to get the image drawing function
    const { drawFrame, isLoading, progress, frameCount } = useCanvasVideo(canvasRef);

    useEffect(() => {
        if (isLoading) return;

        // Initial draw
        drawFrame(0);

        // Resize handler using the current progress
        const handleResize = () => {
            const st = ScrollTrigger.getById("hero-scroll");
            if (st) {
                drawFrame(st.progress * (frameCount - 1));
            }
        };
        window.addEventListener('resize', handleResize);

        // GSAP ScrollTrigger
        // We do NOT pin here. We just track the parent container's progress.
        const tl = gsap.timeline({
            scrollTrigger: {
                id: "hero-scroll",
                trigger: scrollTrackRef.current, // The 300vh container from parent
                start: "top top",
                end: "bottom bottom",
                scrub: 0, // Instant response (no lag) or slight smoothing like 0.1
                onUpdate: (self) => {
                    const frameIndex = Math.floor(self.progress * (frameCount - 1));
                    drawFrame(frameIndex);
                }
            }
        });

        // TEXT ANIMATIONS
        // Sync these to the timeline (0 to 1 progress of the container)

        // Scene 1: THE MISSION (0% - 25%)
        // Visible on load, no scrolling required. Animate in, then scroll away.
        gsap.fromTo(textRef1.current,
            { opacity: 0, scale: 0.92, y: 30 },
            { opacity: 1, scale: 1, y: 0, ease: 'power2.out', duration: 1, delay: 0.2 }
        );
        tl.to(textRef1.current,
            { opacity: 0, scale: 1.1, y: -50, ease: 'power2.in', duration: 0.05 }, 0.2
        );

        // Scene 2: FINANCING PLANS (30% - 60%)
        tl.fromTo(textRef2.current,
            { opacity: 0, x: -50 },
            { opacity: 1, x: 0, ease: 'power2.out', duration: 0.1 }, 0.3
        );
        tl.to(textRef2.current,
            { opacity: 0, x: -50, ease: 'power2.in', duration: 0.05 }, 0.55
        );

        // Scene 3: YOU DESERVE IT (65% - 100%)
        tl.fromTo(textRef3.current,
            { opacity: 0, scale: 0.9, y: 50 },
            { opacity: 1, scale: 1, y: 0, ease: 'power2.out', duration: 0.1 }, 0.65
        );
        // It stays visible until the end, then scrolls away naturally with the sticky container

        // CTA BUTTONS: appear centered on load, glide to bottom-left (home) as scene 2 plays
        const recenter = () => {
            const el = ctaRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            const dx = window.innerWidth / 2 - (r.left + r.width / 2);
            const dy = window.innerHeight * 0.6 - (r.top + r.height / 2);
            gsap.set(el, { x: dx, y: dy });
        };
        recenter();
        tl.to(ctaRef.current, { x: 0, y: 0, ease: 'power2.inOut', duration: 0.2 }, 0.28);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('resize', recenter);
            ScrollTrigger.getById("hero-scroll")?.kill();
            tl.kill();
        };

    }, [isLoading, drawFrame, scrollTrackRef, frameCount]);

    if (isLoading) {
        return (
            <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center text-white">
                <h1 className="font-serif text-2xl tracking-widest mb-4">LOADING EXPERIENCE</h1>
                <div className="w-64 h-0.5 bg-white/20 overflow-hidden">
                    <div
                        className="h-full bg-white transition-all duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full bg-black">
            <canvas
                ref={canvasRef}
                className="block w-full h-full object-cover filter contrast-[1.05] saturate-[1.05]"
            />

            {/* Text Layer */}
            <div className="absolute inset-0 pointer-events-none z-10 mb-40">
                {/* Text 1: Centered */}
                <div className="absolute inset-0 flex items-center justify-center">
<h1 ref={textRef1} className="font-serif text-[clamp(3rem,7vw,6rem)] text-white text-center leading-[0.95] tracking-tighter drop-shadow-2xl">
                            DROP YOUR<br />DISTRACTIONS.<br />
                        </h1>
                </div>

                {/* Text 2: Bottom Left */}
                <div className="absolute inset-0 flex items-end justify-start pb-32 pl-10 md:pl-20">
                    <div>
                        <h1 ref={textRef2} className="font-serif text-[clamp(2.5rem,5vw,4rem)] text-white leading-none opacity-0 drop-shadow-2xl text-left">
                            Your habits.<br />His Path<br />.
                        </h1>
                    </div>
                </div>

                {/* CTA Buttons: centered on load, glide to bottom-left as scene 2 plays */}
                <div ref={ctaRef} className="absolute bottom-32 left-10 md:left-20 z-20 pointer-events-auto">
                    <div className="flex flex-wrap gap-3">
                        <a href="#">
                            <button className="px-8 py-3 bg-white text-black rounded-full font-sans tracking-widest uppercase text-xs font-semibold hover:scale-105 hover:bg-brand-gold transition-all duration-300 shadow-lg">
                                Download App
                            </button>
                        </a>
                        <a href="#">
                            <button className="px-8 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-full text-white font-sans tracking-widest uppercase text-xs hover:bg-brand-gold hover:text-black hover:border-brand-gold transition-all duration-300 shadow-lg hover:scale-105">
                                Download Extension
                            </button>
                        </a>
                    </div>
                </div>

                {/* Text 3: Center */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <h1 ref={textRef3} className="font-serif text-[clamp(3rem,8vw,7rem)] text-white text-center leading-none opacity-0 drop-shadow-2xl">
                        MASTER THE<br />MIDDLE PATH
                    </h1>
                </div>
            </div>
        </div>
    );
}

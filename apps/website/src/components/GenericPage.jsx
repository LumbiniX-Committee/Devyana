import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function GenericPage({ title, subtitle, image }) {
    const { pathname } = useLocation();

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    const isStory = title === "The Story";

    const heading = isStory
        ? "The Buddha, reborn in the digital age"
        : "A path back to clarity";

    const paragraphs = isStory ? [
        "A prince once walked out of his palace to confront suffering. Today, the suffering we know lives in the scan chain — the endless feed, the infinite scroll, the pull of distraction that never lets go.",
        "Vinaya extends the Buddha's original question into the digital world. It watches how you move through the web, not to judge, but to notice. A daemon mirrors that watchfulness across your desktop apps. And an intelligence layer reads the signals — not as data to exploit, but as a map of where attention keeps going off the path.",
        "When distraction threatens, the palm of the Buddha appears. A pause. A breath. A question: why? Two in, two out — and you are back. Vinaya helps you get rid of your distractions and follow the path of the Buddha on your own terms."
    ] : [
        "The Eightfold Path was never about escaping the world — it was about walking it rightly. Vinaya translates that walk into your daily digital life, step by step.",
        "Every tap is met with intention. Every moment of drift is met with a gentle reminder to return. The extension and daemon observe your activity, the intelligence layer evaluates it, and the learning path turns each mistake into the next lesson.",
        "Breathing pauses bring you back. Questions of 'why' bring you home. With time, the path becomes habit — and you move through the digital world the way the Buddha moved through the physical one: aware, unhurried, free."
    ];

    const toolkitList = isStory
        ? ["Browser Extension", "Desktop App", "Intelligence Layer", "The Sangha"]
        : ["Signal Gathering", "Realisability", "Learning Path", "Digital Wellbeing"];

    return (
        <div className="min-h-screen bg-[#0c0c0c] text-white pt-32 px-6">
            <div className="max-w-7xl mx-auto">
                <div className="relative h-[60vh] rounded-[40px] overflow-hidden mb-16">
                    <img
                        src={image || "https://images.unsplash.com/photo-1570215777329-31846baaa7df?q=80&w=2787&auto=format&fit=crop"}
                        alt={title}
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <div className="text-center">
                            <h1 className="font-serif text-6xl md:text-8xl mb-4 text-white drop-shadow-2xl">{title}</h1>
                            <p className="font-sans text-xl tracking-widest uppercase opacity-90">{subtitle}</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-16 mb-32">
                    <div>
                        <h2 className="font-serif text-4xl mb-6">{heading}</h2>
                        {paragraphs.map((text, i) => (
                            <p key={i} className={`font-sans text-lg opacity-70 leading-relaxed ${i < paragraphs.length - 1 ? 'mb-6' : ''}`}>
                                {text}
                            </p>
                        ))}
                    </div>
                    <div className="bg-white/5 p-10 rounded-3xl border border-white/10">
                        <h3 className="font-sans font-bold text-xl mb-6 uppercase tracking-wider">The Vinaya Toolkit</h3>
                        <ul className="space-y-4 font-sans opacity-80">
                            {toolkitList.map((item) => (
                                <li key={item} className="flex items-center gap-4">
                                    <span className="w-2 h-2 bg-brand-gold rounded-full"></span>
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}

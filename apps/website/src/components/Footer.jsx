import { Link } from 'react-router-dom';

export default function Footer() {
    return (
        <footer className="relative w-full bg-black text-white pt-32 pb-10 px-6 md:px-12 border-t border-white/10">
            <div className="max-w-[1920px] mx-auto">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-40">
                    {/* PRODUCT */}
                    <div>
                        <h4 className="font-sans font-bold text-[10px] tracking-[0.2em] text-white/40 mb-8 uppercase">Product</h4>
                        <ul className="space-y-4 font-sans text-sm text-white/80">
                            <li><Link to="/private-jets" className="hover:text-white cursor-pointer transition-colors">The Extension</Link></li>
                            <li><Link to="/villas" className="hover:text-white cursor-pointer transition-colors">The Desktop App</Link></li>
                            <li><Link to="/experiences" className="hover:text-white cursor-pointer transition-colors">The Intelligence Layer</Link></li>
                            <li><Link to="/concierge" className="hover:text-white cursor-pointer transition-colors">The Sangha</Link></li>
                        </ul>
                    </div>

                    {/* THE PATH */}
                    <div>
                        <h4 className="font-sans font-bold text-[10px] tracking-[0.2em] text-white/40 mb-8 uppercase">The Path</h4>
                        <ul className="space-y-4 font-sans text-sm text-white/80">
                            <li className="hover:text-white cursor-pointer">Vows</li>
                            <li className="hover:text-white cursor-pointer">Retreats</li>
                            <li className="hover:text-white cursor-pointer">Ambassadors</li>
                        </ul>
                    </div>

                    {/* SANCTUARY */}
                    <div>
                        <h4 className="font-sans font-bold text-[10px] tracking-[0.2em] text-white/40 mb-8 uppercase">Sanctuary</h4>
                        <ul className="space-y-4 font-sans text-sm text-white/80">
                            <li className="hover:text-white cursor-pointer">Discord</li>
                            <li className="hover:text-white cursor-pointer">GitHub</li>
                            <li className="hover:text-white cursor-pointer">X</li>
                        </ul>
                    </div>

                    {/* PRINCIPLES */}
                    <div>
                        <h4 className="font-sans font-bold text-[10px] tracking-[0.2em] text-white/40 mb-8 uppercase">Principles</h4>
                        <div className="flex gap-2 flex-wrap">
                            <div className="bg-white text-black text-[10px] font-bold px-2 py-1 rounded-sm">OPEN SOURCE</div>
                            <div className="bg-white text-black text-[10px] font-bold px-2 py-1 rounded-sm">LOCAL-FIRST</div>
                            <div className="bg-white text-black text-[10px] font-bold px-2 py-1 rounded-sm">NO ADS</div>
                            <div className="bg-white text-black text-[10px] font-bold px-2 py-1 rounded-sm">PRIVACY-FIRST</div>
                        </div>
                    </div>
                </div>

                {/* BIG FOOTER TEXT */}
                <div className="w-full overflow-hidden border-t border-white/10 pt-10">
                    <h1 className="font-serif text-[clamp(4rem,18vw,20rem)] leading-none text-center tracking-tighter text-white opacity-90 select-none">
                        LUMBINIX
                    </h1>
                </div>

                {/* BOTTOM UTILS */}
                <div className="flex flex-col md:flex-row justify-between items-center mt-10 text-[10px] text-white/40 font-sans uppercase tracking-widest">
                    <p>© 2026 Lumbinix — What if Buddha was born in 2026?</p>
                    <div className="flex gap-8 mt-4 md:mt-0">
                        <span className="cursor-pointer hover:text-white">Privacy Policy</span>
                        <span className="cursor-pointer hover:text-white">Terms</span>
                        <span className="cursor-pointer hover:text-white">Sitemap</span>
                    </div>
                </div>
            </div>
        </footer>
    );
}
import { ReactLenis } from '@studio-freight/react-lenis'
import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header';
import HeroCanvas from './components/HeroCanvas';
import Footer from './components/Footer';
import GenericPage from './components/GenericPage';
import TravelPage from './components/TravelPage';
import ServicePage from './components/ServicePage';
import HomePage from './components/HomePage';
import GalleryPage from './components/GalleryPage'; // Added GalleryPage import
import ContactPage from './components/ContactPage'; // Added ContactPage import
import JournalPage from './components/JournalPage'; // Added JournalPage import

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function App() {
  const lenisOptions = {
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  };

  return (
    <ReactLenis root options={lenisOptions}>
      <Router>
        <div className="bg-[#0c0c0c] min-h-screen text-white selection:bg-white selection:text-black font-sans">
          <Header />
          <ScrollToTop />

          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/journal" element={<JournalPage />} /> {/* Added JournalPage route */}
            <Route path="/about" element={<GenericPage title="The Story" subtitle="What if Buddha was born in 2026?" image="https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?q=80&w=2670&auto=format&fit=crop" />} />
            <Route path="/dates" element={<GenericPage title="The Path" subtitle="Your practice, measured" image="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2673&auto=format&fit=crop" />} />
            <Route path="/travel" element={<TravelPage />} />
            <Route path="/gallery" element={<GalleryPage />} /> {/* Changed to GalleryPage */}
            <Route path="/private-jets" element={
              <ServicePage
                title="The Extension"
                subtitle="Your browser, your sangha"
                heroImage="https://images.unsplash.com/photo-1540962351504-03099e0a754b?q=80&w=2574&auto=format&fit=crop"
                description="A quiet observer that lives inside your browser. It tracks the scroll, skewers the doom-spiral, and hands every tab back to your intention."
                features={[
                  { title: "Behavior Sight", desc: "Real-time browsing patterns" },
                  { title: "Gentle Nudges", desc: "Mid-scroll reality checks" },
                  { title: "Feed Tamer", desc: "A breather for the newsfeed" },
                  { title: "Vow Streaks", desc: "Daily commitments, kept" }
                ]}
              />
            } />
            <Route path="/villas" element={
              <ServicePage
                title="The Desktop App"
                subtitle="Your whole machine, on the path"
                heroImage="https://images.unsplash.com/photo-1613490493576-7fde63acd811?q=80&w=2671&auto=format&fit=crop"
                description="Beyond the browser. The desktop app audits your entire operating system — apps, notifications, night-time screen glow — and recomposes it into a focused, fruitful day."
                features={[
                  { title: "OS Deep Scan", desc: "Every app, audited" },
                  { title: "Focus Modes", desc: "Distraction silos" },
                  { title: "Night Minding", desc: "Sleep / screen balance" },
                  { title: "Weekly Dharma", desc: "A path, re-scoped" }
                ]}
              />
            } />
            <Route path="/experiences" element={
              <ServicePage
                title="The Intelligence Layer"
                subtitle="Your data, his wisdom"
                heroImage="https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=2621&auto=format&fit=crop"
                description="The core. Our AI reads your behavioral data and maps it onto the Noble Eightfold Path — then engineers a personalized practice for each strand of your day."
                features={[
                  { title: "Pattern Engine", desc: "Behavior → insight" },
                  { title: "Eightfold Map", desc: "Personalized practice" },
                  { title: "Progress Rings", desc: "The dukkha, descending" },
                  { title: "AI Parables", desc: "Wisdom in plain words" }
                ]}
              />
            } />
            <Route path="/concierge" element={
              <ServicePage
                title="The Sangha"
                subtitle="Walk it together"
                heroImage="https://images.unsplash.com/photo-1565551984260-60a674488a0b?q=80&w=2574&auto=format&fit=crop"
                description="No path is walked alone. Join a community of practitioners, share vows, compare progress, and let the collective effort carry you past the plateaus."
                features={[
                  { title: "Vow Circles", desc: "Shared commitments" },
                  { title: "Mentors", desc: "Practitioners on call" },
                  { title: "Leaderboards", desc: "The gentle rivalry" },
                  { title: "Retreats", desc: "In real life, offline" }
                ]}
              />
            } />
            <Route path="/contact" element={<ContactPage />} /> {/* Changed to ContactPage */}
            <Route path="/support" element={<GenericPage title="Support" subtitle="We're Here to Help" image="https://images.unsplash.com/photo-1557992260-ec58e38d363c?q=80&w=2574&auto=format&fit=crop" />} />
          </Routes>

          <Footer />
        </div>
      </Router>
    </ReactLenis>
  )
}

export default App

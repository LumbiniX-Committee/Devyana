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
import place1 from './assets/place-1.png';
import place2 from './assets/place-2.png';

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
            <Route path="/about" element={<GenericPage title="The Story" subtitle="What if the Buddha watched our digital lives?" image={place2} />} />
            <Route path="/dates" element={<GenericPage title="The Path" subtitle="Walk the path, free from distraction" image={place1} />} />
            <Route path="/travel" element={<TravelPage />} />
            <Route path="/gallery" element={<GalleryPage />} /> {/* Changed to GalleryPage */}
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

import { useState } from 'react';
import { Sun, Moon } from 'lucide-react';

/**
 * Toggles the html.light class and persists the theme in localStorage.
 * main.tsx initializes the theme from localStorage or the system preference.
 */
export default function ThemeToggle() {
  const [light, setLight] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('light'),
  );
  const toggle = () => {
    const next = !light;
    document.documentElement.classList.toggle('light', next);
    try {
      localStorage.setItem('theme', next ? 'light' : 'dark');
    } catch {
      /* ignore */
    }
    setLight(next);
  };
  return (
    <button
      onClick={toggle}
      aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'}
      title={light ? 'Dark mode' : 'Light mode'}
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl2 border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
    >
      {light ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  );
}

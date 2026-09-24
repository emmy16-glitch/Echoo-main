import './ListenerHeroArtwork.css';
import audioArtwork from '../Assets/echoo-auth-cinematic-headphones.jpeg';

/** Decorative Echoo artwork that never owns layout or pointer events. */
export default function ListenerHeroArtwork({ className = '' }) {
  return (
    <div className={`listener-hero-artwork ${className}`.trim()} aria-hidden="true">
      <img src={audioArtwork} alt="" />
    </div>
  );
}

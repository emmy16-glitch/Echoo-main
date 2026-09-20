import './ListenerHeroArtwork.css';
import audioArtwork from '../Assets/echoo-role-headphones-microphone.png';

/** Decorative Echoo artwork that never owns layout or pointer events. */
export default function ListenerHeroArtwork({ className = '' }) {
  return (
    <div className={`listener-hero-artwork ${className}`.trim()} aria-hidden="true">
      <i className="eb-orb" style={{ width: 220, height: 220, left: -40, top: -40 }} />
      <i className="eb-orb" style={{ width: 160, height: 160, right: -30, bottom: -30, animationDelay: '-7s', opacity: .35 }} />
      <img src={audioArtwork} alt="" />
    </div>
  );
}

import '../UI/EchooAtmosphere.css';
import EchooAtmosphere from '../UI/EchooAtmosphere';

/**
 * Adapter component kept for backwards compatibility. Delegates to
 * `EchooAtmosphere` so the artwork is managed centrally.
 */
export default function ListenerHeroArtwork({ className = '' }) {
  return <EchooAtmosphere className={`listener-hero-artwork ${className}`.trim()} />;
}

/** Listener artwork was decorative only. Keep this compatibility component
 * so existing imports remain stable, but render nothing: Listener should stay
 * visually quiet and never paint a stray background image behind content.
 */
export default function ListenerHeroArtwork() {
  return null;
}

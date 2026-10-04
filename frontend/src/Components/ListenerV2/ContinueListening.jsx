import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { FiPlay } from 'react-icons/fi';
import listenerService from '../../services/listenerService';
import { isAuthenticated, getGuestSession } from '../../services/guestSession';

export default function ContinueListening() {
  const { playTrackAt } = useOutletContext();
  const [tracks, setTracks] = useState([]);
  useEffect(() => {
    let active = true;
    if (isAuthenticated()) listenerService.getContinueListening().then(response => { if (active) setTracks(response.data || []); }).catch(() => {});
    else {
      const session = getGuestSession();
      setTracks((session.recentlyPlayed || []).map(track => ({ ...track, progress: track.duration > 0 ? (session.playbackPosition?.[track.id] || 0) / track.duration * 100 : 0 })));
    }
    return () => { active = false; };
  }, []);
  const unfinished = tracks.filter(track => track.fileUrl && track.progress > 0 && track.progress < 100 && track.duration > 0);
  if (!unfinished.length) return null;
  return <section className="listener-v2-panel"><header className="listener-v2-section-title"><h2>Continue listening</h2></header><div className="listener-v2-audio-list">{unfinished.slice(0, 4).map(track => <article key={track.id || track._id}><span className="listener-v2-audio-art">{track.coverArt && <img src={track.coverArt} alt="" />}</span><div><strong>{track.title}</strong><span>{track.artistName}</span><progress max="100" value={track.progress} aria-label={`${Math.round(track.progress)}% listened`} /></div><button type="button" aria-label={`Resume ${track.title}`} onClick={() => playTrackAt(track, track.progress / 100 * track.duration, unfinished)}><FiPlay /></button></article>)}</div></section>;
}

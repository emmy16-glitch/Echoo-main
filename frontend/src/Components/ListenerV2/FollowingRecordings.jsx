import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { FiPlay } from 'react-icons/fi';
import followService from '../../services/followService';
import audioService from '../../services/audioService';
import { isAuthenticated } from '../../services/guestSession';

export default function FollowingRecordings({ excludeIds = [] }) {
  const navigate = useNavigate();
  const { playTrack } = useOutletContext();
  const [tracks, setTracks] = useState([]);
  const [hasFollowing, setHasFollowing] = useState(false);
  const excludeKey = excludeIds.map((value) => String(value || '')).filter(Boolean).sort().join('|');
  const excluded = useMemo(() => new Set(excludeKey ? excludeKey.split('|') : []), [excludeKey]);
  useEffect(() => {
    let active = true;
    if (!isAuthenticated()) return;
    followService.getFollowingStations().then(async response => {
      const stations = response.data || [];
      if (active) setHasFollowing(stations.length > 0);
      const owners = [...new Set(stations.map(station => station.owner?.id || station.owner?._id || (typeof station.owner === 'string' ? station.owner : null)).filter(Boolean))].slice(0, 12);
      const results = await Promise.allSettled(owners.map(userId => audioService.getAll({ userId, public: true, limit: 8 })));
      if (active) setTracks(
        results
          .flatMap(result => result.status === 'fulfilled' ? result.value.data || [] : [])
          .filter(track => !excluded.has(String(track?.id || track?._id || '')))
          .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
          .slice(0, 8)
      );
    }).catch(() => {});
    return () => { active = false; };
  }, [excludeKey, excluded]);
  return <section className="listener-v2-panel"><header className="listener-v2-section-title"><h2>Following</h2><button type="button" onClick={() => navigate('/listen/following')}>View all</button></header>
    {tracks.length ? <div className="listener-v2-audio-list">{tracks.map(track => <article key={track.id}><span className="listener-v2-audio-art">{track.coverArt && <img src={track.coverArt} alt="" />}</span><div><strong>{track.title}</strong><span>{track.artistName}</span></div><button type="button" aria-label={`Play ${track.title}`} onClick={() => playTrack(track, tracks)}><FiPlay /></button></article>)}</div>
      : <p>{hasFollowing ? 'No new recordings yet.' : 'You’re not following any creators yet.'} <button className="listener-v2-inline-action" type="button" onClick={() => navigate('/listen/search')}>Find creators</button></p>}
  </section>;
}

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { FaCheckCircle, FaEllipsisH, FaHeadphones, FaPause, FaPlay, FaUsers } from 'react-icons/fa';
import followService from '../../services/followService';
import listenerService from '../../services/listenerService';
import { getCreatorProfilePath } from '../../services/profileIdentifier';
import { buildMediaUrl } from '../../services/api';
import { buildGeneratedStationBrandCoverUrl } from '../../stationBranding/stationBranding';
import ListenerToast from '../ListenerUI/ListenerToast';
import echooMark from '../Assets/echoo-logo-official.svg';
import './ListenerFollowing.css';

const idOf = (item) => String(item?.id || item?._id || '');
const formatCount = (value) => {
  const count = Math.max(0, Number(value) || 0);
  return count >= 1000 ? `${Number((count / 1000).toFixed(1))}K` : String(Math.floor(count));
};
const formatDuration = (seconds) => {
  const value = Math.max(0, Number(seconds) || 0);
  if (!value) return '';
  return `${Math.max(1, Math.ceil(value / 60))} min`;
};
const creatorName = (creator) => creator?.displayName || creator?.name || creator?.username || 'Echoo creator';
const creatorHandle = (creator) => creator?.username ? `@${String(creator.username).replace(/^@/, '')}` : 'Creator';
const trackCreator = (track) => track?.artist?.displayName || track?.artist?.username || track?.artistName || track?.station?.name || 'Echoo creator';
const trackArt = (track) => buildMediaUrl(track?.coverArt || track?.artwork || track?.station?.coverArt || null);
const stationArt = (station) => buildMediaUrl(station?.brandCover || station?.coverArt || buildGeneratedStationBrandCoverUrl(station));

const Artwork = ({ src }) => src
  ? <img src={src} alt="" loading="lazy" />
  : <img src={echooMark} alt="" className="following-fallback-mark" />;

const SectionHeader = ({ title, onViewAll }) => (
  <header className="following-section-header">
    <h2>{title}</h2>
    <button type="button" onClick={onViewAll}>View all</button>
  </header>
);

const ListenerFollowing = () => {
  const navigate = useNavigate();
  const { playTrack, currentTrack, isPlaying, togglePlay } = useOutletContext();
  const [stations, setStations] = useState([]);
  const [creators, setCreators] = useState([]);
  const [latest, setLatest] = useState([]);
  const [busyId, setBusyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ open: false, type: 'info', title: '', message: '' });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [stationResult, creatorResult, historyResult] = await Promise.allSettled([
        followService.getFollowingStations(),
        followService.getFollowingCreators(),
        listenerService.getHistory(1, 12),
      ]);
      if (stationResult.status === 'fulfilled') setStations(Array.isArray(stationResult.value?.data) ? stationResult.value.data : []);
      if (creatorResult.status === 'fulfilled') setCreators(Array.isArray(creatorResult.value?.data) ? creatorResult.value.data : []);
      if (historyResult.status === 'fulfilled') setLatest((historyResult.value?.data?.history || []).map((entry) => entry.track).filter(Boolean));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 20000);
    window.addEventListener('focus', load);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', load); };
  }, [load]);

  const unfollowStation = async (station) => {
    const key = idOf(station);
    if (!key || busyId) return;
    try {
      setBusyId(key);
      await followService.unfollowStation(key);
      setStations((current) => current.filter((item) => idOf(item) !== key));
      setToast({ open: true, type: 'success', title: 'Unfollowed', message: `${station.name || 'Station'} was removed.` });
    } catch (error) {
      setToast({ open: true, type: 'error', title: 'Could not unfollow', message: error?.message || 'Please try again.' });
    } finally { setBusyId(''); }
  };

  const unfollowCreator = async (creator) => {
    const key = idOf(creator);
    if (!key || busyId) return;
    try {
      setBusyId(key);
      await followService.unfollowCreator(key);
      setCreators((current) => current.filter((item) => idOf(item) !== key));
      setToast({ open: true, type: 'success', title: 'Unfollowed', message: `${creatorName(creator)} was removed.` });
    } catch (error) {
      setToast({ open: true, type: 'error', title: 'Could not unfollow', message: error?.message || 'Please try again.' });
    } finally { setBusyId(''); }
  };

  const play = (track) => {
    const key = idOf(track);
    if (!key) return;
    if (idOf(currentTrack) === key) { togglePlay(); return; }
    playTrack({ id: key, title: track.title || 'Untitled audio', subtitle: trackCreator(track), fileUrl: track.fileUrl, coverArt: track.coverArt, duration: Number(track.duration) || 0, genre: track.genre || 'Audio' }, latest);
  };

  return (
    <div className="following-page">
      <header className="following-heading">
        <h1>Following</h1>
        <p>People and stations you care about, in one place.</p>
      </header>

      <section className="following-section">
        <SectionHeader title="Creators you follow" onViewAll={() => navigate('/listen/search')} />
        {loading ? <div className="following-skeleton-row"><span /><span /><span /></div> : creators.length ? (
          <div className="following-creators">
            {creators.slice(0, 4).map((creator) => (
              <article className="following-creator-card" key={idOf(creator)}>
                <button type="button" className="following-creator-avatar" onClick={() => navigate(getCreatorProfilePath(creator))} aria-label={`Open ${creatorName(creator)}`}>
                  <Artwork src={buildMediaUrl(creator.profileImage || creator.avatar)} />
                </button>
                <div className="following-creator-copy">
                  <strong>{creatorName(creator)} {Boolean(creator.verified || creator.isVerified) && <FaCheckCircle aria-label="Verified" />}</strong>
                  <span>{creatorHandle(creator)}</span>
                  {Number(creator.followerCount) > 0 && <small>{formatCount(creator.followerCount)} followers</small>}
                </div>
                <button type="button" className="following-button" onClick={() => unfollowCreator(creator)} disabled={busyId === idOf(creator)}>Following</button>
                <button type="button" className="following-more" aria-label={`More options for ${creatorName(creator)}`}><FaEllipsisH /></button>
              </article>
            ))}
          </div>
        ) : <div className="following-empty"><FaUsers /><strong>No creators followed yet</strong><p>Find creators you enjoy and their latest work will appear here.</p></div>}
      </section>

      <section className="following-section">
        <SectionHeader title="Stations you follow" onViewAll={() => navigate('/listen/stations')} />
        {loading ? <div className="following-skeleton-row"><span /><span /><span /></div> : stations.length ? (
          <div className="following-stations">
            {stations.slice(0, 5).map((station) => (
              <article className="following-station-card" key={idOf(station)}>
                <button type="button" className="following-station-art" onClick={() => navigate(`/listen/stations/${idOf(station)}`)}>
                  <Artwork src={stationArt(station)} />
                  {station.isLive && <span><i /> LIVE</span>}
                </button>
                <div className="following-station-copy">
                  <strong>{station.name || 'Unnamed station'}</strong>
                  <span>{station.category || 'Station'} · {formatCount(station.followerCount)} followers</span>
                </div>
                <button type="button" className="following-button following-station-action" onClick={() => unfollowStation(station)} disabled={busyId === idOf(station)}>Following</button>
              </article>
            ))}
          </div>
        ) : <div className="following-empty"><FaHeadphones /><strong>No stations followed yet</strong><p>Explore stations and follow the voices you want to hear again.</p></div>}
      </section>

      <section className="following-section">
        <SectionHeader title="Latest from people you follow" onViewAll={() => navigate('/listen/library')} />
        {latest.length ? (
          <div className="following-latest">
            {latest.slice(0, 4).map((track, index) => {
              const playing = idOf(currentTrack) === idOf(track) && isPlaying;
              return (
                <article className="following-latest-card" key={`${idOf(track)}-${index}`}>
                  <span className="following-latest-art"><Artwork src={trackArt(track)} /></span>
                  <div className="following-latest-copy">
                    <small>New episode</small>
                    <strong>{track.title || 'Untitled audio'}</strong>
                    <span>{trackCreator(track)}{track.duration ? ` · ${formatDuration(track.duration)}` : ''}</span>
                  </div>
                  <button type="button" onClick={() => play(track)} aria-label={playing ? `Pause ${track.title}` : `Play ${track.title}`}>
                    {playing ? <FaPause /> : <FaPlay />}
                  </button>
                </article>
              );
            })}
          </div>
        ) : <div className="following-empty following-empty-compact"><FaPlay /><strong>No recent audio yet</strong></div>}
      </section>

      <ListenerToast {...toast} onClose={() => setToast((current) => ({ ...current, open: false }))} />
    </div>
  );
};

export default ListenerFollowing;

import { useEffect, useState } from 'react';
import { FaChartBar, FaClock, FaComments, FaUsers } from 'react-icons/fa';

import batch3Service from '../../services/batch3Service';

const formatListeningTime = (seconds) => {
  const value = Math.max(0, Number(seconds) || 0);
  if (!value) return 'Collecting';
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const CreatorLiveInsights = ({ broadcastId, presence, onOpenAnalytics }) => {
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    if (!broadcastId) return undefined;
    let active = true;
    const load = () => batch3Service.getLiveAnalytics(broadcastId)
      .then((response) => active && setAnalytics(response?.data || null))
      .catch(() => {});
    load();
    const timer = window.setInterval(load, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [broadcastId]);

  const current = Number(presence?.listenerCount ?? analytics?.currentListeners) || 0;
  const peak = Math.max(Number(presence?.peakListeners) || 0, Number(analytics?.peakListeners) || 0);

  return (
    <section className="ecbs-insights">
      <header><h2>Audience Insights</h2><p>Live overview</p></header>
      <div><article><FaUsers /><span>Active listeners</span><strong>{current}</strong></article><article><FaChartBar /><span>Peak listeners</span><strong>{peak}</strong></article><article><FaClock /><span>Total listening time</span><strong>{formatListeningTime(analytics?.totalListeningSeconds)}</strong></article><article><FaComments /><span>Chat messages</span><strong>{Number(analytics?.chatMessages) || 0}</strong></article><article><FaUsers /><span>Engagement rate</span><strong>{analytics ? `${analytics.engagementRate}%` : 'Collecting'}</strong></article></div>
      <button type="button" onClick={onOpenAnalytics}><FaChartBar /> View full analytics</button>
    </section>
  );
};

export default CreatorLiveInsights;

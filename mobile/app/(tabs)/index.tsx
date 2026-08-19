import { useEffect, useState } from 'react';
import {
  AppTopBar,
  FeaturedPlayer,
  HorizontalRail,
  ListRow,
  MediaCard,
  MiniPlayer,
  PlaylistChip,
  QuickCard,
  SearchPill,
  Screen,
  Section,
} from '@/src/components/EchooMobile';
import { EchooAudio, EchooBroadcast, EchooStation, getMobileDiscovery } from '@/src/services/echooApi';

type Discovery = {
  stations: EchooStation[];
  live: EchooBroadcast[];
  scheduled: EchooBroadcast[];
  audio: EchooAudio[];
};

const emptyDiscovery: Discovery = {
  stations: [],
  live: [],
  scheduled: [],
  audio: [],
};

export default function HomeScreen() {
  const [discovery, setDiscovery] = useState<Discovery>(emptyDiscovery);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getMobileDiscovery()
      .then((next) => {
        if (active) setDiscovery(next);
      })
      .catch((loadError) => {
        if (active) setError(loadError?.message || 'Could not load Echoo.');
      });
    return () => {
      active = false;
    };
  }, []);

  const featuredLive = discovery.live[0];
  const featuredAudio = discovery.audio[0];
  const heroTitle = featuredLive?.title || featuredAudio?.title || 'Echoo Mix';
  const heroSubtitle = featuredLive
    ? `${featuredLive.stationName || 'Live station'} is on air now`
    : featuredAudio?.subtitle || 'Fresh audio from Echoo creators';

  return (
    <Screen>
      <AppTopBar title="Echoo" subtitle="Good evening" />
      <SearchPill />

      <FeaturedPlayer
        title={heroTitle}
        subtitle={heroSubtitle}
        badge={featuredLive ? 'ON AIR' : 'TRENDING'}
        image={featuredLive?.coverArt || featuredAudio?.coverArt || discovery.stations[0]?.coverArt}
      />

      <Section title="Made for you">
        <HorizontalRail>
          <QuickCard title="Daily Echo" subtitle="Fresh picks from stations and creators." />
          <QuickCard title="Live Pulse" subtitle="Rooms getting attention now." tone="#e5484d" icon="headphones" />
          <QuickCard title="New Drops" subtitle="Recently uploaded audio." tone="#12b76a" />
        </HorizontalRail>
      </Section>

      <Section title="Live now" action="All">
        {discovery.live.length ? (
          <HorizontalRail>
            {discovery.live.map((item) => (
              <MediaCard
                key={item.id}
                title={item.title}
                subtitle={`${item.listenerCount || 0} listening`}
                image={item.coverArt}
                live
              />
            ))}
          </HorizontalRail>
        ) : (
          <HorizontalRail>
            <MediaCard title="Quiet now" subtitle="Check again soon" live wide />
            <MediaCard title="Upcoming shows" subtitle="Scheduled broadcasts" wide />
          </HorizontalRail>
        )}
      </Section>

      <Section title="Playlists">
        <HorizontalRail>
          <PlaylistChip title="Top Echoo" />
          <PlaylistChip title="Faith" tone="#173b9c" />
          <PlaylistChip title="Podcasts" tone="#e5484d" />
          <PlaylistChip title="New Music" tone="#12b76a" />
        </HorizontalRail>
      </Section>

      <Section title="Fresh audio" action="More">
        {discovery.audio.length ? (
          <HorizontalRail>
            {discovery.audio.slice(0, 8).map((track) => (
              <MediaCard
                key={track.id}
                title={track.title}
                subtitle={track.subtitle || track.genre || 'Echoo Audio'}
                image={track.coverArt}
              />
            ))}
          </HorizontalRail>
        ) : (
          <>
            <HorizontalRail>
              <MediaCard title="Creator uploads" subtitle="Music and podcasts" />
              <MediaCard title="Echoo playlists" subtitle="Collected by mood" />
              <MediaCard title="Station picks" subtitle="From creators" />
            </HorizontalRail>
            <ListRow title="Fresh audio appears here" subtitle="Published creator audio will fill this feed." meta="Ready" />
          </>
        )}
      </Section>

      <Section title="Recently played">
        {(discovery.audio.length ? discovery.audio.slice(0, 3) : []).map((track) => (
          <ListRow
            key={`recent-${track.id}`}
            title={track.title}
            subtitle={track.subtitle || track.genre || 'Echoo Audio'}
            meta={track.playCount ? `${track.playCount} plays` : 'Audio'}
            image={track.coverArt}
          />
        ))}
        {!discovery.audio.length ? (
          <ListRow title="No recent plays yet" subtitle="Your listening history will appear here." meta="History" />
        ) : null}
      </Section>

      <Section title="Stations to follow" action="Browse">
        {discovery.stations.length ? (
          <HorizontalRail>
            {discovery.stations.map((station) => (
              <MediaCard
                key={station.id}
                title={station.name}
                subtitle={`${station.followerCount || 0} followers`}
                image={station.coverArt}
                live={station.isLive}
              />
            ))}
          </HorizontalRail>
        ) : (
          <HorizontalRail>
            <MediaCard title="Creator stations" subtitle="Channels for live audio" />
            <MediaCard title="Radio rooms" subtitle="Follow and listen" />
          </HorizontalRail>
        )}
      </Section>

      {error ? null : (
        <MiniPlayer
          title={featuredLive?.title || featuredAudio?.title || 'Echoo preview'}
          subtitle={featuredLive?.stationName || featuredAudio?.subtitle || 'Ready to play'}
          image={featuredLive?.coverArt || featuredAudio?.coverArt}
        />
      )}
    </Screen>
  );
}

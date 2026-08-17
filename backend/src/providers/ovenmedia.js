const stripSlash = (value = '') =>
  String(value).replace(/\/+$/, '');

const appName = () =>
  process.env.OME_APP_NAME || 'app';

const vhostName = () =>
  process.env.OME_VHOST || 'default';

const streamName = (broadcastId) =>
  `echoo-${broadcastId}`;

function getApiAuthorization() {
  const value =
    process.env.OME_API_AUTH ||
    process.env.OME_API_KEY ||
    '';

  if (!value) {
    return null;
  }

  if (/^Basic\s+/i.test(value)) {
    return value;
  }

  return `Basic ${value}`;
}

const OvenMediaProvider = {
  getIngestUrl(
    broadcastId,
    protocol = 'rtmp'
  ) {
    if (protocol !== 'rtmp') {
      throw new Error(
        `Unsupported Echoo OME ingest protocol: ${protocol}. Use RTMP.`
      );
    }

    const host =
      process.env.OME_RTMP_HOST ||
      'localhost';

    const port =
      process.env.OME_RTMP_PORT ||
      '1935';

    return (
      `rtmp://${host}:${port}/` +
      `${appName()}/${streamName(broadcastId)}`
    );
  },

  getPlaybackUrls(broadcastId) {
    const configured =
      process.env.OME_PUBLIC_URL ||
      'ws://localhost:3333';

    const base =
      stripSlash(configured);

    const path =
      `${appName()}/${streamName(broadcastId)}`;

    const webrtc =
      `${base}/${path}`;

    const httpBase =
      base
        .replace(/^ws:/i, 'http:')
        .replace(/^wss:/i, 'https:');

    const llhls =
      `${httpBase}/${path}/llhls.m3u8`;

    return {
      webrtc,
      llhls,
    };
  },

  async checkStreamStatus(broadcastId) {
    const apiBase =
      stripSlash(
        process.env.OME_API_URL ||
        'http://localhost:8081'
      );

    const url =
      `${apiBase}/v1/vhosts/` +
      `${encodeURIComponent(vhostName())}/apps/` +
      `${encodeURIComponent(appName())}/streams/` +
      `${encodeURIComponent(streamName(broadcastId))}`;

    const headers = {};

    const authorization =
      getApiAuthorization();

    if (authorization) {
      headers.Authorization =
        authorization;
    }

    try {
      const response =
        await fetch(url, {
          method: 'GET',
          headers,
        });

      return response.ok;
    } catch (error) {
      console.warn(
        'OME stream status check failed:',
        error?.message || error
      );

      return false;
    }
  },
};

export default OvenMediaProvider;

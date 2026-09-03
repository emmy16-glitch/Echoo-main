import batch2Service from './batch2Service.js';

const logoFileFromDataUrl = async (dataUrl) => {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return null;
  }

  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], 'channel-logo.jpg', {
    type: blob.type || 'image/jpeg',
  });
};

const ensureMyChannel = async ({
  name,
  category,
  description,
  logoDataUrl = '',
}) => {
  const existingResponse = await batch2Service.getMyStations().catch(() => null);
  const existingChannels = Array.isArray(existingResponse?.data)
    ? existingResponse.data
    : [];

  if (existingChannels.length > 0) {
    return existingChannels[0];
  }

  const logoFile = await logoFileFromDataUrl(logoDataUrl);

  try {
    const response = await batch2Service.createStation({
      name,
      category,
      description,
      logoFile,
      brandingMode: logoFile ? 'custom' : 'generated',
      isPublic: true,
    });

    return response?.data || null;
  } catch (error) {
    // A retry can arrive after the first request succeeded server-side. Re-read
    // the canonical Channel instead of turning a successful setup into an error.
    if (error?.code !== 'CHANNEL_ALREADY_EXISTS') throw error;

    const retryResponse = await batch2Service.getMyStations();
    const channels = Array.isArray(retryResponse?.data)
      ? retryResponse.data
      : [];

    if (channels.length > 0) return channels[0];
    throw error;
  }
};

export default {
  ensureMyChannel,
};

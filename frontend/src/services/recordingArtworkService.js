import { apiFetch } from './api.js';

const readResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    const text = await response.text();
    data = text ? { message: text } : null;
  }

  if (!response.ok) {
    const error = new Error(
      data?.error?.message || data?.message || 'Could not update recording artwork.'
    );
    error.code = data?.error?.code || 'RECORDING_ARTWORK_UPDATE_FAILED';
    error.status = response.status;
    throw error;
  }

  return data;
};

const recordingArtworkService = {
  update: async (audioId, coverFile) => {
    if (!audioId) throw new Error('Recording ID is missing.');
    if (!coverFile) throw new Error('Choose artwork before uploading.');

    const formData = new FormData();
    formData.append('cover', coverFile);

    const response = await apiFetch(`/audio/${encodeURIComponent(audioId)}/cover`, {
      method: 'PATCH',
      body: formData,
      isFormData: true,
    });

    return readResponse(response);
  },
};

export default recordingArtworkService;

import { GoogleGenAI, Modality } from '@google/genai';
import { env } from '../../config/env.js';
import { validateTranscriptCandidate } from './transcriptValidation.js';

let liveClient = null;
let qualityClient = null;

const requireGeminiKey = () => {
  if (!env.geminiApiKey) {
    const error = new Error('Gemini transcription is not configured.');
    error.status = 503;
    error.code = 'GEMINI_NOT_CONFIGURED';
    throw error;
  }
};

const getLiveClient = () => {
  requireGeminiKey();
  if (!liveClient) {
    liveClient = new GoogleGenAI({
      apiKey: env.geminiApiKey,
      apiVersion: 'v1alpha',
    });
  }
  return liveClient;
};

const getQualityClient = () => {
  requireGeminiKey();
  if (!qualityClient) {
    qualityClient = new GoogleGenAI({
      apiKey: env.geminiApiKey,
      apiVersion: 'v1beta',
    });
  }
  return qualityClient;
};

export const getGeminiDiagnostics = () => ({
  configured: Boolean(env.geminiApiKey),
  liveEnabled: Boolean(env.geminiLiveEnabled && env.geminiApiKey),
  qualityEnabled: Boolean(env.geminiQualityEnabled && env.geminiApiKey),
  liveModel: env.geminiLiveModel,
  qualityModel: env.geminiTranscribeModel,
  rotateSeconds: env.geminiLiveRotateSeconds,
  overlapSeconds: env.geminiLiveOverlapSeconds,
});

export const createGeminiLiveEphemeralToken = async () => {
  if (!env.geminiLiveEnabled) {
    const error = new Error('Gemini Live transcription is disabled.');
    error.status = 503;
    error.code = 'GEMINI_LIVE_DISABLED';
    throw error;
  }
  const client = getLiveClient();
  const now = Date.now();
  const token = await client.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(now + 2 * 60 * 1000).toISOString(),
      liveConnectConstraints: {
        model: env.geminiLiveModel,
        config: {
          responseModalities: [Modality.TEXT],
          inputAudioTranscription: {},
        },
      },
    },
  });
  if (!token?.name) {
    const error = new Error('Gemini did not return an ephemeral token.');
    error.status = 502;
    error.code = 'GEMINI_TOKEN_FAILED';
    throw error;
  }
  return {
    token: token.name,
    model: env.geminiLiveModel,
    rotateSeconds: env.geminiLiveRotateSeconds,
    overlapSeconds: env.geminiLiveOverlapSeconds,
  };
};

export const transcribeGeminiQuality = async ({
  audio,
  mimeType = 'audio/wav',
  originalText = '',
  customVocabulary = [],
  timestamps = false,
  diarization = false,
} = {}) => {
  if (!env.geminiQualityEnabled) {
    return { enabled: false, accepted: false, reason: 'disabled', originalText, qualityText: null };
  }
  if (!Buffer.isBuffer(audio) || !audio.length) {
    const error = new Error('Gemini quality transcription requires an audio buffer.');
    error.code = 'INVALID_QUALITY_AUDIO';
    throw error;
  }

  const config = {};
  const vocabulary = Array.isArray(customVocabulary)
    ? customVocabulary.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 100)
    : [];
  if (vocabulary.length) config.custom_vocabulary = vocabulary;
  if (timestamps) config.timestamp_granularities = ['word'];
  if (diarization) config.diarization_mode = 'speaker';

  const client = getQualityClient();
  const response = await client.interactions.create({
    model: env.geminiTranscribeModel,
    input: [{
      type: 'audio',
      mime_type: mimeType,
      data: audio.toString('base64'),
    }],
    generation_config: Object.keys(config).length ? { transcription_config: config } : undefined,
  });
  const qualityText = String(response?.output_text || '').trim();
  const validation = validateTranscriptCandidate({ originalText, candidateText: qualityText });
  return {
    enabled: true,
    accepted: validation.accepted,
    reason: validation.reason,
    originalText: String(originalText || ''),
    qualityText: qualityText || null,
    text: validation.accepted ? qualityText : String(originalText || ''),
    provider: 'gemini-transcribe',
    model: env.geminiTranscribeModel,
  };
};

export default {
  createGeminiLiveEphemeralToken,
  transcribeGeminiQuality,
  getGeminiDiagnostics,
};

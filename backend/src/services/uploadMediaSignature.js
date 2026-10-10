import path from 'node:path';

const ascii = (buffer, start, end) => buffer.toString('ascii', start, end);

export const matchesUploadedFileSignature = (file, header) => {
  const extension = path.extname(file?.originalname || '').toLowerCase();
  if (!header?.length) return false;

  switch (extension) {
    case '.wav':
      return header.length >= 12 &&
        ascii(header, 0, 4) === 'RIFF' &&
        ascii(header, 8, 12) === 'WAVE';
    case '.flac':
      return header.length >= 4 && ascii(header, 0, 4) === 'fLaC';
    case '.ogg':
    case '.oga':
    case '.opus':
      return header.length >= 4 && ascii(header, 0, 4) === 'OggS';
    case '.webm':
    case '.weba':
      return header.length >= 4 &&
        header[0] === 0x1a &&
        header[1] === 0x45 &&
        header[2] === 0xdf &&
        header[3] === 0xa3;
    case '.mp3':
    case '.mpeg':
    case '.mpga':
    case '.mp2':
    case '.mpa':
      return (
        (header.length >= 3 && ascii(header, 0, 3) === 'ID3') ||
        (header.length >= 2 && header[0] === 0xff && (header[1] & 0xe0) === 0xe0)
      );
    case '.aac':
      return header.length >= 2 &&
        header[0] === 0xff &&
        (header[1] & 0xf0) === 0xf0;
    case '.m4a':
      return header.length >= 12 && ascii(header, 4, 8) === 'ftyp';
    case '.jpg':
    case '.jpeg':
      return header.length >= 3 &&
        header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    case '.png':
      return header.length >= 8 &&
        header.subarray(0, 8).equals(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        );
    case '.webp':
      return header.length >= 12 &&
        ascii(header, 0, 4) === 'RIFF' &&
        ascii(header, 8, 12) === 'WEBP';
    default:
      return false;
  }
};


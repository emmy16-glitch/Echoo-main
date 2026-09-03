import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaCheck, FaMinus, FaPlus, FaTimes, FaUndo } from 'react-icons/fa';
import './ImageCropProvider.css';

const MB = 1024 * 1024;
const SUPPORTED_OUTPUT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getInputDescriptor = (input) => {
  const labelText = Array.from(input.labels || []).map((label) => label.textContent || '').join(' ');
  const nearbyText = input.closest('label')?.textContent || input.parentElement?.textContent || '';
  return [
    input.id,
    input.name,
    input.className,
    input.getAttribute('aria-label'),
    input.getAttribute('title'),
    labelText,
    nearbyText,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

const inferCropShape = (input, descriptor) => {
  const explicit = input.dataset.cropShape;
  if (explicit === 'round' || explicit === 'square') return explicit;
  return /(avatar|profile(?:\s|-)?photo|profile(?:\s|-)?image|portrait|headshot)/.test(descriptor)
    ? 'round'
    : 'square';
};

const inferCropTitle = (input, descriptor, shape) => {
  if (input.dataset.cropTitle) return input.dataset.cropTitle;
  if (/(cover|artwork|thumbnail)/.test(descriptor)) return 'Crop artwork';
  if (/(station|brand)/.test(descriptor)) return 'Crop station image';
  if (/(organization|company).*(logo|image)|(logo|image).*(organization|company)/.test(descriptor)) return 'Crop organization logo';
  if (shape === 'round') return 'Crop profile photo';
  if (/logo/.test(descriptor)) return 'Crop logo';
  return 'Crop image';
};

const inferOriginalLimit = (input, descriptor) => {
  const explicit = Number(input.dataset.cropMaxMb);
  if (Number.isFinite(explicit) && explicit > 0) return explicit * MB;
  if (input.closest('.creator-settings-real')) return 3 * MB;
  if (input.closest('.est-form') || /(station.*logo|station.*brand)/.test(descriptor)) return 5 * MB;
  if (/coverfile|cover image|cover artwork|audio artwork/.test(descriptor)) return 5 * MB;
  return 10 * MB;
};

const outputMimeFor = (file) =>
  SUPPORTED_OUTPUT_TYPES.has(file?.type) ? file.type : 'image/jpeg';

const extensionFor = (mime) => {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
};

const croppedFilename = (file, mime) => {
  const original = String(file?.name || 'image').replace(/\.[^.]+$/, '');
  return `${original}-cropped.${extensionFor(mime)}`;
};

function CropEditor({ request, onCancel, onComplete }) {
  const stageRef = useRef(null);
  const imageRef = useRef(null);
  const dragRef = useRef(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!request?.file) return undefined;
    const url = URL.createObjectURL(request.file);
    setSourceUrl(url);
    setNaturalSize({ width: 0, height: 0 });
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError('');
    return () => URL.revokeObjectURL(url);
  }, [request]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const sync = () => {
      const rect = stage.getBoundingClientRect();
      setStageSize({ width: rect.width, height: rect.height });
    };

    sync();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null;
    observer?.observe(stage);
    window.addEventListener('resize', sync);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, []);

  const metrics = useMemo(() => {
    const { width: imageWidth, height: imageHeight } = naturalSize;
    const { width: frameWidth, height: frameHeight } = stageSize;
    if (!imageWidth || !imageHeight || !frameWidth || !frameHeight) {
      return { scale: 1, displayWidth: 0, displayHeight: 0, maxX: 0, maxY: 0 };
    }

    const baseScale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight);
    const scale = baseScale * zoom;
    const displayWidth = imageWidth * scale;
    const displayHeight = imageHeight * scale;
    return {
      scale,
      displayWidth,
      displayHeight,
      maxX: Math.max(0, (displayWidth - frameWidth) / 2),
      maxY: Math.max(0, (displayHeight - frameHeight) / 2),
    };
  }, [naturalSize, stageSize, zoom]);

  useEffect(() => {
    setOffset((current) => ({
      x: clamp(current.x, -metrics.maxX, metrics.maxX),
      y: clamp(current.y, -metrics.maxY, metrics.maxY),
    }));
  }, [metrics.maxX, metrics.maxY]);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape' && !saving) onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onCancel, saving]);

  const moveTo = useCallback((x, y) => {
    setOffset({
      x: clamp(x, -metrics.maxX, metrics.maxX),
      y: clamp(y, -metrics.maxY, metrics.maxY),
    });
  }, [metrics.maxX, metrics.maxY]);

  const handlePointerDown = (event) => {
    if (!naturalSize.width) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    moveTo(
      drag.originX + event.clientX - drag.startX,
      drag.originY + event.clientY - drag.startY
    );
  };

  const stopDragging = (event) => {
    if (dragRef.current?.id === event.pointerId) dragRef.current = null;
  };

  const resetCrop = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const applyCrop = async () => {
    const image = imageRef.current;
    const stage = stageRef.current;
    if (!image || !stage || !naturalSize.width || saving) return;

    try {
      setSaving(true);
      setError('');

      const frame = stage.getBoundingClientRect();
      const frameWidth = frame.width;
      const frameHeight = frame.height;
      const baseScale = Math.max(frameWidth / naturalSize.width, frameHeight / naturalSize.height);
      const scale = baseScale * zoom;
      const displayWidth = naturalSize.width * scale;
      const displayHeight = naturalSize.height * scale;
      const left = frameWidth / 2 - displayWidth / 2 + offset.x;
      const top = frameHeight / 2 - displayHeight / 2 + offset.y;

      const sx = clamp(-left / scale, 0, naturalSize.width);
      const sy = clamp(-top / scale, 0, naturalSize.height);
      const sw = Math.min(frameWidth / scale, naturalSize.width - sx);
      const sh = Math.min(frameHeight / scale, naturalSize.height - sy);
      const outputSize = request.shape === 'round' ? 800 : 1200;
      const canvas = document.createElement('canvas');
      canvas.width = outputSize;
      canvas.height = outputSize;
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) throw new Error('Your browser could not prepare the crop.');

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, sx, sy, sw, sh, 0, 0, outputSize, outputSize);

      const mime = outputMimeFor(request.file);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (value) => value ? resolve(value) : reject(new Error('Could not create the cropped image.')),
          mime,
          mime === 'image/png' ? undefined : 0.9
        );
      });

      const cropped = new File([blob], croppedFilename(request.file, mime), {
        type: mime,
        lastModified: Date.now(),
      });
      onComplete(cropped);
    } catch (cropError) {
      setError(cropError?.message || 'Could not crop that image.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="echoo-crop-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onCancel();
    }}>
      <section className="echoo-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="echoo-crop-title">
        <header className="echoo-crop-header">
          <div>
            <span>IMAGE EDITOR</span>
            <h2 id="echoo-crop-title">{request.title}</h2>
            <p>Drag the image to position it, then zoom until the important part fits inside the frame.</p>
          </div>
          <button type="button" onClick={onCancel} disabled={saving} aria-label="Cancel image crop"><FaTimes /></button>
        </header>

        <div className="echoo-crop-body">
          <div
            ref={stageRef}
            className={`echoo-crop-stage ${request.shape === 'round' ? 'round' : 'square'}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDragging}
            onPointerCancel={stopDragging}
          >
            {sourceUrl && (
              <img
                ref={imageRef}
                src={sourceUrl}
                alt="Crop preview"
                draggable="false"
                onLoad={(event) => setNaturalSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })}
                style={{
                  width: metrics.displayWidth ? `${metrics.displayWidth}px` : 'auto',
                  height: metrics.displayHeight ? `${metrics.displayHeight}px` : 'auto',
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                }}
              />
            )}
            <div className="echoo-crop-shade" aria-hidden="true" />
            <div className="echoo-crop-frame" aria-hidden="true" />
            <span className="echoo-crop-hint">Drag to reposition</span>
          </div>

          <aside className="echoo-crop-controls">
            <div className="echoo-crop-preview-label">
              <strong>{request.shape === 'round' ? 'Profile preview' : 'Square preview'}</strong>
              <span>The saved file will match this crop.</span>
            </div>

            <label className="echoo-crop-zoom">
              <span>Zoom</span>
              <div>
                <button type="button" onClick={() => setZoom((value) => Math.max(1, Number((value - 0.1).toFixed(2))))} disabled={zoom <= 1}><FaMinus /></button>
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.01"
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  aria-label="Crop zoom"
                />
                <button type="button" onClick={() => setZoom((value) => Math.min(3, Number((value + 0.1).toFixed(2))))} disabled={zoom >= 3}><FaPlus /></button>
              </div>
            </label>

            <button type="button" className="echoo-crop-reset" onClick={resetCrop}><FaUndo /> Reset position</button>
            <p>Tip: keep faces and logos away from the very edge so they still look good in smaller cards.</p>
          </aside>
        </div>

        {error && <div className="echoo-crop-error" role="alert">{error}</div>}

        <footer className="echoo-crop-actions">
          <button type="button" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="button" className="primary" onClick={applyCrop} disabled={!naturalSize.width || saving}>
            <FaCheck /> {saving ? 'Applying crop...' : 'Use this crop'}
          </button>
        </footer>
      </section>
    </div>
  );
}

export default function ImageCropProvider({ children }) {
  const [request, setRequest] = useState(null);

  useEffect(() => {
    const interceptImageInput = (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
      if (input.dataset.noCrop === 'true' || input.multiple) return;

      if (input.dataset.echooCropReady === 'true') {
        delete input.dataset.echooCropReady;
        return;
      }

      const file = input.files?.[0];
      if (!file || !String(file.type || '').startsWith('image/')) return;

      const descriptor = getInputDescriptor(input);
      const maxOriginalSize = inferOriginalLimit(input, descriptor);
      if (file.size > maxOriginalSize) return;

      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      event.stopPropagation?.();

      const shape = inferCropShape(input, descriptor);
      setRequest({
        input,
        file,
        shape,
        title: inferCropTitle(input, descriptor, shape),
      });
      input.value = '';
    };

    document.addEventListener('change', interceptImageInput, true);
    return () => document.removeEventListener('change', interceptImageInput, true);
  }, []);

  const cancel = useCallback(() => {
    setRequest((current) => {
      if (current?.input) current.input.value = '';
      return null;
    });
  }, []);

  const complete = useCallback((croppedFile) => {
    setRequest((current) => {
      const input = current?.input;
      if (!input) return null;

      const transfer = new DataTransfer();
      transfer.items.add(croppedFile);
      input.files = transfer.files;
      input.dataset.echooCropReady = 'true';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return null;
    });
  }, []);

  return (
    <>
      {children}
      {request && typeof document !== 'undefined'
        ? createPortal(<CropEditor request={request} onCancel={cancel} onComplete={complete} />, document.body)
        : null}
    </>
  );
}

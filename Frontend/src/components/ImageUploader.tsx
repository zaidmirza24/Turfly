import { useCallback, useId, useRef, useState } from 'react';
import { ImagePlus, Loader2, Star, Trash2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { apiUpload, apiDelete } from '@/lib/api';
import { resolveImageUrl } from '@/lib/imageUrl';
import logger from '@/lib/logger';

/** Must match ACCEPTED_MIME_TYPES in Backend/src/modules/image/image.validation.js. */
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPTED_LABEL = 'JPEG, PNG or WebP';

/** Must match MAX_IMAGE_BYTES on the server (default 10 MB). */
const MAX_BYTES = 10 * 1024 * 1024;

/** Must match MAX_IMAGES_PER_TURF in image.service.js. */
export const MAX_IMAGES = 24;

interface UploadedImage {
  _id: string;
  url: string;
}

interface Props {
  /** Stored image URLs (`/api/images/<id>`), in display order. */
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  disabled?: boolean;
}

const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

/**
 * Client-side pre-check.
 *
 * Not a security control — the server re-derives the real type from the file's
 * magic bytes and enforces the size limit while parsing. This exists so the
 * user finds out instantly, instead of after uploading two megabytes.
 */
function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return `${file.name} isn't a ${ACCEPTED_LABEL} image`;
  }
  if (file.size > MAX_BYTES) {
    return `${file.name} is ${formatSize(file.size)} — the limit is ${formatSize(MAX_BYTES)}`;
  }
  if (file.size === 0) {
    return `${file.name} is empty`;
  }
  return null;
}

export function ImageUploader({ value, onChange, max = MAX_IMAGES, disabled }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [progress, setProgress] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const remaining = max - value.length;
  const isBusy = uploading > 0;

  const uploadFiles = useCallback(
    async (files: File[]) => {
      setErrors([]);
      if (files.length === 0) return;

      const accepted: File[] = [];
      const rejected: string[] = [];

      for (const file of files) {
        const problem = validateFile(file);
        if (problem) rejected.push(problem);
        else accepted.push(file);
      }

      // Silently dropping extra files would leave the user thinking they
      // uploaded more than they did.
      const withinLimit = accepted.slice(0, remaining);
      if (accepted.length > remaining) {
        rejected.push(
          remaining === 0
            ? `You've reached the limit of ${max} photos`
            : `Only ${remaining} more photo${remaining === 1 ? '' : 's'} can be added`
        );
      }

      if (rejected.length > 0) setErrors(rejected);
      if (withinLimit.length === 0) return;

      setUploading(withinLimit.length);
      setProgress(0);

      // Uploaded in parallel; the shared bar tracks aggregate bytes rather
      // than any single file, so it stays honest regardless of how the
      // browser interleaves the requests.
      const fileBytesSent = new Array(withinLimit.length).fill(0);
      const totalBytes = withinLimit.reduce((sum, file) => sum + file.size, 0) || 1;
      const reportProgress = (index: number, percent: number, file: File) => {
        fileBytesSent[index] = (percent / 100) * file.size;
        const sent = fileBytesSent.reduce((sum, bytes) => sum + bytes, 0);
        setProgress(Math.round((sent / totalBytes) * 100));
      };

      const results = await Promise.allSettled(
        withinLimit.map(async (file, index) => {
          const form = new FormData();
          form.append('image', file);
          const res = await apiUpload<UploadedImage>('/images', form, {
            onProgress: percent => reportProgress(index, percent, file),
          });
          return res.data.url;
        })
      );

      const uploaded: string[] = [];
      const failures: string[] = [];
      results.forEach((result, index) => {
        const file = withinLimit[index];
        if (result.status === 'fulfilled') {
          uploaded.push(result.value);
        } else {
          const message = result.reason instanceof Error ? result.reason.message : 'Upload failed';
          failures.push(`${file.name}: ${message}`);
          logger.error('Image upload failed', result.reason, { size: file.size, type: file.type });
        }
      });

      setUploading(0);
      setProgress(0);

      // Whatever succeeded is kept — a partial failure shouldn't discard the
      // files that did upload.
      if (uploaded.length > 0) onChange([...value, ...uploaded]);
      if (failures.length > 0) setErrors(prev => [...prev, ...failures]);
    },
    [max, onChange, remaining, value]
  );

  const handleSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    void uploadFiles(Array.from(event.target.files ?? []));
    // Reset so picking the same file again still fires a change event.
    event.target.value = '';
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    if (disabled || isBusy) return;
    void uploadFiles(Array.from(event.dataTransfer.files ?? []));
  };

  const handleRemove = async (url: string) => {
    // Remove from the list first so the UI responds immediately; the stored
    // binary is deleted behind it.
    onChange(value.filter(u => u !== url));

    const id = url.split('/').pop();
    if (!id) return;
    try {
      await apiDelete(`/images/${id}`);
    } catch (error) {
      // The photo is already off the turf, which is what the user asked for.
      // A failed delete only leaves an unreferenced binary, which expires on
      // its own via the TTL on Image.expiresAt.
      logger.warn('Could not delete image binary', { imageId: id });
    }
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={e => {
          e.preventDefault();
          if (!disabled && !isBusy) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'rounded-xl border-2 border-dashed p-4 transition-colors',
          isDragging ? 'border-primary bg-primary/5' : 'border-border',
          (disabled || remaining === 0) && 'opacity-60'
        )}
      >
        {value.length > 0 && (
          <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
            {value.map((url, index) => (
              <li key={url} className="relative group aspect-video rounded-lg overflow-hidden border bg-muted">
                <img
                  src={resolveImageUrl(url, 'card')}
                  alt={index === 0 ? 'Cover photo' : `Photo ${index + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {index === 0 && (
                  <span className="absolute top-1 left-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide bg-background/90 text-foreground rounded px-1.5 py-0.5">
                    <Star size={9} className="fill-current" aria-hidden="true" /> Cover
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void handleRemove(url)}
                  disabled={disabled || isBusy}
                  aria-label={`Remove photo ${index + 1}`}
                  className="absolute top-1 right-1 p-1.5 rounded-md bg-background/90 text-destructive opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity disabled:opacity-40"
                >
                  <Trash2 size={12} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          multiple
          className="sr-only"
          onChange={handleSelect}
          disabled={disabled || isBusy || remaining === 0}
        />

        <div className="flex flex-col items-center text-center gap-2 py-2">
          {isBusy ? (
            <>
              <Loader2 className="animate-spin text-primary" size={20} aria-hidden="true" />
              <p className="text-xs font-medium" role="status" aria-live="polite">
                Uploading {uploading} photo{uploading === 1 ? '' : 's'}… {progress}%
              </p>
              <div
                className="w-full max-w-[200px] h-1 bg-muted rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
            </>
          ) : (
            <>
              <ImagePlus className="text-muted-foreground" size={20} aria-hidden="true" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || remaining === 0}
                onClick={() => inputRef.current?.click()}
              >
                {value.length === 0 ? 'Add photos' : 'Add more'}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                {remaining === 0
                  ? `Maximum ${max} photos`
                  : `${ACCEPTED_LABEL}, up to ${formatSize(MAX_BYTES)} each · ${remaining} remaining`}
              </p>
            </>
          )}
        </div>
      </div>

      {errors.length > 0 && (
        <ul className="space-y-1" role="alert">
          {errors.map(error => (
            <li key={error} className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertCircle size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ImageUploader;

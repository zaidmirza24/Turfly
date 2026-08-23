import { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X, LayoutGrid, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TURF_PLACEHOLDER_IMAGE } from '@/lib/imageUrl';

interface TurfGalleryProps {
  turfName: string;
  images: string[];
  thumbnails: string[];
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  showFavorite?: boolean;
}

// Falls back per-image (a stored URL can 404 independently of the turf
// having photos at all) rather than showing the browser's broken-image icon.
function GalleryImg({ src, alt, className, loading }: { src: string; alt: string; className?: string; loading?: 'lazy' | 'eager' }) {
  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      className={className}
      onError={(e) => {
        if (e.currentTarget.src !== TURF_PLACEHOLDER_IMAGE) e.currentTarget.src = TURF_PLACEHOLDER_IMAGE;
      }}
    />
  );
}

export function TurfGallery({ turfName, images, thumbnails, isFavorite, onToggleFavorite, showFavorite }: TurfGalleryProps) {
  const [selectedImage, setSelectedImage] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const touchStartX = useRef<number | null>(null);

  const openLightbox = (i: number) => {
    setLightboxIndex(i);
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10"
      >
        <div
          className="md:col-span-2 aspect-[16/9] rounded-3xl overflow-hidden shadow-2xl bg-muted relative touch-pan-y cursor-pointer group"
          onClick={() => openLightbox(selectedImage)}
          onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (touchStartX.current == null || images.length < 2) return;
            const delta = e.changedTouches[0].clientX - touchStartX.current;
            if (Math.abs(delta) > 40) {
              setSelectedImage(prev => {
                const next = delta < 0 ? prev + 1 : prev - 1;
                return (next + images.length) % images.length;
              });
            }
            touchStartX.current = null;
          }}
        >
          <GalleryImg
            src={images[selectedImage] ?? images[0]}
            alt={`${turfName} — photo ${selectedImage + 1} of ${images.length}`}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          {showFavorite && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(); }}
              aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              aria-pressed={isFavorite}
              className="absolute top-4 right-4 w-11 h-11 rounded-full glass flex items-center justify-center hover:scale-110 transition-transform"
            >
              <Heart size={20} className={cn(isFavorite ? 'fill-destructive text-destructive' : 'text-foreground')} />
            </button>
          )}
          {images.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 md:hidden">
              {images.map((_, i) => (
                <span key={i} className={cn('w-1.5 h-1.5 rounded-full', i === selectedImage ? 'bg-white' : 'bg-white/40')} />
              ))}
            </div>
          )}
          {images.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setGalleryOpen(true); }}
              className="hidden md:flex absolute bottom-4 right-4 items-center gap-2 px-4 py-2 rounded-full bg-white/90 dark:bg-black/70 backdrop-blur-sm text-xs font-black shadow-lg hover:scale-105 transition-transform"
            >
              <LayoutGrid size={14} /> View all {images.length} photos
            </button>
          )}
        </div>

        {images.length > 1 && (
          <div className="grid grid-cols-4 md:grid-cols-1 gap-3">
            {thumbnails.slice(0, 4).map((thumb, i) => {
              const isLastVisible = i === 3 && thumbnails.length > 4;
              return (
                <button
                  key={`${thumb}-${i}`}
                  type="button"
                  onClick={() => (isLastVisible ? setGalleryOpen(true) : setSelectedImage(i))}
                  aria-label={isLastVisible ? `View all ${images.length} photos` : `Show photo ${i + 1}`}
                  aria-current={!isLastVisible && i === selectedImage}
                  className={cn('relative rounded-2xl overflow-hidden border-4 transition-all aspect-video shadow-md bg-muted',
                    !isLastVisible && i === selectedImage ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100 hover:scale-105')}>
                  <GalleryImg src={thumb} alt="" loading="lazy" className="w-full h-full object-cover" />
                  {isLastVisible && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white gap-0.5">
                      <span className="text-lg font-black leading-none">+{thumbnails.length - 3}</span>
                      <span className="text-[9px] font-bold uppercase tracking-wider">more</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </motion.div>

      <GalleryGridModal
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        turfName={turfName}
        images={images}
        onSelect={(i) => { setGalleryOpen(false); openLightbox(i); }}
      />

      <Lightbox
        images={images}
        turfName={turfName}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </>
  );
}

function GalleryGridModal({ open, onOpenChange, turfName, images, onSelect }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  turfName: string;
  images: string[];
  onSelect: (i: number) => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-[60] overflow-y-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">{turfName} — all photos</DialogPrimitive.Title>
          <div className="sticky top-0 z-10 flex items-center justify-between px-4 sm:px-8 py-4 bg-background/80 backdrop-blur-md border-b">
            <h2 className="font-black text-lg truncate pr-4">{turfName} · {images.length} photos</h2>
            <DialogPrimitive.Close className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
              <X size={20} />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>
          <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {images.map((img, i) => (
              <button
                key={`${img}-${i}`}
                type="button"
                onClick={() => onSelect(i)}
                className="rounded-2xl overflow-hidden aspect-[4/3] bg-muted shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all"
              >
                <GalleryImg src={img} alt={`${turfName} — photo ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Lightbox({ images, turfName, index, onClose, onIndexChange }: {
  images: string[];
  turfName: string;
  index: number | null;
  onClose: () => void;
  onIndexChange: (i: number) => void;
}) {
  const open = index !== null;

  const go = (delta: number) => {
    if (index === null) return;
    onIndexChange((index + delta + images.length) % images.length);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/95 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-[70] flex flex-col outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">{turfName} — photo {index !== null ? index + 1 : ''}</DialogPrimitive.Title>
          <div className="flex items-center justify-between px-4 sm:px-8 py-4 text-white">
            <span className="text-sm font-bold tabular-nums opacity-80">
              {index !== null ? `${index + 1} / ${images.length}` : ''}
            </span>
            <DialogPrimitive.Close className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors">
              <X size={22} />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          <div className="relative flex-1 flex items-center justify-center px-2 sm:px-16 pb-6 min-h-0">
            {images.length > 1 && (
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Previous photo"
                className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white items-center justify-center transition-colors"
              >
                <ChevronLeft size={26} />
              </button>
            )}

            <AnimatePresence mode="wait">
              {index !== null && (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="max-w-full max-h-full flex items-center justify-center"
                >
                  <GalleryImg
                    src={images[index]}
                    alt={`${turfName} — photo ${index + 1} of ${images.length}`}
                    className="max-w-full max-h-[75vh] object-contain rounded-xl"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {images.length > 1 && (
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Next photo"
                className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white items-center justify-center transition-colors"
              >
                <ChevronRight size={26} />
              </button>
            )}
          </div>

          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto px-4 sm:px-8 pb-6 custom-scrollbar">
              {images.map((img, i) => (
                <button
                  key={`${img}-${i}`}
                  type="button"
                  onClick={() => onIndexChange(i)}
                  className={cn(
                    'shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all',
                    i === index ? 'border-white opacity-100' : 'border-transparent opacity-50 hover:opacity-80',
                  )}
                >
                  <GalleryImg src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

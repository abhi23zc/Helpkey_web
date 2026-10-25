"use client";
import { useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { PublicMediaImage } from "@/components/shared/public-media-image";
import { useDialog } from "@/components/shared/use-dialog";

export type GalleryImage = { id: string; imageUrl: string; imageSrcSet: string; altText: string };
export function HotelGalleryDialog({ images, activeIndex, propertyName, onIndexChange, onClose }: {
  images: GalleryImage[];
  activeIndex: number;
  propertyName: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const dialogRef = useDialog(true, onClose);
  const activeImage = images[activeIndex];
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onIndexChange((activeIndex - 1 + images.length) % images.length);
      if (event.key === "ArrowRight") onIndexChange((activeIndex + 1) % images.length);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, images.length, onIndexChange, onClose]);
  useEffect(() => {
    const adjacent = new Set([(activeIndex + 1) % images.length, (activeIndex - 1 + images.length) % images.length]);
    adjacent.delete(activeIndex);
    const preloaders = [...adjacent].map(index => {
      const preload = new window.Image();
      preload.sizes = "100vw";
      preload.srcset = images[index].imageSrcSet ?? "";
      preload.src = images[index].imageUrl;
      return preload;
    });
    return () => { preloaders.forEach(preload => { preload.srcset = ""; preload.removeAttribute("src"); }); };
  }, [activeIndex, images]);
  return (
        <div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={`${propertyName} photo gallery`}
          className="fixed inset-0 z-[60] flex flex-col bg-[rgba(4,15,31,0.94)] p-4 text-white sm:p-6"
        >
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
            <p className="text-sm font-semibold">
              {activeIndex + 1} of {images.length}
            </p>
            <button
              type="button"
              onClick={() => onClose()}
              aria-label="Close photo gallery"
              className="rounded-full p-2 transition hover:bg-white/15"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="relative mx-auto flex min-h-0 w-full max-w-6xl flex-1 items-center justify-center py-4">
            <PublicMediaImage
              src={activeImage.imageUrl}
              srcSet={activeImage.imageSrcSet}
              alt={activeImage.altText || propertyName}
              sizes="100vw"
              loading="eager"
              className="max-h-full max-w-full rounded-xl object-contain"
            />
            <button
              type="button"
              onClick={() =>
                onIndexChange(
                  (activeIndex - 1 + images.length) % images.length,
                )
              }
              aria-label="Previous photo"
              className="absolute left-0 rounded-full bg-black/45 p-3 transition hover:bg-black/70"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => onIndexChange((activeIndex + 1) % images.length)}
              aria-label="Next photo"
              className="absolute right-0 rounded-full bg-black/45 p-3 transition hover:bg-black/70"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>

          <div className="mx-auto flex w-full max-w-6xl gap-2 overflow-x-auto py-2">
            {images.map((image, index) => (
              <button
                key={image.id}
                type="button"
                onClick={() => onIndexChange(index)}
                aria-label={`Show photo ${index + 1}`}
                className={`h-16 w-20 shrink-0 overflow-hidden rounded-md border-2 ${
                  index === activeIndex
                    ? "border-white"
                    : "border-transparent opacity-65 hover:opacity-100"
                }`}
              >
                <PublicMediaImage
                  src={image.imageUrl}
                  srcSet={image.imageSrcSet}
                  alt=""
                  sizes="80px"
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
  );
}

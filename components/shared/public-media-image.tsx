"use client";
/* eslint-disable @next/next/no-img-element -- CDN variants are already optimized; native srcSet is intentional. */

import type { ImgHTMLAttributes, SyntheticEvent } from "react";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet" | "alt"> & {
  src: string;
  srcSet?: string | null;
  alt: string;
  fallbackSrc?: string;
};

export function PublicMediaImage({ src, srcSet, alt, fallbackSrc = "/balmoral_hotel.png", loading = "lazy", onError, ...props }: Props) {
  const fallback = (event: SyntheticEvent<HTMLImageElement>) => {
    onError?.(event);
    const image = event.currentTarget;
    if (image.dataset.fallbackApplied === "true") return;
    image.dataset.fallbackApplied = "true";
    image.srcset = "";
    image.src = fallbackSrc;
  };
  return <img {...props} src={src} srcSet={srcSet || undefined} alt={alt} loading={loading} onError={fallback} />;
}

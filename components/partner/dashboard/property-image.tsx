"use client";
import { useState } from "react";
import { Building2 } from "lucide-react";
export function PropertyImage({
  src,
  name,
  className = "h-full w-full object-cover",
}: {
  src?: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return src && failed !== src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      className={className}
      onError={() => setFailed(src)}
    />
  ) : (
    <span
      aria-label={name}
      className="grid h-full w-full place-items-center bg-slate-100 text-slate-400"
    >
      <Building2 className="h-6 w-6" />
    </span>
  );
}


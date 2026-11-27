import { useState, type ReactNode } from "react";

/**
 * Round profile picture with an initials fallback. Shows the provider photo when
 * `url` is set and falls back to `initials` if it is missing or fails to load.
 * `className` styles the circle (size, colors, border) in both states.
 */
export function ProfileAvatar({
  url,
  initials,
  className,
  children,
}: {
  url?: string | null;
  initials: string;
  className: string;
  /** Extra overlay content (e.g. a status dot), rendered in both states. */
  children?: ReactNode;
}) {
  // Remember which URL failed so a new URL gets a fresh try without an effect.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(url) && failedUrl !== url;

  return (
    <div className={className}>
      {showImage ? (
        <img
          src={url ?? undefined}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedUrl(url ?? null)}
          className="w-full h-full rounded-full object-cover"
        />
      ) : (
        initials
      )}
      {children}
    </div>
  );
}

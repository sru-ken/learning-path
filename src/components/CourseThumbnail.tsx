import { useState } from 'react';
import { Network } from 'lucide-react';
import { cn } from '../lib/utils.ts';

interface CourseThumbnailProps {
  src: string | null;
  alt: string;
  className?: string;
}

export function CourseThumbnail({ src, alt, className }: CourseThumbnailProps) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center bg-gradient-to-br from-[#EFF4FF] via-[#E0E7FF] to-[#EDE9FE] text-[#1E3A8A]',
          className,
        )}
      >
        <Network className="h-8 w-8 text-[#2563EB] mb-2" />
        <span className="px-4 text-center text-xs font-medium text-[#1E293B] line-clamp-2">
          {alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setErrored(true)}
      className={cn('object-cover w-full h-full', className)}
    />
  );
}

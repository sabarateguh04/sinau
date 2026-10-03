import { cx } from '@/components/ui';

export function SinauLogoIcon({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const containerSizes = {
    sm: 'h-9 w-9 rounded-xl',
    md: 'h-10 w-10 sm:h-11 sm:w-11 rounded-xl',
    lg: 'h-11 w-11 sm:h-12 sm:w-12 rounded-2xl',
  };

  const svgSizes = {
    sm: 'h-5 w-5',
    md: 'h-6 w-6 sm:h-6.5 sm:w-6.5',
    lg: 'h-7 w-7',
  };

  return (
    <div
      className={cx(
        'flex shrink-0 items-center justify-center bg-emerald-600 dark:bg-emerald-500 border border-amber-400/90 shadow-sm transition-transform duration-200 group-hover:scale-105',
        containerSizes[size],
        className
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cx('text-white', svgSizes[size])}
        aria-hidden="true"
      >
        {/* Topi Wisuda Modern */}
        <path
          d="M12 2.5L21.5 7L12 11.5L2.5 7L12 2.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Tali Tassel Emas */}
        <path
          d="M20 8.2V13.2"
          stroke="#fde047"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="20" cy="14" r="0.9" fill="#fde047" />

        {/* Sirkuit AI Berbentuk Huruf 'S' */}
        <path
          d="M15.5 11.5C15 10.5 13.7 9.8 12 9.8C9.8 9.8 8.5 11 8.5 12.6C8.5 14.8 15.5 14.2 15.5 17.2C15.5 19.2 13.8 20.8 11.5 20.8C9.2 20.8 7.8 19.8 7.2 18.2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Titik Koneksi Sirkuit */}
        <circle cx="12" cy="7" r="1.3" fill="#fde047" />
        <circle cx="8.5" cy="12.6" r="1.2" fill="white" />
        <circle cx="15.5" cy="17.2" r="1.2" fill="white" />
        <circle cx="11.5" cy="20.8" r="1.2" fill="#fde047" />
      </svg>
    </div>
  );
}

export function SinauLogo({
  size = 'md',
  showText = true,
  tagline,
  onDarkBg = false,
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  tagline?: string;
  onDarkBg?: boolean;
  className?: string;
}) {
  const textSizes = {
    sm: 'text-xl sm:text-2xl',
    md: 'text-2xl',
    lg: 'text-2xl sm:text-3xl',
  };

  const textGradient = onDarkBg
    ? 'bg-gradient-to-r from-emerald-300 via-teal-200 to-amber-300 bg-clip-text text-transparent'
    : 'bg-gradient-to-r from-emerald-700 via-teal-600 to-amber-500 dark:from-emerald-400 dark:via-teal-300 dark:to-amber-400 bg-clip-text text-transparent';

  return (
    <div className={cx('flex items-center gap-3', className)}>
      <SinauLogoIcon size={size} />
      {showText && (
        <div className="flex flex-col">
          <span
            className={cx(
              'font-black tracking-tight select-none leading-none',
              textSizes[size],
              textGradient
            )}
          >
            SINAU
          </span>
          {tagline && <span className="text-xs text-white/70 mt-1">{tagline}</span>}
        </div>
      )}
    </div>
  );
}

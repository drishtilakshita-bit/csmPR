"use client";

/**
 * LimeChat logo: C-shaped leaf (open bottom-right) with inner oval cut-out.
 * Gradient: lime green (#B2E057) to chartreuse (#87C342).
 */
export function LimeChatLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient
          id="limechat-logo-gradient"
          x1="0%"
          y1="20%"
          x2="100%"
          y2="80%"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#B2E057" />
          <stop offset="100%" stopColor="#87C342" />
        </linearGradient>
      </defs>
      {/* C-shape: 3/4 circle open at bottom-right; inner oval = hole */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M20 6
           A 14 14 0 0 1 6 20
           A 14 14 0 0 1 20 34
           A 14 14 0 0 1 34 20
           L 20 20 Z
           M 20 14
           A 6 6 0 1 1 20 26
           A 6 6 0 1 1 20 14 Z"
        fill="url(#limechat-logo-gradient)"
      />
    </svg>
  );
}

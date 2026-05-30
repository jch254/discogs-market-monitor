/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // Dark hi-fi palette: neutral near-black with a vinyl-teal accent.
        brand: {
          bg: '#0a0e0f',
          card: '#12181a',
          'card-hover': '#192123',
          // Vinyl / retro-audio teal.
          accent: '#2dd4bf',
          'accent-hover': '#5eead4',
          text: '#e9eef0',
          muted: '#8b9a9d',
          border: '#222b2d',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};

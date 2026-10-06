/**
 * Configuracion de Tailwind CSS v3.
 *
 * Los colores "semanticos" (canvas, surface, ink...) no son valores fijos:
 * apuntan a variables CSS declaradas en `src/app/globals.css`, que cambian
 * segun la clase `.dark` de <html>. Gracias al marcador `<alpha-value>`
 * Tailwind puede componerlos con opacidad (`bg-surface/70`).
 *
 * La paleta por defecto de Tailwind (slate, indigo...) sigue disponible: solo
 * se añaden estos alias para no repetir tokens crudos por toda la interfaz.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  // El tema se alterna con una clase en <html> (no con prefers-color-scheme)
  // para que el usuario pueda elegirlo y persista en localStorage.
  darkMode: 'class',

  content: ['./src/**/*.{js,ts,jsx,tsx}'],

  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        raised: 'rgb(var(--c-raised) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        'line-strong': 'rgb(var(--c-line-strong) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--c-accent) / <alpha-value>)',
          strong: 'rgb(var(--c-accent-strong) / <alpha-value>)',
          soft: 'rgb(var(--c-accent-soft) / <alpha-value>)',
        },
        ok: 'rgb(var(--c-ok) / <alpha-value>)',
        warn: 'rgb(var(--c-warn) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
      },

      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        lift: '0 18px 40px -24px rgb(15 23 42 / 0.45)',
      },

      // El barrido del skeleton: se declara aqui para poder usarlo con
      // `animate-shimmer` desde `@apply` sin escribir CSS a mano.
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },

      animation: {
        shimmer: 'shimmer 1.6s ease-in-out infinite',
      },
    },
  },

  plugins: [],
};

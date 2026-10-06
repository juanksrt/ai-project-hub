/**
 * PostCSS con Tailwind CSS.
 *
 * Next.js no genera por si solo la configuracion PostCSS de Tailwind: sin este
 * fichero el plugin no se ejecuta, las clases de Tailwind no se compilan a CSS
 * y la aplicacion se pinta con los estilos por defecto del navegador (que era
 * exactamente lo que pasaba en este proyecto).
 *
 * @see https://tailwindcss.com/docs/installation/using-postcss
 */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;

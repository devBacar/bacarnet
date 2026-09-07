/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      zIndex: {
        dropdown: '50',
        'dropdown-menu': '60',
        drawer: '50',
        modal: '50',
        'modal-nested': '60',
        navbar: '40',
        fullscreen: '100',
      },
    },
  },
}

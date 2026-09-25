/** true cuando el bundle se construyó con VITE_APP_ENV=staging (emuladores / ngrok). */
export const IS_STAGING_APP_ENV = import.meta.env.VITE_APP_ENV === 'staging'

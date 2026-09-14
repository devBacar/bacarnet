import { Toaster } from 'react-hot-toast'
import { QueryClientProvider } from '@tanstack/react-query'
import { AppProvider, AuthProvider, ThemeProvider } from './context'
import { GlobalSettingsProvider } from './context/GlobalSettingsContext'
import { NotificationsProvider } from './context/NotificationsContext'
import { AppRoutes } from './routes'
import { queryClient } from './lib/queryClient'

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppProvider>
          <AuthProvider>
            <GlobalSettingsProvider>
              <NotificationsProvider>
                <AppRoutes />
              </NotificationsProvider>
              <Toaster
                position="top-right"
                toastOptions={{
                  className:
                    '!rounded-lg !border !border-neutral-200 !text-neutral-900 dark:!border-zinc-700 dark:!bg-zinc-900 dark:!text-gray-100',
                  success: {
                    iconTheme: { primary: '#1E3A5F', secondary: '#ffffff' },
                  },
                  error: {
                    iconTheme: { primary: '#b42318', secondary: '#ffffff' },
                  },
                }}
              />
            </GlobalSettingsProvider>
          </AuthProvider>
        </AppProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export default App

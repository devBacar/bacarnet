declare module 'interbanking-client' {
  export function createClient(options: {
    clientId: string
    clientSecret: string
    redirectUrl: string
    customerId: string
    tokenUrl?: string
    apiBaseUrl?: string
    logger?: null | ((message: string) => void)
  }): {
    getBalances: (queryParams?: Record<string, string>) => Promise<{ accounts: unknown[] }>
  }
}

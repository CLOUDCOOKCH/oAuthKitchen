import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

// ---------------------------------------------------------------------------
// Global error boundary — catches unhandled render errors
// ---------------------------------------------------------------------------

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      const err = this.state.error as Error
      return (
        <div className="min-h-screen gradient-mesh flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-xl border border-red-500/30 bg-red-500/10 p-6 space-y-4 text-center">
            <p className="text-base font-semibold text-red-500">Something went wrong</p>
            <p className="text-xs text-muted-foreground font-mono break-all">{err.message}</p>
            <button
              onClick={() => this.setState({ error: null })}
              className="text-xs underline text-muted-foreground hover:text-foreground transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ---------------------------------------------------------------------------

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)

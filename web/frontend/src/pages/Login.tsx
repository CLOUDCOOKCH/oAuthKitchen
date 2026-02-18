import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Shield, Loader2 } from 'lucide-react'
import { useMsal, useIsAuthenticated } from '@azure/msal-react'
import { InteractionStatus } from '@azure/msal-browser'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GRAPH_SCOPES_LIMITED, GRAPH_SCOPES_FULL } from '@/lib/msalConfig'
import { useSettingsStore } from '@/lib/store'

export default function Login() {
  const { instance, inProgress } = useMsal()
  const isAuthenticated = useIsAuthenticated()
  const navigate = useNavigate()
  const { settings } = useSettingsStore()

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true })
  }, [isAuthenticated, navigate])

  const isLoading =
    inProgress === InteractionStatus.Login ||
    inProgress === InteractionStatus.AcquireToken ||
    inProgress === InteractionStatus.HandleRedirect

  const handleSignIn = async () => {
    const scopes = settings.useLimitedScopes ? GRAPH_SCOPES_LIMITED : GRAPH_SCOPES_FULL
    try {
      await instance.loginPopup({ scopes })
    } catch (err) {
      console.error('Login failed:', err)
    }
  }

  return (
    <div className="min-h-screen gradient-mesh flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="glass border-border/50">
          <CardHeader className="text-center pb-2">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', duration: 0.5 }}
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 gradient-border"
            >
              <Shield className="h-8 w-8 text-primary" />
            </motion.div>
            <CardTitle className="text-2xl">OAuthKitchen</CardTitle>
            <CardDescription>
              Sign in with your Microsoft work account to analyse OAuth app security
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <Button
              className="w-full"
              size="lg"
              disabled={isLoading}
              onClick={handleSignIn}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <svg className="h-4 w-4 mr-2" viewBox="0 0 21 21" fill="none">
                  <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                </svg>
              )}
              {isLoading ? 'Signing in…' : 'Sign in with Microsoft'}
            </Button>

            <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Required Graph permissions</p>
              <p>
                {settings.useLimitedScopes
                  ? 'Application.Read.All · Directory.Read.All'
                  : 'Application.Read.All · Directory.Read.All · AuditLog.Read.All'}
              </p>
              <p>This app is read-only — it never modifies your tenant configuration.</p>
            </div>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          OAuth Security Analysis for Microsoft Entra ID ·{' '}
          <button
            className="underline hover:text-foreground transition-colors"
            onClick={() => navigate('/settings')}
          >
            Settings
          </button>
        </p>
      </motion.div>
    </div>
  )
}

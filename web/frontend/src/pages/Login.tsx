import { useEffect, useState } from 'react'
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
  const [loginError, setLoginError] = useState<string | null>(null)

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true })
  }, [isAuthenticated, navigate])

  const isLoading =
    inProgress === InteractionStatus.Login ||
    inProgress === InteractionStatus.AcquireToken ||
    inProgress === InteractionStatus.HandleRedirect

  const handleSignIn = async () => {
    setLoginError(null)
    const scopes = settings.useLimitedScopes ? GRAPH_SCOPES_LIMITED : GRAPH_SCOPES_FULL
    try {
      await instance.loginPopup({ scopes })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('user_cancelled') && !msg.includes('BrowserAuthError: interaction_in_progress')) {
        setLoginError(msg)
      }
    }
  }

  return (
    <div className="min-h-screen gradient-mesh flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/4 w-[30rem] h-[30rem] bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/5 right-1/4 w-80 h-80 bg-orange-600/10 rounded-full blur-3xl" />
        <div className="absolute top-3/4 left-1/6 w-56 h-56 bg-red-700/[0.07] rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="glass border-border/50 amber-glow">
          <CardHeader className="text-center pb-2">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', duration: 0.5 }}
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-primary/10 gradient-border amber-glow"
            >
              <Shield className="h-8 w-8 text-primary" />
            </motion.div>
            <CardTitle className="text-2xl font-mono tracking-tight">OAuthKitchen</CardTitle>
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

            {loginError && (
              <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 font-mono">
                {loginError}
              </div>
            )}

            <div className="rounded border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground space-y-1 font-mono">
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

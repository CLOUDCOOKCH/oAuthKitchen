import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Shield, Save, RotateCcw, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSettingsStore } from '@/lib/store'
import type { AppSettings } from '@/lib/store/settingsStore'

export default function Settings() {
  const navigate = useNavigate()
  const { settings, updateSettings, isConfigured } = useSettingsStore()
  const [form, setForm] = useState<AppSettings>({ ...settings })
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    const completingFirstSetup = !isConfigured && Boolean(form.clientId && form.tenantId)
    updateSettings(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    // First-time setup: navigate to /login once the store update triggers MSAL init
    if (completingFirstSetup) {
      setTimeout(() => navigate('/login'), 150)
    }
  }

  const handleReset = () => {
    setForm({ ...settings })
  }

  const field = (key: keyof AppSettings, label: string, description: string, type: string = 'text', placeholder = '') => (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      <p className="text-xs text-muted-foreground">{description}</p>
      <Input
        type={type}
        value={String(form[key])}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value
          setForm((prev) => ({
            ...prev,
            [key]: type === 'number' ? (parseInt(raw, 10) || 0) : raw,
          }))
        }}
      />
    </div>
  )

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure your Microsoft Entra ID connection</p>
      </div>

      {!isConfigured && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4"
        >
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Configuration required</p>
              <p className="text-xs text-muted-foreground mt-1">
                Enter your App Registration Client ID and Tenant ID below to connect to your
                Microsoft Entra ID tenant.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Authentication */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Authentication</CardTitle>
          <CardDescription>
            Register an app in your Azure portal, grant it the required Graph API permissions,
            and enter the IDs here.{' '}
            <a
              href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline hover:text-foreground"
            >
              Open Azure portal <ExternalLink className="h-3 w-3" />
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {field(
            'clientId',
            'Client ID (Application ID)',
            'The Application (client) ID from your App Registration.',
            'text',
            'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
          )}
          {field(
            'tenantId',
            'Tenant ID (Directory ID)',
            'Your Azure AD Directory (tenant) ID, or "organizations" for any work account.',
            'text',
            'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Scope mode</label>
            <p className="text-xs text-muted-foreground">
              Limited mode skips sign-in activity (no AuditLog.Read.All required).
            </p>
            <div className="flex gap-3">
              {[
                { value: false, label: 'Full (recommended)', desc: 'Includes sign-in activity' },
                { value: true, label: 'Limited', desc: 'No audit logs required' },
              ].map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => setForm((prev) => ({ ...prev, useLimitedScopes: opt.value }))}
                  className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
                    form.useLimitedScopes === opt.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-accent/50'
                  }`}
                >
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Analysis Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Analysis Thresholds</CardTitle>
          <CardDescription>Tune when apps are flagged as inactive or credentials as critical.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {field(
            'inactiveDaysThreshold',
            'Inactive app threshold (days)',
            'Apps with no sign-in activity beyond this many days are flagged as inactive.',
            'number'
          )}
          {field(
            'credentialExpiryCriticalDays',
            'Critical credential expiry (days)',
            'Credentials expiring within this many days are marked critical.',
            'number'
          )}
        </CardContent>
      </Card>

      {/* App Registration Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">App Registration Setup</CardTitle>
          <CardDescription>Required Microsoft Graph API permissions for your app registration.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-medium mb-1">Required permissions (Application type)</p>
            <ul className="space-y-1 text-muted-foreground">
              {[
                'Application.Read.All — Read all app registrations',
                'Directory.Read.All — Read all directory data',
                form.useLimitedScopes ? null : 'AuditLog.Read.All — Read sign-in activity (Full mode)',
              ].filter(Boolean).map((perm) => (
                <li key={perm} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                  <code className="text-xs">{perm}</code>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium mb-1">Platform configuration</p>
            <ul className="space-y-1 text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                Platform type: <strong>Single-page application (SPA)</strong>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                Redirect URI: <code className="text-xs">{window.location.origin + import.meta.env.BASE_URL}</code>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button onClick={handleSave} className="flex-1">
          <Save className="h-4 w-4 mr-2" />
          {saved ? 'Saved!' : 'Save Settings'}
        </Button>
        <Button variant="outline" onClick={handleReset}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset
        </Button>
      </div>
    </div>
  )
}

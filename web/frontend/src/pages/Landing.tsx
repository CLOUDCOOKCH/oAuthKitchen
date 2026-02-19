import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ShieldAlert,
  Eye,
  BookOpen,
  Lock,
  Server,
  Zap,
  Settings,
  ArrowRight,
  ChevronRight,
  Shield,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ── Data ──────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: ShieldAlert,
    tag: 'RISK · SCORING',
    title: 'Consent Analyzer',
    body: 'Risk-score every OAuth app in your Entra ID tenant. Spot critical, high, and medium exposures across all service principals at a glance.',
    accentText: 'text-red-400',
    accentBorder: 'hover:border-red-500/25',
    accentGlow: 'hover:shadow-[0_0_32px_hsl(0_72%_51%/0.10)]',
    accentBg: 'bg-red-500/10',
  },
  {
    icon: Eye,
    tag: 'PATTERN · DETECTION',
    title: 'Shadow OAuth Detector',
    body: 'Detect 6 dangerous exposure patterns: orphaned privileged apps, unverified publishers, offline-access abuse, and user-consented high-impact scopes.',
    accentText: 'text-amber-400',
    accentBorder: 'hover:border-amber-500/25',
    accentGlow: 'hover:shadow-[0_0_32px_hsl(38_92%_50%/0.10)]',
    accentBg: 'bg-amber-500/10',
  },
  {
    icon: BookOpen,
    tag: 'SCOPE · ANALYSIS',
    title: 'Permission Translator',
    body: 'Turn raw Graph API scopes into plain English. Every permission ships with an impact score and realistic abuse scenarios — no docs needed.',
    accentText: 'text-orange-400',
    accentBorder: 'hover:border-orange-500/25',
    accentGlow: 'hover:shadow-[0_0_32px_hsl(25_95%_53%/0.10)]',
    accentBg: 'bg-orange-500/10',
  },
]

const STEPS = [
  {
    n: '01',
    title: 'Configure',
    icon: Settings,
    body: 'Paste your Azure App Registration Client ID and Tenant ID. Everything stays in localStorage — nothing is ever sent to us.',
  },
  {
    n: '02',
    title: 'Connect',
    icon: Lock,
    body: 'Sign in via Microsoft popup. We request read-only Graph API access on your behalf. Admin consent is required exactly once.',
  },
  {
    n: '03',
    title: 'Analyze',
    icon: Zap,
    body: 'Get a full risk report in minutes. Browse risky apps, review shadow patterns, decode permissions — all in your browser.',
  },
]

const TRUST = [
  { icon: Eye,    label: 'Read-only',    sub: 'Never modifies your tenant'  },
  { icon: Server, label: 'No backend',   sub: 'Pure SPA — no server at all' },
  { icon: Lock,   label: 'Client-side',  sub: 'Data stays in your browser'  },
  { icon: Zap,    label: 'MSAL auth',    sub: 'Microsoft-grade token flow'  },
]

type TLine = {
  text: string
  type: 'cmd' | 'blank' | 'info' | 'critical' | 'high' | 'medium' | 'low' | 'warn' | 'success'
}

const TERMINAL: TLine[] = [
  { text: '$ oauthkitchen scan --tenant contoso.onmicrosoft.com', type: 'cmd' },
  { text: '', type: 'blank' },
  { text: '  ■ Collecting service principals ...  847 found', type: 'info' },
  { text: '  ■ Loading permission rules     ...   42 scopes', type: 'info' },
  { text: '  ■ Risk-scoring applications    ...  done', type: 'info' },
  { text: '', type: 'blank' },
  { text: '  CRITICAL    12   ████░░░░░░░░░░░░  ( 1.4%)', type: 'critical' },
  { text: '  HIGH        31   ████████░░░░░░░░  ( 3.7%)', type: 'high' },
  { text: '  MEDIUM      64   ████████████░░░░  ( 7.6%)', type: 'medium' },
  { text: '  LOW        740   ████████████████  (87.3%)', type: 'low' },
  { text: '', type: 'blank' },
  { text: '  shadow findings       8 patterns detected', type: 'warn' },
  { text: '  expiring credentials  3 within 30 days', type: 'warn' },
  { text: '', type: 'blank' },
  { text: '  ✓ scan complete · 847 apps · 12.3s', type: 'success' },
]

const LINE_COLOR: Record<TLine['type'], string> = {
  cmd:      'text-amber-400',
  blank:    '',
  info:     'text-stone-400',
  critical: 'text-red-400',
  high:     'text-orange-400',
  medium:   'text-yellow-400',
  low:      'text-emerald-400',
  warn:     'text-yellow-500/80',
  success:  'text-emerald-400 font-semibold',
}

// ── Animation helpers ─────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
}

const itemFadeUp = (delay: number) => ({
  hidden: { opacity: 0, y: 22 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1], delay } },
})

// ── Component ─────────────────────────────────────────────────────

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen gradient-mesh overflow-x-hidden">

      {/* Blueprint grid overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          backgroundImage: `
            linear-gradient(hsl(38 92% 50% / 0.028) 1px, transparent 1px),
            linear-gradient(90deg, hsl(38 92% 50% / 0.028) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      {/* ── Nav ─────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 glass border-b border-border/50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10 border border-primary/30">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <span className="font-mono font-semibold text-sm tracking-tight">
              OAuthKitchen
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-primary/35 text-primary hover:bg-primary hover:text-primary-foreground transition-all"
            onClick={() => navigate('/settings')}
          >
            Get started
            <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative z-10 min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center px-6 pt-16 pb-24">

        {/* Spotlight blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[55%] w-[64rem] h-[64rem] bg-amber-500/[0.055] rounded-full blur-3xl" />
          <div className="absolute top-1/4 right-1/5 w-72 h-72 bg-orange-500/[0.04] rounded-full blur-3xl" />
          <div className="absolute bottom-1/3 left-1/5 w-56 h-56 bg-red-600/[0.035] rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto text-center">

          {/* Version badge */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.08] px-4 py-1.5 mb-8"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-slow" />
            <span className="font-mono text-[11px] text-primary tracking-[0.18em] uppercase">
              Microsoft Entra ID · OAuth Analysis
            </span>
          </motion.div>

          {/* Main headline */}
          <motion.h1
            variants={itemFadeUp(0.08)}
            initial="hidden"
            animate="show"
            className="text-[3.25rem] sm:text-6xl lg:text-[5rem] font-extrabold leading-[1.03] tracking-tight mb-6"
          >
            <span className="bg-gradient-to-br from-amber-300 via-amber-500 to-orange-500 bg-clip-text text-transparent">
              Hunt. Score.
            </span>
            <br />
            <span className="text-foreground/90">Understand OAuth.</span>
          </motion.h1>

          {/* Sub-headline */}
          <motion.p
            variants={itemFadeUp(0.16)}
            initial="hidden"
            animate="show"
            className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10"
          >
            Find shadow OAuth patterns, risk-score every app in your Entra ID tenant,
            and decode Graph permissions into plain English —{' '}
            <span className="text-foreground/75 font-medium">
              no backend, no data egress, no agents.
            </span>
          </motion.p>

          {/* CTA row */}
          <motion.div
            variants={itemFadeUp(0.24)}
            initial="hidden"
            animate="show"
            className="flex flex-wrap items-center justify-center gap-3"
          >
            <Button
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-amber-400 font-bold px-8 text-base shadow-[0_0_28px_hsl(38_92%_50%/0.28)] hover:shadow-[0_0_40px_hsl(38_92%_50%/0.45)] transition-all duration-300"
              onClick={() => navigate('/settings')}
            >
              Start Analyzing
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground font-medium"
              onClick={() => navigate('/login')}
            >
              Sign in
            </Button>
          </motion.div>
        </div>

        {/* Terminal window */}
        <motion.div
          variants={itemFadeUp(0.34)}
          initial="hidden"
          animate="show"
          className="relative z-10 mt-20 w-full max-w-[640px] mx-auto"
        >
          {/* Outer glow ring */}
          <div className="absolute -inset-px rounded-xl bg-gradient-to-br from-amber-500/30 via-orange-600/20 to-red-600/20 blur-sm" />

          <div className="relative rounded-xl border border-border overflow-hidden shadow-[0_32px_80px_hsl(0_0%_0%/0.5)]">
            {/* Title bar */}
            <div className="flex items-center gap-1.5 px-4 py-3 bg-card/90 border-b border-border">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500/75" />
              <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/75" />
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/75" />
              <span className="ml-3 font-mono text-[11px] text-muted-foreground/60 tracking-wide">
                oauthkitchen — zsh
              </span>
            </div>

            {/* Terminal body */}
            <div className="bg-[hsl(20_12%_4.5%)] px-5 py-5 font-mono text-[13px] leading-[1.8]">
              {TERMINAL.map((line, i) =>
                line.type === 'blank' ? (
                  <div key={i} className="h-2" />
                ) : (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.9 + i * 0.055, duration: 0.25 }}
                    className={cn('whitespace-pre', LINE_COLOR[line.type])}
                  >
                    {line.text}
                  </motion.div>
                )
              )}

              {/* Blinking cursor */}
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2.2, duration: 0.2 }}
                className="terminal-cursor text-primary inline-block h-4"
              />
            </div>
          </div>

          {/* Floor glow */}
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-2/3 h-8 bg-amber-500/12 blur-2xl rounded-full pointer-events-none" />
        </motion.div>
      </section>

      {/* ── Feature cards ─────────────────────────────────────────── */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 py-24 border-t border-border/40">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <p className="font-mono text-[11px] text-primary tracking-[0.2em] uppercase mb-3">
            Core Capabilities
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Three tools. One mission.
          </h2>
        </motion.div>

        <div className="grid gap-5 md:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              className={cn(
                'rounded-xl border border-border/70 bg-card/60 p-7',
                'transition-all duration-300 cursor-default',
                f.accentBorder, f.accentGlow
              )}
            >
              <div className={cn(
                'mb-5 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border/60',
                f.accentBg, f.accentText
              )}>
                <f.icon className="h-5 w-5" />
              </div>

              <p className={cn('font-mono text-[10px] tracking-[0.18em] uppercase mb-1.5 opacity-65', f.accentText)}>
                {f.tag}
              </p>

              <h3 className="text-[1.1rem] font-bold mb-3 tracking-tight">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────── */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 py-20 border-t border-border/40">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <p className="font-mono text-[11px] text-primary tracking-[0.2em] uppercase mb-3">
            Setup
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Running in 3 steps.
          </h2>
        </motion.div>

        <div className="grid gap-10 md:grid-cols-3 relative">
          {/* Dashed connector — desktop only */}
          <div className="hidden md:block absolute top-9 left-[calc(16.7%+2rem)] right-[calc(16.7%+2rem)] h-px border-t border-dashed border-border/50" />

          {STEPS.map((step, i) => (
            <motion.div
              key={step.n}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.14 }}
              className="flex flex-col items-center text-center"
            >
              {/* Step circle */}
              <div className="relative z-10 mb-6 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border border-primary/30 bg-card shadow-[0_0_0_6px_hsl(20_14%_4%)]">
                <span className="font-mono text-xl font-bold text-primary">{step.n}</span>
              </div>

              <h3 className="text-lg font-bold mb-2 tracking-tight">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">{step.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Trust bar ─────────────────────────────────────────────── */}
      <section className="relative z-10 border-t border-border/40 bg-card/25">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {TRUST.map((t, i) => (
              <motion.div
                key={t.label}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07, duration: 0.4 }}
                className="flex items-center gap-3.5"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                  <t.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.sub}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA banner ────────────────────────────────────────────── */}
      <section className="relative z-10 overflow-hidden py-28 px-6">
        {/* Horizontal amber sweep */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[60rem] bg-gradient-to-r from-transparent via-amber-500/[0.055] to-transparent" />
        </div>

        <div className="relative max-w-2xl mx-auto text-center space-y-6">
          <p className="font-mono text-[11px] text-primary tracking-[0.2em] uppercase">
            Know your exposure
          </p>
          <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            Your tenant has OAuth apps
            <br />
            <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
              you've forgotten about.
            </span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Takes 5 minutes. No agents, no SaaS signup,{' '}
            <span className="text-foreground/70">no data leaves your browser.</span>
          </p>
          <Button
            size="lg"
            className="bg-primary text-primary-foreground hover:bg-amber-400 font-bold px-12 text-base shadow-[0_0_36px_hsl(38_92%_50%/0.30)] hover:shadow-[0_0_52px_hsl(38_92%_50%/0.50)] transition-all duration-300 mt-2"
            onClick={() => navigate('/settings')}
          >
            Start for free
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-border/40 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="font-mono">
            <span className="text-primary">$</span>
            {' '}OAuthKitchen
          </span>
          <span className="text-center sm:text-right">
            Read-only · No backend · Browser-native · Microsoft Graph API
          </span>
        </div>
      </footer>

    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { Scissors } from 'lucide-react'

type IntroPhase = 'hidden' | 'opening' | 'approach' | 'snip' | 'release' | 'reveal' | 'exit'

const INTRO_KEY = 'ajr-ribbon-cut-seen'

export default function RibbonCutIntro() {
  const [phase, setPhase] = useState<IntroPhase>('hidden')

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const replayRequested = new URLSearchParams(window.location.search).get('replayIntro') === '1'

    try {
      if (!replayRequested && window.sessionStorage.getItem(INTRO_KEY)) return
    } catch {}

    if (reducedMotion) {
      try { window.sessionStorage.setItem(INTRO_KEY, 'true') } catch {}
      return
    }

    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    setPhase('opening')

    const timers = [
      window.setTimeout(() => setPhase('approach'), 1000),
      window.setTimeout(() => setPhase('snip'), 3800),
      window.setTimeout(() => setPhase('release'), 4300),
      window.setTimeout(() => setPhase('reveal'), 5000),
      window.setTimeout(() => setPhase('exit'), 6400),
      window.setTimeout(() => {
        try { window.sessionStorage.setItem(INTRO_KEY, 'true') } catch {}
        document.documentElement.style.overflow = previousOverflow
        setPhase('hidden')
      }, 7000),
    ]

    return () => {
      timers.forEach(window.clearTimeout)
      document.documentElement.style.overflow = previousOverflow
    }
  }, [])

  if (phase === 'hidden') return null

  return (
    <div className={`ajr-ribbon-intro phase-${phase}`} aria-hidden="true">
      <div className="ajr-ribbon-stage">
        <div className="ajr-ribbon-botanical botanical-left" />
        <div className="ajr-ribbon-botanical botanical-right" />

        <div className="ajr-ribbon-mark">
          <span className="ajr-ribbon-overline">A ceremonial opening</span>
          <img src="/ajr-logo.png" alt="" width={82} height={82} />
          <span className="ajr-ribbon-brand">Always Just Royal</span>
        </div>

        <div className="ajr-ribbon-line">
          <span className="ajr-ribbon-segment ribbon-left"><i /></span>
          <span className="ajr-ribbon-segment ribbon-right"><i /></span>
          <span className="ajr-ribbon-knot" />
        </div>

        <div className="ajr-ribbon-scissors-wrap">
          <span className="ajr-scissor-glint" />
          <Scissors className="ajr-ribbon-scissors" strokeWidth={1.25} />
        </div>

        <div className="ajr-ribbon-cut-point">
          <span className="ajr-ribbon-flash" />
          <span className="ajr-ribbon-fiber fiber-one" />
          <span className="ajr-ribbon-fiber fiber-two" />
          <span className="ajr-ribbon-fiber fiber-three" />
        </div>

        <div className="ajr-ribbon-reveal">
          <span className="ajr-reveal-halo" />
          <img src="/ajr-logo.png" alt="" width={104} height={104} />
          <p>A royal harvest awaits.</p>
          <span className="ajr-reveal-rule" />
        </div>

        <div className="ajr-ribbon-particles">
          {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
        </div>
      </div>
    </div>
  )
}

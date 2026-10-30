'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'

type Step = { label: string; href?: string }
type Props = {
  steps: Step[]
  currentIndex: number
  title: string
  onSelect?: (index: number) => void
  disabled?: boolean
  compact?: boolean
}

/** Shows position in a workflow; visiting a page does not imply data completion. */
export default function SetupProgress({ steps, currentIndex, title, onSelect, disabled, compact }: Props) {
  const current = steps[currentIndex]
  const style = { '--setup-steps': steps.length, '--setup-position': current ? currentIndex / Math.max(steps.length - 1, 1) : 0 } as CSSProperties

  return <nav className={`setup-progress${compact ? ' setup-progress--compact' : ''}`} aria-label={title} style={style}>
    <div className="setup-progress__heading">
      <strong>{title}</strong>
      <span>{current ? <>Step <b>{currentIndex + 1}</b> of {steps.length}<span className="setup-progress__current-label"> · {current.label}</span></> : 'Select a setup step'}</span>
    </div>
    <div className="setup-progress__scroll">
      <div className="setup-progress__rail">
        {current && <div className="setup-progress__track" role="progressbar" aria-label={`${title}: current step`} aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={currentIndex + 1} aria-valuetext={`Step ${currentIndex + 1} of ${steps.length}: ${current.label}`}><span /></div>}
        <ol className="setup-progress__steps">
          {steps.map((item, index) => {
            const state = index === currentIndex ? 'current' : current && index < currentIndex ? 'previous' : 'upcoming'
            const content = <><span className="setup-progress__number" aria-hidden="true">{index + 1}</span><span className="setup-progress__label">{item.label}</span><span className="setup-progress__state">{state === 'current' ? 'Current step' : state === 'previous' ? 'Previous step' : 'Upcoming'}</span></>
            return <li key={item.label} data-state={state}>
              {item.href ? <Link href={item.href} aria-current={state === 'current' ? 'step' : undefined}>{content}</Link> : <button className="setup-progress__button" type="button" disabled={disabled} onClick={() => onSelect?.(index)} aria-current={state === 'current' ? 'step' : undefined}>{content}</button>}
            </li>
          })}
        </ol>
      </div>
    </div>
  </nav>
}

'use client'

import { ArrowLeft } from 'lucide-react'

interface PageHeaderProps {
  title: string
  onBack: () => void
}

export default function PageHeader({ title, onBack }: PageHeaderProps) {
  return (
    <div className="page-header">
      <button type="button" className="back-button" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />Back</button>
      <span className="back-divider" aria-hidden="true" />
      <span className="page-title">{title}</span>
    </div>
  )
}

import { LoaderCircle, ShieldCheck } from 'lucide-react'

export default function AppLoading({ message = 'Preparing your workspace' }: { message?: string }) {
  return <div className="app-loading" role="status" aria-live="polite">
    <div className="app-loading__brand"><ShieldCheck size={25} strokeWidth={1.7} /></div>
    <strong>Identity OS</strong>
    <span><LoaderCircle size={16} className="ui-spin" aria-hidden="true" />{message}</span>
  </div>
}

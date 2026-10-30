import type { Metadata } from 'next'
import '../src/index.css'
import '../src/styles/catalogue.css'
import '../src/features/consent/repository.css'
import '../src/features/consent/records.css'
import '../src/styles/theme.css'
import KeycloakProvider from '../src/components/KeycloakProvider'

export const metadata: Metadata = {
  title: 'Catalogue Service',
  description: 'Identity OS catalogue service',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <KeycloakProvider>
          {children}
        </KeycloakProvider>
      </body>
    </html>
  )
}

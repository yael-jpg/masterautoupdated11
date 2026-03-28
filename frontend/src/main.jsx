import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import App from './App.jsx'
import { LandingPage } from './pages/LandingPage.jsx'
import { PortalApp } from './pages/portal/PortalApp.jsx'
import { GuestPortalPage } from './pages/GuestPortalPage.jsx'

const pathname = window.location.pathname
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

// Routing:
//   /          → public landing page
//   /guest/*   → guest online quotation
//   /portal/*  → customer self-service portal
//   everything else (/admin, …) → staff dashboard (App)
const Root = pathname === '/'
  ? LandingPage
  : pathname.startsWith('/guest')
    ? GuestPortalPage
    : pathname.startsWith('/portal')
      ? PortalApp
      : App

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID} locale="en">
      <Root />
    </GoogleOAuthProvider>
  </StrictMode>,
)

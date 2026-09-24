import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Apply a previously selected theme before React paints the login screen.
// AppShell keeps this value up to date when the user changes the top-bar toggle.
if (localStorage.getItem('aeroprice_theme') === 'dark') {
  document.documentElement.classList.add('dark')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

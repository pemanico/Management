import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';
import { applyTheme, readTheme } from './theme.ts';

// Antes de desenhar, para não piscar no tema errado.
applyTheme(readTheme());

const root = document.getElementById('root');
if (!root) throw new Error('#root em falta');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

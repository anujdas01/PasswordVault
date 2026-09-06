const KEY = 'pv-theme';

export function getTheme() {
  return localStorage.getItem(KEY) || 'dark';
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(KEY, theme);
}

export function initTheme() {
  const theme = getTheme();
  document.documentElement.setAttribute('data-theme', theme);
  return theme;
}

export function listThemes() {
  return ['dark', 'light'];
}

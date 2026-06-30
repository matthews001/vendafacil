/* VendaFácil — alternância de aparência clara/escura.
   Persistida localmente e compartilhada entre painel, vitrine e portal do entregador. */
(() => {
  'use strict';

  const STORAGE_KEY = 'vendafacil:appearance';
  const THEMES = new Set(['light', 'dark']);

  function storedTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return THEMES.has(saved) ? saved : 'light';
    } catch (_) {
      return 'light';
    }
  }

  function currentTheme() {
    const active = document.documentElement.dataset.vfTheme;
    return THEMES.has(active) ? active : storedTheme();
  }

  function themeMetaColor(theme) {
    return theme === 'dark' ? '#0b1220' : '#10251e';
  }

  function updateControls(theme) {
    const nextIsDark = theme !== 'dark';
    document.querySelectorAll('[data-vf-theme-toggle]').forEach(button => {
      const icon = button.querySelector('i');
      const text = button.querySelector('[data-vf-theme-label]');
      const nextLabel = nextIsDark ? 'Modo escuro' : 'Modo claro';
      button.setAttribute('aria-label', 'Ativar ' + nextLabel.toLowerCase());
      button.setAttribute('title', nextLabel);
      button.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
      if (icon) icon.className = nextIsDark ? 'ti ti-moon-stars' : 'ti ti-sun-high';
      if (text) text.textContent = nextLabel;
    });
  }

  function applyTheme(theme, persist = true) {
    const safeTheme = THEMES.has(theme) ? theme : 'light';
    document.documentElement.dataset.vfTheme = safeTheme;
    document.documentElement.style.colorScheme = safeTheme;
    document.body?.classList.toggle('vf-theme-dark', safeTheme === 'dark');
    document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
      meta.setAttribute('content', themeMetaColor(safeTheme));
    });
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, safeTheme); } catch (_) {}
    }
    updateControls(safeTheme);
    window.dispatchEvent(new CustomEvent('vf-theme-changed', { detail: { theme: safeTheme } }));
  }

  function toggleTheme() {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  }

  function ensureControl() {
    if (document.getElementById('vf-theme-toggle')) return;
    const dock = document.createElement('div');
    dock.className = 'vf-theme-dock';
    dock.innerHTML = [
      '<button id="vf-theme-toggle" class="vf-theme-toggle" data-vf-theme-toggle type="button" aria-pressed="false">',
      '<i class="ti ti-moon-stars"></i>',
      '<span data-vf-theme-label>Modo escuro</span>',
      '</button>'
    ].join('');
    dock.querySelector('button').addEventListener('click', toggleTheme);
    document.body.appendChild(dock);
    updateControls(currentTheme());
  }

  window.vfApplyAppearance = applyTheme;
  window.vfToggleAppearance = toggleTheme;

  // Aplica cedo para evitar troca visível de cor durante o carregamento.
  applyTheme(storedTheme(), false);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureControl, { once: true });
  } else {
    ensureControl();
  }
})();

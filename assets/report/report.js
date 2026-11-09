/* The behavior of the HTML report. Everything it needs is in the page: it fetches nothing, and the
   findings are plain HTML, so the report reads fine with this script switched off. */
(function () {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  /* ---------------------------------------------------------------- announcements */

  const announcer = $('#announce');
  function announce(message) {
    if (announcer) {
      announcer.textContent = message;
    }
  }

  /* ---------------------------------------------------------------- light and dark */

  const root = document.documentElement;
  const themeButton = $('#bk-theme');

  function currentTheme() {
    return (
      root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    );
  }

  function reflectTheme(theme) {
    themeButton.setAttribute('aria-pressed', String(theme === 'dark'));
    themeButton.setAttribute(
      'aria-label',
      'Switch to a ' + (theme === 'dark' ? 'light' : 'dark') + ' background',
    );
  }

  reflectTheme(currentTheme());
  themeButton.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    reflectTheme(next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* storage can be unavailable (private window): the choice then lasts for this page only */
    }
  });

  /* ---------------------------------------------------------------- (i) buttons */

  let lastInfo = null;

  function setInfo(button, open) {
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    if (panel) {
      panel.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.info-btn');
    if (button) {
      lastInfo = button;
      setInfo(button, button.getAttribute('aria-expanded') !== 'true');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      return;
    }
    const open = $$('.info-btn[aria-expanded="true"]');
    open.forEach((button) => setInfo(button, false));
    if (open.length > 0 && lastInfo) {
      lastInfo.focus();
    }
  });

  /* ---------------------------------------------------------------- filters */

  const findings = $$('.finding');
  const search = $('#q');
  const selects = { category: $('#f-category'), language: $('#f-language'), rule: $('#f-rule') };
  const chips = $$('.chip[data-severity]');
  const counter = $('#result-count');
  const noMatch = $('#no-match');

  const state = { query: '', category: '', language: '', rule: '' };

  function severityIsShown(severity) {
    return chips.some(
      (chip) => chip.dataset.severity === severity && chip.getAttribute('aria-pressed') === 'true',
    );
  }

  function matches(item) {
    return (
      severityIsShown(item.dataset.severity) &&
      (state.category === '' || item.dataset.category === state.category) &&
      (state.language === '' || item.dataset.language === state.language) &&
      (state.rule === '' || item.dataset.rule === state.rule) &&
      (state.query === '' || item.dataset.search.includes(state.query))
    );
  }

  function describeCount(visible, total) {
    const noun = total === 1 ? 'finding' : 'findings';
    return visible === total
      ? 'Showing all ' + total + ' ' + noun
      : 'Showing ' + visible + ' of ' + total + ' ' + noun;
  }

  function applyFilters() {
    let visible = 0;
    findings.forEach((item) => {
      const show = matches(item);
      item.hidden = !show;
      visible += show ? 1 : 0;
    });
    $$('.file-group').forEach((group) => {
      group.hidden = !$('.finding:not([hidden])', group);
    });
    if (counter) {
      counter.textContent = describeCount(visible, findings.length);
    }
    if (noMatch) {
      noMatch.hidden = visible !== 0;
    }
  }

  function clearFilters() {
    state.query = state.category = state.language = state.rule = '';
    if (search) {
      search.value = '';
    }
    Object.values(selects).forEach((select) => {
      if (select) {
        select.value = '';
      }
    });
    chips.forEach((chip) => chip.setAttribute('aria-pressed', 'true'));
    applyFilters();
  }

  if (findings.length > 0) {
    if (search) {
      search.addEventListener('input', () => {
        state.query = search.value.trim().toLowerCase();
        applyFilters();
      });
    }
    Object.entries(selects).forEach(([key, select]) => {
      if (select) {
        select.addEventListener('change', () => {
          state[key] = select.value;
          applyFilters();
        });
      }
    });
    chips.forEach((chip) =>
      chip.addEventListener('click', () => {
        chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true'));
        applyFilters();
      }),
    );
    const bind = (id, handler) => {
      const button = $(id);
      if (button) {
        button.addEventListener('click', handler);
      }
    };
    bind('#clear-filters', clearFilters);
    bind('#expand-all', () =>
      findings.forEach((item) => {
        item.open = !item.hidden;
      }),
    );
    bind('#collapse-all', () =>
      findings.forEach((item) => {
        item.open = false;
      }),
    );
  }

  /* ---------------------------------------------------------------- opening a finding from a link */

  function openTarget() {
    const id = decodeURIComponent(window.location.hash.slice(1));
    const target = id === '' ? null : document.getElementById(id);
    if (target && target.matches('details.finding')) {
      if (target.hidden) {
        clearFilters();
      }
      target.open = true;
      target.scrollIntoView();
    }
  }

  window.addEventListener('hashchange', openTarget);
  openTarget();

  /* ---------------------------------------------------------------- copying an example */

  /* The older copy command: it works where the clipboard API is refused (a page that is not
     focused, or an embedded browser) as long as the click that started it was a real one. */
  function copyWithSelection(text) {
    return new Promise((resolve, reject) => {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.className = 'sr-only';
      document.body.appendChild(area);
      area.select();
      let copied;
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      }
      area.remove();
      if (copied) {
        resolve();
      } else {
        reject(new Error('The browser did not allow copying.'));
      }
    });
  }

  function writeToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => copyWithSelection(text));
    }
    return copyWithSelection(text);
  }

  function flash(label, message) {
    const original = label.dataset.original || label.textContent;
    label.dataset.original = original;
    label.textContent = message;
    announce(message);
    setTimeout(() => {
      label.textContent = original;
    }, 1800);
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.copy');
    if (!button) {
      return;
    }
    const label = $('span', button);
    writeToClipboard($('code', button.closest('.code')).textContent).then(
      () => flash(label, 'Copied'),
      () => flash(label, 'Copy failed'),
    );
  });

  /* ---------------------------------------------------------------- keyboard */

  document.addEventListener('keydown', (event) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (event.key === '/' && !typing && search) {
      event.preventDefault();
      search.focus();
    }
  });
})();

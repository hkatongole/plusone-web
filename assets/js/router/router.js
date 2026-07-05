/**
 * Tiny hash router. Routes are registered as pattern -> render(params) functions.
 * Patterns use :param syntax, e.g. '/matches/:id'.
 * This is intentionally small: Section 13.1 forbids a framework, and the app's
 * page count is generated from query results, not from route count, so the
 * router itself never needs to be more than this.
 */
export class Router {
  constructor(outletEl) {
    this.outlet = outletEl;
    this.routes = [];
    window.addEventListener('hashchange', () => this._resolve());
  }

  register(pattern, render) {
    const paramNames = [];
    const regexStr = pattern
      .split('/')
      .map((seg) => {
        if (seg.startsWith(':')) {
          paramNames.push(seg.slice(1));
          return '([^/]+)';
        }
        return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/');
    this.routes.push({ regex: new RegExp(`^${regexStr}$`), paramNames, render });
    return this;
  }

  start(defaultPath = '/') {
    if (!location.hash) location.hash = `#${defaultPath}`;
    this._resolve();
  }

  navigate(path) {
    location.hash = `#${path}`;
  }

  async _resolve() {
    const path = (location.hash.slice(1) || '/').split('?')[0];
    const query = Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));

    for (const route of this.routes) {
      const match = path.match(route.regex);
      if (match) {
        const params = {};
        route.paramNames.forEach((name, i) => (params[name] = decodeURIComponent(match[i + 1])));
        this.outlet.setAttribute('aria-busy', 'true');
        try {
          const html = await route.render({ ...params, query });
          this.outlet.innerHTML = html;
        } catch (err) {
          console.error('Route render failed:', err);
          this.outlet.innerHTML = renderErrorState(err);
        } finally {
          this.outlet.removeAttribute('aria-busy');
          this.outlet.scrollTop = 0;
        }
        return;
      }
    }
    this.outlet.innerHTML = `<div class="empty-state"><h2>Page not found</h2><p>That route doesn't exist yet.</p></div>`;
  }
}

/** Maps internal errors to the plain-language taxonomy from Section 13.7. */
export function renderErrorState(err) {
  const category = err?.category || 'unexpected-application-error';
  const messages = {
    'database-unavailable': 'The sports database isn\u2019t loaded yet. Import a .sqlite backup to continue.',
    'schema-mismatch': 'This file doesn\u2019t match the expected PlusOne export format.',
    'write-rejected': 'This app is read-only against sports data \u2014 that action isn\u2019t permitted.',
    'unexpected-application-error': 'Something went wrong loading this page.',
  };
  return `
    <div class="empty-state empty-state--error">
      <h2>Couldn\u2019t load this page</h2>
      <p>${messages[category] || messages['unexpected-application-error']}</p>
    </div>
  `;
}

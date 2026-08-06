const ACTIVE_CLASS = 'demo-segment__button--active';
const LAYOUT_QUERY_PARAM = 'layout_filter';
const LAYOUT_QUERY_VALUES = {
  sidebar: '1',
  horizontal: '2',
  drawer: '3',
};
const QUERY_VALUE_LAYOUTS = {
  1: 'sidebar',
  2: 'horizontal',
  3: 'drawer',
};

function isFilterResultsPage(pathname) {
  return /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:collections(?:\/|$)|search\/?$)/i.test(pathname);
}

class GloboDemoControls {
  /** @param {HTMLElement} toolbar */
  constructor(toolbar) {
    this.toolbar = toolbar;
    this.root = toolbar.closest('#globo-demo-page');
    this.stage = this.root?.querySelector('.globo-page_content');
    this.sidebar = this.root?.querySelector('#globo-aside_demo');
    this.mobileBreakpoint = window.matchMedia('(max-width: 1179px)');
    this.isFilterResultsPage = isFilterResultsPage(window.location.pathname);
    this.guideCards = Array.from(this.root?.querySelectorAll('.demo-card[data-demo-step]') || []);
    this.doneSteps = new Set();
    this.stepActions = new Map();

    this.defaults = {
      layout: toolbar.dataset.defaultLayout || 'sidebar',
      store: toolbar.dataset.defaultStore || 'fashion',
      device: toolbar.dataset.defaultDevice || 'desktop',
      guideOpen: !this.mobileBreakpoint.matches,
    };

    this.state = {
      ...this.defaults,
      layout: this.getInitialLayout(),
    };
    this.handleClick = this.handleClick.bind(this);
    this.handleViewportChange = this.handleViewportChange.bind(this);
  }

  init() {
    if (!this.root) return;

    this.root.addEventListener('click', this.handleClick);
    this.mobileBreakpoint.addEventListener('change', this.handleViewportChange);
    this.updateGuideProgress();
    this.render({ emit: false });
  }

  destroy() {
    this.root?.removeEventListener('click', this.handleClick);
    this.mobileBreakpoint.removeEventListener('change', this.handleViewportChange);
  }

  /** @param {MouseEvent} event */
  handleClick(event) {
    const target = event.target instanceof Element
      ? event.target.closest('[data-demo-control], [data-demo-action], .demo-card[data-demo-step]')
      : null;
    if (!target) return;

    const control = target.dataset.demoControl;
    const value = target.dataset.demoValue;

    if (target.matches('.demo-card[data-demo-step]')) {
      this.completeGuideStep(target);
      return;
    }

    if (control && value) {
      if (control === 'layout') {
        this.selectLayout(value);
        return;
      }

      this.setState({ [control]: value });
      return;
    }

    switch (target.dataset.demoAction) {
      case 'reset':
        this.reset();
        break;
      case 'toggle-guide':
        this.setState({ guideOpen: !this.state.guideOpen });
        break;
      case 'close-guide':
        this.setState({ guideOpen: false });
        break;
      case 'open-guide':
        this.setState({ guideOpen: true });
        break;
    }
  }

  handleViewportChange(event) {
    if (event.matches && this.state.guideOpen) {
      this.setState({ guideOpen: false });
    }
  }

  /** @param {Partial<typeof this.state>} patch */
  setState(patch) {
    const previous = { ...this.state };
    this.state = { ...this.state, ...patch };
    this.render({ previous, emit: true });
  }

  registerStepAction(name, handler) {
    if (!name || typeof handler !== 'function') return;
    this.stepActions.set(name, handler);
  }

  unregisterStepAction(name) {
    this.stepActions.delete(name);
  }

  completeGuideStep(card) {
    const stepId = card.dataset.demoStep;
    if (!stepId) return;

    const firstCompletion = !this.doneSteps.has(stepId);
    this.doneSteps.add(stepId);

    card.classList.add('demo-card--checked');
    card.dataset.demoDone = 'true';
    card.setAttribute('aria-pressed', 'true');

    const icon = card.querySelector('.demo-card__icon .sc-interp');
    if (icon) icon.textContent = '✓';

    this.updateGuideProgress();

    const action = card.dataset.demoStepAction?.trim() || '';
    const detail = {
      id: stepId,
      action,
      card,
      firstCompletion,
      completedCount: this.doneSteps.size,
      totalCount: this.guideCards.length,
    };

    this.root.dispatchEvent(new CustomEvent('globo-demo:step', { bubbles: true, detail }));

    const handler = this.stepActions.get(action);
    if (action && handler) handler(detail, this);
  }

  updateGuideProgress() {
    const completed = this.doneSteps.size;
    const total = this.guideCards.length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const progress = this.sidebar?.querySelector('[data-demo-progress]');
    const fill = progress?.querySelector('.demo-progress__fill');
    const text = this.sidebar?.querySelector('.demo-progress__text');
    const pillCount = this.root.querySelector('[data-demo-guide-pill-count]');

    progress?.setAttribute('aria-valuemax', String(total));
    progress?.setAttribute('aria-valuenow', String(completed));
    if (fill) fill.style.width = `${percent}%`;
    if (text) text.textContent = `${completed} / ${total}`;
    if (pillCount) pillCount.textContent = `${completed}/${total}`;
  }

  resetGuideProgress() {
    this.doneSteps.clear();
    this.guideCards.forEach((card) => {
      card.classList.remove('demo-card--checked');
      delete card.dataset.demoDone;
      card.setAttribute('aria-pressed', 'false');

      const icon = card.querySelector('.demo-card__icon .sc-interp');
      if (icon) icon.textContent = '';
    });
    this.updateGuideProgress();
  }

  getInitialLayout() {
    if (!this.isFilterResultsPage) return this.defaults.layout;

    const queryValue = new URL(window.location.href).searchParams.get(LAYOUT_QUERY_PARAM);
    return QUERY_VALUE_LAYOUTS[queryValue] || this.defaults.layout;
  }

  selectLayout(layout) {
    if (!(layout in LAYOUT_QUERY_VALUES)) return;

    if (!this.isFilterResultsPage) {
      this.setState({ layout });
      return;
    }

    const url = new URL(window.location.href);
    const queryValue = LAYOUT_QUERY_VALUES[layout];

    if (url.searchParams.get(LAYOUT_QUERY_PARAM) === queryValue) {
      this.setState({ layout });
      return;
    }

    url.searchParams.set(LAYOUT_QUERY_PARAM, queryValue);
    window.location.assign(url.toString());
  }

  reset() {
    const { guideOpen } = this.state;
    this.clearActiveFilters();
    this.resetGuideProgress();
    this.state = { ...this.defaults, guideOpen };
    this.render({ emit: true, reset: true });
  }

  /** @param {{ previous?: object, emit?: boolean, reset?: boolean }} options */
  render(options = {}) {
    const { layout, store, device, guideOpen } = this.state;

    this.root.dataset.demoLayout = layout;
    this.root.dataset.demoStore = store;
    this.root.dataset.demoDevice = device;
    this.root.dataset.demoGuide = guideOpen ? 'open' : 'closed';

    this.updateSegment('layout', layout);
    this.updateSegment('store', store);
    this.updateSegment('device', device);
    this.updateGuide(guideOpen);
    this.updateStage(device);
    this.updateStore(store);

    if (options.emit) {
      this.root.dispatchEvent(
        new CustomEvent('globo-demo:change', {
          bubbles: true,
          detail: {
            state: { ...this.state },
            previous: options.previous || null,
            reset: Boolean(options.reset),
          },
        })
      );
    }
  }

  updateSegment(control, activeValue) {
    this.toolbar.querySelectorAll(`[data-demo-control="${control}"]`).forEach((button) => {
      const isActive = button.dataset.demoValue === activeValue;
      button.classList.toggle(ACTIVE_CLASS, isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
  }

  updateGuide(isOpen) {
    if (this.sidebar) {
      this.sidebar.hidden = !isOpen;
      this.sidebar.setAttribute('aria-hidden', String(!isOpen));
    }

    const toggle = this.toolbar.querySelector('[data-demo-action="toggle-guide"]');
    toggle?.setAttribute('aria-expanded', String(isOpen));

    const label = this.toolbar.querySelector('[data-demo-guide-label]');
    if (label) label.textContent = isOpen ? 'Hide guide' : 'Show guide';

    const pill = this.root.querySelector('[data-demo-guide-pill]');
    if (pill) {
      pill.hidden = isOpen;
      pill.setAttribute('aria-expanded', String(isOpen));
    }

    const scrim = this.root.querySelector('[data-demo-guide-scrim]');
    if (scrim) scrim.hidden = !isOpen;

    const progress = this.sidebar?.querySelector('.demo-progress__text');
    const pillCount = pill?.querySelector('[data-demo-guide-pill-count]');
    if (pillCount && progress) pillCount.textContent = progress.textContent.replace(/\s+/g, '');
  }

  updateStage(device) {
    if (!this.stage) return;
    this.stage.setAttribute('mode', device);
    // this.stage.style.removeProperty('max-width');
  }

  updateStore(store) {
    this.root.querySelectorAll('[data-demo-store-only]').forEach((element) => {
      element.hidden = element.dataset.demoStoreOnly !== store;
    });
  }

  clearActiveFilters() {
    const clearButton = Array.from(
      this.root.querySelectorAll('.facets__clear-all-link--active, .facets__clear-all--active')
    ).find((button) => !button.closest('#filters-drawer'));

    clearButton?.click();
  }
}

function installDemoStyles() {
  if (document.getElementById('globo-demo-controls-style')) return;

  const style = document.createElement('style');
  style.id = 'globo-demo-controls-style';
  style.textContent = `
    #globo-demo-page [hidden] { display: none !important; }
  `;
  document.head.append(style);
}

function initDemoControls() {
  const toolbar = document.querySelector('[data-demo-toolbar]');
  if (!(toolbar instanceof HTMLElement) || toolbar.dataset.demoReady === 'true') return;

  installDemoStyles();
  toolbar.dataset.demoReady = 'true';
  const controls = new GloboDemoControls(toolbar);
  controls.init();
  window.globoDemoControls = controls;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDemoControls, { once: true });
} else {
  initDemoControls();
}

document.addEventListener('shopify:section:load', initDemoControls);

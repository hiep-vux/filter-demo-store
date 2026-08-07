const ACTIVE_CLASS = 'gpf-demo-segmented-control__button--active';
const DEMO_SESSION_KEY = 'globo-demo:session-state';
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
    this.root = toolbar.closest('#gpf-demo');
    this.stage = this.root?.querySelector('.gpf-demo__storefront');
    this.guide = this.root?.querySelector('#gpf-demo-guide');
    this.mobileBreakpoint = window.matchMedia('(max-width: 1179px)');
    this.isFilterResultsPage = isFilterResultsPage(window.location.pathname);
    this.guideCards = Array.from(this.root?.querySelectorAll('.gpf-demo-step[data-demo-step]') || []);
    const persistedState = this.readPersistedState();
    const validStepIds = new Set(this.guideCards.map((card) => card.dataset.demoStep));
    const persistedSteps = Array.isArray(persistedState.doneSteps) ? persistedState.doneSteps : [];
    this.doneSteps = new Set(
      persistedSteps.filter((stepId) => validStepIds.has(stepId))
    );
    this.stepActions = new Map();

    this.defaults = {
      layout: toolbar.dataset.defaultLayout || 'sidebar',
      store: toolbar.dataset.defaultStore || 'fashion',
      device: toolbar.dataset.defaultDevice || 'desktop',
      guideOpen: !this.mobileBreakpoint.matches,
    };

    this.state = {
      ...this.defaults,
      layout: this.getInitialLayout(persistedState.layout),
      device: ['desktop', 'mobile'].includes(persistedState.device)
        ? persistedState.device
        : this.defaults.device,
      guideOpen: typeof persistedState.guideOpen === 'boolean'
        ? persistedState.guideOpen
        : this.defaults.guideOpen,
    };
    this.handleClick = this.handleClick.bind(this);
    this.handleViewportChange = this.handleViewportChange.bind(this);
  }

  init() {
    if (!this.root) return;

    this.root.addEventListener('click', this.handleClick);
    this.mobileBreakpoint.addEventListener('change', this.handleViewportChange);
    this.restoreGuideProgress();
    this.updateGuideProgress();
    this.render({ emit: false });
  }

  destroy() {
    this.root?.removeEventListener('click', this.handleClick);
    this.mobileBreakpoint.removeEventListener('change', this.handleViewportChange);
  }

  refreshGuide() {
    this.guide = this.root?.querySelector('#gpf-demo-guide');
    this.guideCards = Array.from(this.root?.querySelectorAll('.gpf-demo-step[data-demo-step]') || []);

    const validStepIds = new Set(this.guideCards.map((card) => card.dataset.demoStep));
    this.doneSteps = new Set(
      Array.from(this.doneSteps).filter((stepId) => validStepIds.has(stepId))
    );

    this.restoreGuideProgress();
    this.updateGuideProgress();
    this.updateGuide(this.state.guideOpen);
    this.updateStore(this.state.store);
    this.persistState();
  }

  /** @param {MouseEvent} event */
  handleClick(event) {
    const target = event.target instanceof Element
      ? event.target.closest('[data-demo-control], [data-demo-action], .gpf-demo-step[data-demo-step]')
      : null;
    if (!target) return;

    const control = target.dataset.demoControl;
    const value = target.dataset.demoValue;

    if (target.matches('.gpf-demo-step[data-demo-step]')) {
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

  readPersistedState() {
    try {
      if (window.__globoDemoInitialState && typeof window.__globoDemoInitialState === 'object') {
        return window.__globoDemoInitialState;
      }

      const storedState = window.sessionStorage.getItem(DEMO_SESSION_KEY);
      const parsedState = storedState ? JSON.parse(storedState) : {};
      return parsedState && typeof parsedState === 'object' ? parsedState : {};
    } catch (error) {
      return {};
    }
  }

  persistState() {
    try {
      const persistedState = {
        device: this.state.device,
        layout: this.state.layout,
        guideOpen: this.state.guideOpen,
        doneSteps: Array.from(this.doneSteps),
      };

      window.__globoDemoInitialState = persistedState;
      window.sessionStorage.setItem(
        DEMO_SESSION_KEY,
        JSON.stringify(persistedState)
      );
    } catch (error) {
      // sessionStorage may be unavailable in privacy-restricted browsers.
    }
  }

  restoreGuideProgress() {
    this.guideCards.forEach((card) => {
      const isDone = this.doneSteps.has(card.dataset.demoStep);
      card.classList.toggle('gpf-demo-step--checked', isDone);
      card.toggleAttribute('data-demo-done', isDone);
      card.setAttribute('aria-pressed', String(isDone));

      const icon = card.querySelector('.gpf-demo-step__icon .sc-interp');
      if (icon) icon.textContent = isDone ? '✓' : '';
    });
  }

  completeGuideStep(card) {
    const stepId = card.dataset.demoStep;
    if (!stepId) return;

    const firstCompletion = !this.doneSteps.has(stepId);
    this.doneSteps.add(stepId);

    card.classList.add('gpf-demo-step--checked');
    card.dataset.demoDone = 'true';
    card.setAttribute('aria-pressed', 'true');

    const icon = card.querySelector('.gpf-demo-step__icon .sc-interp');
    if (icon) icon.textContent = '✓';

    this.updateGuideProgress();
    this.persistState();

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
    const progress = this.guide?.querySelector('[data-demo-progress]');
    const fill = progress?.querySelector('.gpf-demo-progress__fill');
    const text = this.guide?.querySelector('.gpf-demo-progress__text');
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
      card.classList.remove('gpf-demo-step--checked');
      delete card.dataset.demoDone;
      card.setAttribute('aria-pressed', 'false');

      const icon = card.querySelector('.gpf-demo-step__icon .sc-interp');
      if (icon) icon.textContent = '';
    });
    this.updateGuideProgress();
  }

  getInitialLayout(persistedLayout) {
    const storedLayout = persistedLayout in LAYOUT_QUERY_VALUES
      ? persistedLayout
      : this.defaults.layout;

    if (!this.isFilterResultsPage) return storedLayout;

    const queryValue = new URL(window.location.href).searchParams.get(LAYOUT_QUERY_PARAM);
    return QUERY_VALUE_LAYOUTS[queryValue] || storedLayout;
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
    this.state = { ...this.state, layout };
    this.persistState();
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
    this.persistState();

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
    if (this.guide) {
      this.guide.hidden = !isOpen;
      this.guide.setAttribute('aria-hidden', String(!isOpen));
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

    const progress = this.guide?.querySelector('.gpf-demo-progress__text');
    const pillCount = pill?.querySelector('[data-demo-guide-pill-count]');
    if (pillCount && progress) pillCount.textContent = progress.textContent.replace(/\s+/g, '');
  }

  updateStage(device) {
    if (!this.stage) return;
    document.documentElement.dataset.demoDevice = device;
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
  if (document.getElementById('gpf-demo-runtime-style')) return;

  const style = document.createElement('style');
  style.id = 'gpf-demo-runtime-style';
  style.textContent = `
    #gpf-demo [hidden] { display: none !important; }
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
  requestAnimationFrame(() => document.documentElement.removeAttribute('data-demo-prepaint'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDemoControls, { once: true });
} else {
  initDemoControls();
}

document.addEventListener('shopify:section:load', (event) => {
  const section = event.target instanceof Element ? event.target : null;
  const hasGuide = section?.matches('.gpf-demo-guide-section')
    || section?.querySelector('#gpf-demo-guide');

  if (hasGuide && window.globoDemoControls) {
    window.globoDemoControls.refreshGuide();
    return;
  }

  initDemoControls();
});



window.addEventListener('globoFilterSearchDrawerOpened', function () {
    const searchPopup = document.querySelector('#glFilter-search-popup');
    const mainContent = document.querySelector('#MainContent');

    if (!searchPopup || !mainContent) return;

    mainContent.parentNode.insertBefore(searchPopup, mainContent);

});

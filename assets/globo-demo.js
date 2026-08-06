const ACTIVE_CLASS = 'demo-segment__button--active';

class GloboDemoControls {
  /** @param {HTMLElement} toolbar */
  constructor(toolbar) {
    this.toolbar = toolbar;
    this.root = toolbar.closest('#globo-demo-page');
    this.stage = this.root?.querySelector('.globo-page_content');
    this.sidebar = this.root?.querySelector('#globo-aside_demo');
    this.mobileBreakpoint = window.matchMedia('(max-width: 1179px)');

    this.defaults = {
      layout: toolbar.dataset.defaultLayout || 'sidebar',
      store: toolbar.dataset.defaultStore || 'fashion',
      device: toolbar.dataset.defaultDevice || 'desktop',
      guideOpen: !this.mobileBreakpoint.matches,
    };

    this.state = { ...this.defaults };
    this.handleClick = this.handleClick.bind(this);
    this.handleViewportChange = this.handleViewportChange.bind(this);
  }

  init() {
    if (!this.root) return;

    this.toolbar.addEventListener('click', this.handleClick);
    this.sidebar?.addEventListener('click', this.handleClick);
    this.mobileBreakpoint.addEventListener('change', this.handleViewportChange);
    this.render({ emit: false });
  }

  destroy() {
    this.toolbar.removeEventListener('click', this.handleClick);
    this.sidebar?.removeEventListener('click', this.handleClick);
    this.mobileBreakpoint.removeEventListener('change', this.handleViewportChange);
  }

  /** @param {MouseEvent} event */
  handleClick(event) {
    const target = event.target instanceof Element ? event.target.closest('button') : null;
    if (!target) return;

    const control = target.dataset.demoControl;
    const value = target.dataset.demoValue;

    if (control && value) {
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

  reset() {
    this.clearActiveFilters();
    this.state = { ...this.defaults };
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
    this.updateFilterLayout(layout);

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
  }

  updateStage(device) {
    if (!this.stage) return;
    this.stage.style.maxWidth = device === 'mobile' ? '430px' : '1240px';
  }

  updateStore(store) {
    this.root.querySelectorAll('[data-demo-store-only]').forEach((element) => {
      element.hidden = element.dataset.demoStoreOnly !== store;
    });
  }

  updateFilterLayout(layout) {
    const collection = this.root.querySelector('.collection-wrapper');
    const wrapper = collection?.querySelector(':scope > .facets-block-wrapper:not(#filters-drawer)');
    const facets = wrapper?.querySelector('.facets');
    const toggle = collection?.querySelector(':scope > .facets-toggle');
    const form = wrapper?.querySelector('facets-form-component');
    const drawer = this.root.querySelector('#filters-drawer');

    if (!wrapper || !facets) return;

    const isDrawer = layout === 'drawer';
    const isSidebar = layout === 'sidebar';
    wrapper.hidden = isDrawer;
    toggle?.toggleAttribute('data-demo-force-visible', isDrawer);

    wrapper.classList.toggle('facets-block-wrapper--vertical', isSidebar);
    wrapper.classList.toggle('facets-block-wrapper--horizontal', !isSidebar);
    facets.classList.toggle('facets--vertical', isSidebar);
    facets.classList.toggle('facets--horizontal', !isSidebar);
    form?.setAttribute('form-style', isSidebar ? 'vertical' : 'horizontal');

    wrapper.style.setProperty(
      '--grid-column--desktop',
      isSidebar ? '2 / var(--facets-vertical-col-width)' : 'var(--centered)'
    );
    wrapper.style.setProperty('--facets-margin', isSidebar ? '0 20px 0 0' : '0 0 8px 0');

    if (!isDrawer && drawer && 'close' in drawer && typeof drawer.close === 'function') {
      drawer.close();
    }
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
    #globo-demo-page .facets-toggle[data-demo-force-visible] { display: flex !important; }
    #globo-demo-page[data-demo-device="mobile"] .globo-page_content {
      width: 100%;
      margin-inline: auto;
    }
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

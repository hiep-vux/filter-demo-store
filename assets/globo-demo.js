import { CartErrorEvent, CartLinesUpdateEvent } from '@shopify/events';

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
    this.handleThemeDrawerOpen = this.handleThemeDrawerOpen.bind(this);
    this.handleThemeDrawerClose = this.handleThemeDrawerClose.bind(this);
    this.updateToolbarHeight = this.updateToolbarHeight.bind(this);
    this.toolbarResizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(this.updateToolbarHeight)
      : null;
  }

  init() {
    if (!this.root) return;

    this.root.addEventListener('click', this.handleClick);
    this.mobileBreakpoint.addEventListener('change', this.handleViewportChange);
    document.addEventListener('theme-drawer:open', this.handleThemeDrawerOpen);
    document.addEventListener('theme-drawer:close', this.handleThemeDrawerClose);
    window.addEventListener('resize', this.updateToolbarHeight);
    this.toolbarResizeObserver?.observe(this.toolbar);

    this.updateToolbarHeight();
    const cartOpen = Boolean(document.querySelector('#cart-drawer[open]'));
    this.root.dataset.demoCartOpen = String(cartOpen);

    this.restoreGuideProgress();
    this.updateGuideProgress();
    this.render({ emit: false });
  }

  destroy() {
    this.root?.removeEventListener('click', this.handleClick);
    this.mobileBreakpoint.removeEventListener('change', this.handleViewportChange);
    document.removeEventListener('theme-drawer:open', this.handleThemeDrawerOpen);
    document.removeEventListener('theme-drawer:close', this.handleThemeDrawerClose);
    window.removeEventListener('resize', this.updateToolbarHeight);
    this.toolbarResizeObserver?.disconnect();
  }

  updateToolbarHeight() {
    if (!this.root || !this.toolbar) return;
    const height = Math.ceil(this.toolbar.getBoundingClientRect().height);
    this.root.style.setProperty('--gpf-demo-toolbar-height', `${height}px`);
  }

  /** @param {CustomEvent} event */
  handleThemeDrawerOpen(event) {
    const drawer = event.target instanceof Element
      ? event.target.closest('theme-drawer')
      : null;
    if (drawer?.id !== 'cart-drawer') return;

    this.root.dataset.demoCartOpen = 'true';
  }

  /** @param {CustomEvent} event */
  handleThemeDrawerClose(event) {
    const drawer = event.target instanceof Element
      ? event.target.closest('theme-drawer')
      : null;
    if (drawer?.id !== 'cart-drawer') return;

    this.root.dataset.demoCartOpen = 'false';
  }

  openGuide() {
    this.setState({ guideOpen: true });
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
        if (this.state.guideOpen) {
          this.setState({ guideOpen: false });
        } else {
          this.openGuide();
        }
        break;
      case 'close-guide':
        this.setState({ guideOpen: false });
        break;
      case 'open-guide':
        this.openGuide();
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



// custom search
window.addEventListener('globoFilterSearchDrawerOpened', function () {
    const searchPopup = document.querySelector('#glFilter-search-popup');
    const mainContent = document.querySelector('#MainContent');

    if (!searchPopup || !mainContent) return;

    mainContent.parentNode.insertBefore(searchPopup, mainContent);

});
// custom card product
window.isAjaxCartEnabled = true;

const CART_DRAWER_SECTION_ID = 'cart-drawer-section';
let globoCartSyncQueue = Promise.resolve();

/**
 * Returns the added variant information when Globo includes it in the event.
 * Falls back to the first Ajax cart item because the collection card adds one
 * variant at a time.
 * @param {CustomEvent} event
 * @param {Record<string, any>} cart
 */
function getGloboAddedLine(event, cart) {
  const detail = event.detail && typeof event.detail === 'object' ? event.detail : {};
  const detailItems = Array.isArray(detail.items) ? detail.items : [];
  const candidates = [
    detail.item,
    detail.data?.item,
    detail.data,
    ...detailItems,
    detail,
    cart.items?.[0],
  ];
  const item = candidates.find((candidate) => candidate && typeof candidate === 'object') || {};
  const merchandiseId = item.merchandiseId
    ?? item.variant_id
    ?? item.variantId
    ?? item.id
    ?? cart.items?.[0]?.variant_id
    ?? cart.items?.[0]?.id
    ?? '';
  const quantity = Number(item.quantity ?? detail.quantity ?? 1);

  return {
    merchandiseId: String(merchandiseId),
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
  };
}

async function fetchGloboCartState() {
  const cartUrl = `${Theme.routes.cart_url}.js`;
  const sectionUrl = new URL(window.location.href);
  sectionUrl.searchParams.set('section_id', CART_DRAWER_SECTION_ID);
  sectionUrl.searchParams.sort();

  const [cartResponse, sectionResponse] = await Promise.all([
    fetch(cartUrl, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
    }),
    fetch(sectionUrl, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'same-origin',
      cache: 'no-store',
    }),
  ]);

  if (!cartResponse.ok) {
    throw new Error(`Failed to refresh cart: ${cartResponse.status}`);
  }
  if (!sectionResponse.ok) {
    throw new Error(`Failed to refresh cart drawer: ${sectionResponse.status}`);
  }

  const [cart, cartDrawerHTML] = await Promise.all([
    cartResponse.json(),
    sectionResponse.text(),
  ]);

  return { cart, cartDrawerHTML };
}

/** @param {CustomEvent} event */
async function syncGloboCartWithTheme(event) {
  const { cart, cartDrawerHTML } = await fetchGloboCartState();
  const deferredEvent = CartLinesUpdateEvent.createPromise();
  const addedLine = getGloboAddedLine(event, cart);

  document.dispatchEvent(
    new CartLinesUpdateEvent({
      action: 'add',
      context: 'product',
      lines: [addedLine],
      promise: deferredEvent.promise,
      detail: {
        source: 'globo-filter-product-card',
      },
    })
  );

  deferredEvent.resolve({
    cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart),
    detail: {
      items: cart.items,
      itemCount: cart.item_count,
      sections: {
        [CART_DRAWER_SECTION_ID]: cartDrawerHTML,
      },
      source: 'globo-filter-product-card',
      didError: false,
    },
  });
}

document.addEventListener('cart:added', function (event) {
  const syncTask = globoCartSyncQueue.then(() => syncGloboCartWithTheme(event));

  globoCartSyncQueue = syncTask.catch((error) => {
    console.error('[globo-demo] Unable to synchronize the cart UI.', error);
  });
});

const pendingQuickViewAdds = new WeakSet();

/**
 * Finds the form and modal for Globo's dynamically rendered quick view.
 * @param {Element} element
 */
function getGloboQuickViewContext(element) {
  const modal = element.closest('#gfqv-modal');
  if (!modal) return null;

  const form = element.closest('form')
    || modal.querySelector('form[action*="/cart/add"]')
    || modal.querySelector('form');

  return { modal, form };
}

/**
 * Creates an Ajax cart payload while preserving variant, quantity, selling
 * plan and line-item properties from the quick-view form.
 * @param {Element} modal
 * @param {HTMLFormElement | null} form
 */
function createGloboQuickViewFormData(modal, form) {
  const formData = form ? new FormData(form) : new FormData();
  const variantControl = modal.querySelector('[name="id"]');
  const quantityControl = modal.querySelector('[name="quantity"]');

  if (!formData.get('id') && variantControl instanceof HTMLInputElement) {
    formData.set('id', variantControl.value);
  } else if (!formData.get('id') && variantControl instanceof HTMLSelectElement) {
    formData.set('id', variantControl.value);
  }

  if (!formData.get('quantity')) {
    const quantity = quantityControl instanceof HTMLInputElement ? quantityControl.value : '1';
    formData.set('quantity', quantity || '1');
  }

  return formData;
}

/** @param {Element} modal */
function closeGloboQuickView(modal) {
  const closeButton = modal.querySelector('.gfqv-close-modal');
  if (closeButton instanceof HTMLElement) closeButton.click();
}

/**
 * Adds the selected quick-view variant without allowing the app's native form
 * submission to navigate to the cart page.
 * @param {Element} modal
 * @param {HTMLFormElement | null} form
 * @param {Element | null} trigger
 */
async function addGloboQuickViewToCart(modal, form, trigger) {
  const requestRoot = form || modal;
  if (pendingQuickViewAdds.has(requestRoot)) return;

  const formData = createGloboQuickViewFormData(modal, form);
  if (!formData.get('id')) {
    document.dispatchEvent(
      new CartErrorEvent({
        error: 'Please select a product variant.',
        code: 'INVALID',
      })
    );
    return;
  }

  const button = trigger?.matches('button, input')
    ? trigger
    : trigger?.querySelector('button, input[type="submit"]') || modal.querySelector('#gfqv-btn');

  pendingQuickViewAdds.add(requestRoot);
  trigger?.setAttribute('aria-busy', 'true');
  if (button instanceof HTMLButtonElement || button instanceof HTMLInputElement) {
    button.disabled = true;
    button.classList.add('gpf-demo-add-to-cart--loading');
    button.setAttribute('aria-busy', 'true');
  }

  try {
    const response = await fetch(Theme.routes.cart_add_url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: formData,
      credentials: 'same-origin',
    });
    const addedItem = await response.json();

    if (!response.ok || addedItem.status) {
      throw new Error(addedItem.description || addedItem.message || 'Unable to add this item to the cart.');
    }

    closeGloboQuickView(modal);
    document.dispatchEvent(
      new CustomEvent('cart:added', {
        detail: {
          item: addedItem,
          source: 'globo-quick-view',
        },
      })
    );
  } catch (error) {
    console.error('[globo-demo] Quick-view add to cart failed.', error);
    document.dispatchEvent(
      new CartErrorEvent({
        error: error instanceof Error ? error.message : 'Unable to add this item to the cart.',
        code: 'INVALID',
      })
    );
  } finally {
    pendingQuickViewAdds.delete(requestRoot);
    trigger?.removeAttribute('aria-busy');
    if (button instanceof HTMLButtonElement || button instanceof HTMLInputElement) {
      button.disabled = false;
      button.classList.remove('gpf-demo-add-to-cart--loading');
      button.removeAttribute('aria-busy');
    }
  }
}

document.addEventListener('click', function (event) {
  const trigger = event.target instanceof Element
    ? event.target.closest('#gfqv-btn-wrap, #gfqv-btn')
    : null;
  if (!trigger) return;

  const context = getGloboQuickViewContext(trigger);
  if (!context) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  addGloboQuickViewToCart(context.modal, context.form, trigger);
}, true);

document.addEventListener('submit', function (event) {
  const form = event.target instanceof HTMLFormElement ? event.target : null;
  if (!form || !form.closest('#gfqv-modal')) return;
  if (!form.querySelector('#gfqv-btn-wrap, #gfqv-btn') && !form.matches('[action*="/cart/add"]')) return;

  const context = getGloboQuickViewContext(form);
  if (!context) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  addGloboQuickViewToCart(context.modal, context.form, form.querySelector('#gfqv-btn-wrap, #gfqv-btn'));
}, true);

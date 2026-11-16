/**
 * Mermaid diagrams in the diff viewer page: an Image/Code toggle shared by
 * both sides, lazy drawing of each side's diagram, and a zoom viewport.
 * Only pages with ```mermaid fences include this CSS and script.
 *
 * The zoom viewport is adapted from openknowledge-sh/openknowledge#16.
 */

/** Pinned build; loaded only when a diagram is first shown as an image */
export const MERMAID_URL = "https://cdn.jsdelivr.net/npm/mermaid@12.2.0/dist/mermaid.min.js";

export const MERMAID_CSS = `
  .mermaid-view-toggle {
    display: flex;
    border: 1px solid var(--md-border);
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .mermaid-view-toggle button {
    background: none;
    border: 0;
    padding: 4px 10px;
    font: inherit;
    font-size: 12px;
    color: var(--md-text-muted);
    cursor: pointer;
  }
  .mermaid-view-toggle button + button { border-left: 1px solid var(--md-border); }
  .mermaid-view-toggle button[aria-pressed="true"] { background: var(--md-bg-alt); color: var(--md-text); }
  .mermaid-view-toggle button:hover { color: var(--md-text); }

  html[data-mermaid-view="image"] .mermaid-block:not([data-mermaid-state="error"]) .mermaid-code,
  html[data-mermaid-view="code"] .mermaid-image { display: none; }

  .mermaid-image {
    position: relative;
    margin: 0.5em 0;
    padding: 12px;
    border: 1px solid var(--md-border);
    border-radius: 6px;
    background: var(--md-bg-alt);
    overflow: auto;
  }
  .mermaid-image:empty::before { content: "Drawing diagram…"; color: var(--md-text-muted); font-size: 12px; }
  .mermaid-image svg { display: block; width: 100%; max-width: 100%; height: auto; margin: 0 auto; }
  .mermaid-image[role="button"] { cursor: zoom-in; }
  .mermaid-image[role="button"]::after {
    content: "Zoom";
    position: absolute;
    top: 6px;
    right: 6px;
    padding: 3px 7px;
    border: 1px solid var(--md-border);
    border-radius: 5px;
    background: var(--md-bg);
    color: var(--md-text-muted);
    font-size: 11px;
    pointer-events: none;
  }
  .mermaid-image[role="button"]:hover { border-color: var(--md-text-muted); }
  .mermaid-image[role="button"]:focus-visible { outline: 2px solid var(--md-link); outline-offset: 2px; }
  .mermaid-error {
    color: var(--md-del-text);
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    white-space: pre-wrap;
  }

  .mermaid-viewport {
    position: fixed;
    inset: 0;
    width: 100vw;
    max-width: none;
    height: 100vh;
    max-height: none;
    margin: 0;
    padding: 0;
    overflow: hidden;
    border: 0;
    background: var(--md-bg);
    color: var(--md-text);
  }
  .mermaid-viewport[open] { display: flex; flex-direction: column; }
  .mermaid-viewport::backdrop { background: rgba(0, 0, 0, 0.72); }
  .mermaid-viewport-toolbar {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 9px 12px;
    border-bottom: 1px solid var(--md-border);
    background: var(--md-bg-alt);
  }
  .mermaid-viewport-toolbar button {
    min-width: 34px;
    height: 30px;
    padding: 0 10px;
    border: 1px solid var(--md-border);
    border-radius: 6px;
    background: var(--md-bg);
    color: var(--md-text);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .mermaid-viewport-toolbar button:hover { border-color: var(--md-text-muted); }
  .mermaid-viewport-toolbar button:focus-visible,
  .mermaid-viewport-canvas:focus-visible { outline: 2px solid var(--md-link); outline-offset: 2px; }
  .mermaid-viewport-title { color: var(--md-text-muted); font-size: 12px; }
  .mermaid-viewport-zoom {
    min-width: 48px;
    color: var(--md-text-muted);
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    text-align: center;
  }
  .mermaid-viewport-toolbar [data-action="close"] { margin-left: auto; }
  .mermaid-viewport-canvas {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .mermaid-viewport-canvas[data-panning] { cursor: grabbing; }
  .mermaid-viewport-stage { position: absolute; top: 0; left: 0; transform-origin: 0 0; will-change: transform; }
  .mermaid-viewport-stage svg { display: block; width: 100%; max-width: none; height: 100%; pointer-events: none; }
`;

export const MERMAID_SCRIPT = `
(function() {
  const html = document.documentElement;
  const STORAGE_KEY = 'md-diff-mermaid-view';
  const toggle = document.getElementById('mermaidViewToggle');
  const blocks = document.querySelectorAll('.mermaid-block');

  // The page re-aligns both sides and redraws the minimap on this event
  function layoutChanged() {
    document.dispatchEvent(new CustomEvent('blocksresize'));
  }

  // ── Image/Code view: one setting for the page, so both sides switch together
  function setView(view) {
    html.setAttribute('data-mermaid-view', view);
    localStorage.setItem(STORAGE_KEY, view);
    toggle.querySelectorAll('button[data-view]').forEach(b => {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === view));
    });
    layoutChanged();
    drawVisible();
  }

  toggle.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-view]');
    if (button) setView(button.getAttribute('data-view'));
  });

  // ── Loading mermaid (only once a diagram is shown as an image)
  let loading = null;
  function loadMermaid() {
    if (!loading) {
      loading = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '${MERMAID_URL}';
        script.onload = () => window.mermaid ? resolve(window.mermaid) : reject(new Error('Mermaid did not load'));
        script.onerror = () => reject(new Error('Could not load Mermaid from ' + new URL(script.src).host));
        document.head.appendChild(script);
      });
    }
    return loading;
  }

  function mermaidTheme() {
    return html.getAttribute('data-theme') === 'dark' ? 'dark' : 'default';
  }

  // ── Drawing: one diagram at a time, as Mermaid expects
  let queue = Promise.resolve();
  let renderCount = 0;
  let initializedTheme = null;

  function enqueue(block) {
    block.setAttribute('data-mermaid-state', 'queued');
    queue = queue.then(() => draw(block));
  }

  async function draw(block) {
    const slot = block.querySelector('.mermaid-image');
    const source = block.getAttribute('data-mermaid-source');
    const id = 'md-diff-mermaid-' + (++renderCount);
    try {
      const mermaid = await loadMermaid();
      const theme = mermaidTheme();
      if (initializedTheme !== theme) {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme });
        initializedTheme = theme;
      }
      await mermaid.parse(source);
      const result = await mermaid.render(id, source);
      slot.innerHTML = result.svg;
      if (result.bindFunctions) result.bindFunctions(slot);
      block.setAttribute('data-mermaid-state', 'rendered');
      bindViewport(slot);
    } catch (err) {
      const leftover = document.getElementById('d' + id);
      if (leftover) leftover.remove();
      const message = document.createElement('div');
      message.className = 'mermaid-error';
      message.textContent = (err && err.message) || String(err);
      slot.replaceChildren(message);
      unbindViewport(slot);
      block.setAttribute('data-mermaid-state', 'error');
    }
    layoutChanged();
  }

  // Draw the diagrams of the shown diff container: the active file at the
  // active matching level. Switching either changes their display style.
  const containers = Array.from(document.querySelectorAll('.diff-container'))
    .filter(container => container.querySelector('.mermaid-block'));

  function drawVisible() {
    if (html.getAttribute('data-mermaid-view') !== 'image') return;
    containers.forEach(container => {
      if (container.getClientRects().length === 0) return;
      container.querySelectorAll('.mermaid-block:not([data-mermaid-state])').forEach(enqueue);
    });
  }

  const shown = new MutationObserver(drawVisible);
  containers.forEach(container => {
    shown.observe(container, { attributes: true, attributeFilter: ['style'] });
    shown.observe(container.closest('.file-diff'), { attributes: true, attributeFilter: ['style'] });
  });

  // Redraw in the new theme's colors
  new MutationObserver(() => {
    if (initializedTheme === null || initializedTheme === mermaidTheme()) return;
    closeViewport();
    blocks.forEach(block => {
      if (block.getAttribute('data-mermaid-state') !== 'queued') block.removeAttribute('data-mermaid-state');
    });
    drawVisible();
  }).observe(html, { attributes: true, attributeFilter: ['data-theme'] });

  // ── Zoom viewport: one dialog, opened on the clicked diagram
  const MIN_SCALE = 0.01;
  const MAX_SCALE = 8;
  let viewport = null;

  function sideLabel(slot) {
    return slot.closest('.left-pane') ? 'Left diagram' : 'Right diagram';
  }

  function openFrom(slot) {
    (viewport || (viewport = createViewport())).open(slot);
  }

  function onSlotClick(e) {
    if (!e.target.closest('a')) openFrom(e.currentTarget);
  }

  function onSlotKey(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openFrom(e.currentTarget);
    }
  }

  function bindViewport(slot) {
    if (slot.hasAttribute('data-zoom-bound')) return;
    slot.setAttribute('data-zoom-bound', '');
    slot.tabIndex = 0;
    slot.setAttribute('role', 'button');
    slot.setAttribute('aria-haspopup', 'dialog');
    slot.setAttribute('aria-label', 'Zoom ' + sideLabel(slot).toLowerCase());
    slot.setAttribute('title', 'Zoom diagram');
    slot.addEventListener('click', onSlotClick);
    slot.addEventListener('keydown', onSlotKey);
  }

  function unbindViewport(slot) {
    if (!slot.hasAttribute('data-zoom-bound')) return;
    ['data-zoom-bound', 'tabindex', 'role', 'aria-haspopup', 'aria-label', 'title'].forEach(a => slot.removeAttribute(a));
    slot.removeEventListener('click', onSlotClick);
    slot.removeEventListener('keydown', onSlotKey);
  }

  function closeViewport() {
    if (viewport) viewport.close();
  }

  function createViewport() {
    const dialog = document.createElement('dialog');
    dialog.className = 'mermaid-viewport';
    const toolbar = document.createElement('div');
    toolbar.className = 'mermaid-viewport-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Diagram zoom controls');
    const title = document.createElement('span');
    title.className = 'mermaid-viewport-title';
    const zoom = document.createElement('output');
    zoom.className = 'mermaid-viewport-zoom';
    zoom.setAttribute('aria-label', 'Diagram zoom');
    zoom.setAttribute('aria-live', 'polite');
    function button(text, label, action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.setAttribute('data-action', action);
      b.setAttribute('aria-label', label);
      b.setAttribute('title', label);
      toolbar.appendChild(b);
      return b;
    }
    toolbar.appendChild(title);
    const zoomOut = button('−', 'Zoom out', 'zoom-out');
    const zoomIn = button('+', 'Zoom in', 'zoom-in');
    const actual = button('100%', 'Show diagram at 100%', 'actual');
    const fitButton = button('Fit', 'Fit diagram to window', 'fit');
    toolbar.appendChild(zoom);
    const closeButton = button('Close', 'Close diagram viewer', 'close');
    const canvas = document.createElement('div');
    canvas.className = 'mermaid-viewport-canvas';
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Diagram canvas. Drag to pan.');
    const stage = document.createElement('div');
    stage.className = 'mermaid-viewport-stage';
    canvas.appendChild(stage);
    dialog.append(toolbar, canvas);
    document.body.appendChild(dialog);

    const state = { fit: true, width: 1, height: 1, scale: 1, x: 0, y: 0, original: null, trigger: null,
      pointers: new Map(), pinch: null };

    function update() {
      stage.style.width = state.width + 'px';
      stage.style.height = state.height + 'px';
      stage.style.transform = 'translate3d(' + rounded(state.x) + 'px, ' + rounded(state.y) + 'px, 0) scale(' +
        rounded(state.scale) + ')';
      zoom.textContent = Math.round(state.scale * 100) + '%';
    }

    function fit() {
      const bounds = canvas.getBoundingClientRect();
      const availableWidth = Math.max(1, bounds.width - 48);
      const availableHeight = Math.max(1, bounds.height - 48);
      state.scale = clamp(Math.min(availableWidth / state.width, availableHeight / state.height));
      state.x = (bounds.width - state.width * state.scale) / 2;
      state.y = (bounds.height - state.height * state.scale) / 2;
      state.fit = true;
      update();
    }

    function actualSize() {
      const bounds = canvas.getBoundingClientRect();
      state.scale = 1;
      state.x = (bounds.width - state.width) / 2;
      state.y = (bounds.height - state.height) / 2;
      state.fit = false;
      update();
    }

    function zoomAt(multiplier, clientX, clientY) {
      const nextScale = clamp(state.scale * multiplier);
      const bounds = canvas.getBoundingClientRect();
      const pointX = clientX === undefined ? bounds.width / 2 : clientX - bounds.left;
      const pointY = clientY === undefined ? bounds.height / 2 : clientY - bounds.top;
      const ratio = nextScale / state.scale;
      state.x = pointX - (pointX - state.x) * ratio;
      state.y = pointY - (pointY - state.y) * ratio;
      state.scale = nextScale;
      state.fit = false;
      update();
    }

    // Put the diagram back where it was and return focus to it
    function restore() {
      if (!state.original) return;
      state.original.parent.insertBefore(state.original.svg, state.original.next);
      state.original = null;
      state.pinch = null;
      state.pointers.clear();
      canvas.removeAttribute('data-panning');
      const trigger = state.trigger;
      state.trigger = null;
      if (trigger && trigger.isConnected) trigger.focus();
    }

    function close() {
      if (dialog.open) dialog.close();
    }

    function open(slot) {
      const svg = slot.querySelector('svg');
      if (!svg) return;
      close();
      const size = diagramSize(svg);
      state.width = size.width;
      state.height = size.height;
      state.trigger = slot;
      state.original = { svg, parent: svg.parentNode, next: svg.nextSibling };
      title.textContent = sideLabel(slot);
      dialog.setAttribute('aria-label', sideLabel(slot));
      stage.appendChild(svg);
      dialog.showModal();
      fit();
      canvas.focus();
    }

    zoomOut.addEventListener('click', () => zoomAt(0.8));
    zoomIn.addEventListener('click', () => zoomAt(1.25));
    actual.addEventListener('click', actualSize);
    fitButton.addEventListener('click', fit);
    closeButton.addEventListener('click', close);
    dialog.addEventListener('close', restore);
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });
    dialog.addEventListener('keydown', (e) => {
      // Keep the page's own shortcuts (file switching) out of the viewer
      e.stopPropagation();
      if (e.target.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
      const key = e.key.toLowerCase();
      if (key === '+' || key === '=') zoomAt(1.25);
      else if (key === '-') zoomAt(0.8);
      else if (key === '0') actualSize();
      else if (key === 'f') fit();
      else if (key === 'escape') close();
      else if (key.startsWith('arrow')) {
        state.x += key === 'arrowleft' ? -40 : key === 'arrowright' ? 40 : 0;
        state.y += key === 'arrowup' ? -40 : key === 'arrowdown' ? 40 : 0;
        state.fit = false;
        update();
      } else return;
      e.preventDefault();
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
    }, { passive: false });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      state.pinch = pinchSnapshot(state.pointers);
      state.fit = false;
      canvas.setAttribute('data-panning', '');
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      const previous = state.pointers.get(e.pointerId);
      if (!previous) return;
      state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (state.pointers.size > 1) {
        const nextPinch = pinchSnapshot(state.pointers);
        if (state.pinch && nextPinch && state.pinch.distance > 0) {
          zoomAt(nextPinch.distance / state.pinch.distance, state.pinch.x, state.pinch.y);
          state.x += nextPinch.x - state.pinch.x;
          state.y += nextPinch.y - state.pinch.y;
        }
        state.pinch = nextPinch;
      } else {
        state.x += e.clientX - previous.x;
        state.y += e.clientY - previous.y;
      }
      update();
    });
    function endPan(e) {
      if (!state.pointers.has(e.pointerId)) return;
      state.pointers.delete(e.pointerId);
      state.pinch = pinchSnapshot(state.pointers);
      if (!state.pointers.size) canvas.removeAttribute('data-panning');
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    }
    canvas.addEventListener('pointerup', endPan);
    canvas.addEventListener('pointercancel', endPan);
    window.addEventListener('resize', () => {
      if (dialog.open && state.fit) fit();
    });

    return { open, close };
  }

  function diagramSize(svg) {
    const viewBox = svg.viewBox && svg.viewBox.baseVal;
    const bounds = svg.getBoundingClientRect();
    return {
      width: positive(viewBox && viewBox.width) || positive(bounds.width) || 1,
      height: positive(viewBox && viewBox.height) || positive(bounds.height) || 1,
    };
  }

  function positive(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function clamp(value) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
  }

  function rounded(value) {
    return Math.round(value * 1000) / 1000;
  }

  function pinchSnapshot(pointers) {
    if (pointers.size < 2) return null;
    const [first, second] = Array.from(pointers.values());
    return {
      distance: Math.hypot(second.x - first.x, second.y - first.y),
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    };
  }

  setView(localStorage.getItem(STORAGE_KEY) === 'code' ? 'code' : 'image');
})();
`;

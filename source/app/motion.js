(function () {
  function updateTabs() {
    const tabs = document.querySelector('.solo-tabs'), active = tabs && tabs.querySelector('.solo-tab.on');
    if (!active) return;
    const rect = active.getBoundingClientRect(), base = tabs.getBoundingClientRect();
    tabs.style.setProperty('--tab-x', (rect.left - base.left - 1) + 'px');
    tabs.style.setProperty('--tab-y', (rect.top - base.top - 1) + 'px');
    tabs.style.setProperty('--tab-width', rect.width + 'px');
    tabs.style.setProperty('--tab-height', rect.height + 'px');
  }
  window.SoloMotion = { updateTabs };
  window.addEventListener('resize', updateTabs, { passive: true });
  const reduced = () => document.documentElement.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.addEventListener('pointerdown', event => {
    const target = event.target.closest('button');
    if (!target || target.disabled || reduced()) return;
    // Animate a separate halo so map dragging and button transforms remain independent.
    const rect = target.getBoundingClientRect();
    const halo = document.createElement('span');
    halo.className = 'solo-click-halo';
    Object.assign(halo.style, { left: (event.clientX || rect.left + rect.width / 2) + 'px', top: (event.clientY || rect.top + rect.height / 2) + 'px' });
    document.body.appendChild(halo);
    const animation = halo.animate([{ opacity: .35, transform: 'translate(-50%,-50%) scale(.2)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.5)' }], { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' });
    animation.onfinish = () => halo.remove();
    setTimeout(() => halo.remove(), 600);
  }, { passive: true });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { const tip = document.getElementById('solo-detail-tip'); if (tip) tip.style.display = 'none'; } });
})();

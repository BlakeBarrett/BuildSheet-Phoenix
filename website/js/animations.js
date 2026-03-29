/* ============================================
   BuildSheet Marketing — Scroll Animations
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  initScrollAnimations();
  initParallaxShapes();
});

/* ── IntersectionObserver Scroll Reveals ─────── */
function initScrollAnimations() {
  const elements = document.querySelectorAll(
    '.animate-on-scroll, .animate-on-scroll--left, .animate-on-scroll--right, .animate-on-scroll--scale'
  );

  if (!elements.length) return;

  // Check for reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    elements.forEach(el => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        // Once visible, stop observing to save resources
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -60px 0px'
  });

  elements.forEach(el => observer.observe(el));
}

/* ── Parallax for Hero Shapes ───────────────── */
function initParallaxShapes() {
  const shapes = document.querySelectorAll('.hero__shape');
  if (!shapes.length) return;

  // Check for reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let ticking = false;

  document.addEventListener('mousemove', (e) => {
    if (ticking) return;

    ticking = true;
    requestAnimationFrame(() => {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const deltaX = (e.clientX - centerX) / centerX;
      const deltaY = (e.clientY - centerY) / centerY;

      shapes.forEach((shape, index) => {
        const depth = (index + 1) * 8;
        const rotation = shape.style.transform.match(/rotate\([^)]+\)/)?.[0] || '';
        shape.style.transform = `translate(${deltaX * depth}px, ${deltaY * depth}px) ${rotation}`;
      });

      ticking = false;
    });
  });
}

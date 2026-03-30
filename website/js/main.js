/* ============================================
   BuildSheet Marketing — Main JS
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initNavbar();
  initSmoothScroll();
  initActiveNavHighlight();
  initNewsletterSubscribe();
  initContactSalesModal();
});

/* ── Theme Toggle ───────────────────────────── */
function initThemeToggle() {
  const toggle = document.getElementById('theme-toggle');
  const mobileToggle = document.getElementById('theme-toggle-mobile');
  if (!toggle) return;

  // Check saved preference or system preference
  const saved = localStorage.getItem('buildsheet-theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    document.documentElement.setAttribute('data-theme', 'light');
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('buildsheet-theme', next);
  }

  toggle.addEventListener('click', toggleTheme);
  if (mobileToggle) {
    mobileToggle.addEventListener('click', toggleTheme);
  }

  // Listen for system preference changes
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
    if (!localStorage.getItem('buildsheet-theme')) {
      document.documentElement.setAttribute('data-theme', e.matches ? 'light' : 'dark');
    }
  });
}

/* ── Navbar ──────────────────────────────────── */
function initNavbar() {
  const navbar = document.querySelector('.navbar');
  const hamburger = document.getElementById('nav-hamburger');
  const mobileMenu = document.getElementById('mobile-menu');

  if (!navbar) return;

  // Scroll effect
  let lastScroll = 0;
  const scrollThreshold = 50;

  function handleScroll() {
    const currentScroll = window.scrollY;

    if (currentScroll > scrollThreshold) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }

    lastScroll = currentScroll;
  }

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll(); // Initial check

  // Mobile hamburger
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      mobileMenu.classList.toggle('open');
      document.body.style.overflow = mobileMenu.classList.contains('open') ? 'hidden' : '';
    });

    // Close mobile menu when clicking a link
    mobileMenu.querySelectorAll('.navbar__link').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        mobileMenu.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }
}

/* ── Smooth Scroll ──────────────────────────── */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId === '#') return;

      const target = document.querySelector(targetId);
      if (!target) return;

      e.preventDefault();

      const navbarHeight = document.querySelector('.navbar')?.offsetHeight || 0;
      const targetPosition = target.getBoundingClientRect().top + window.scrollY - navbarHeight - 20;

      window.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
      });
    });
  });
}

/* ── Active Nav Link Highlighting ───────────── */
function initActiveNavHighlight() {
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.navbar__link[href^="#"]');

  if (!sections.length || !navLinks.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navLinks.forEach(link => {
          link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
        });
      }
    });
  }, {
    rootMargin: '-20% 0px -60% 0px',
    threshold: 0
  });

  sections.forEach(section => observer.observe(section));
}

/* ── Newsletter Subscribe ───────────────────── */
function initNewsletterSubscribe() {
  const input = document.getElementById('newsletter-email-input');
  const btn = document.getElementById('newsletter-subscribe-btn');
  if (!input || !btn) return;

  btn.addEventListener('click', async () => {
    const email = input.value.trim();
    if (!email || !email.includes('@')) {
      input.focus();
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Subscribing…';

    try {
      if (window._bsForms) {
        await window._bsForms.submitNewsletterSubscription(email);
      }
      btn.textContent = 'Thank you!';
      input.value = '';
    } catch (err) {
      console.error('Newsletter subscribe error:', err);
      btn.textContent = 'Error – try again';
      btn.disabled = false;
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btn.click();
  });
}

/* ── Contact Sales Modal ────────────────────── */
function initContactSalesModal() {
  const openBtn = document.getElementById('contact-sales-btn');
  const modal = document.getElementById('contact-sales-modal');
  if (!openBtn || !modal) return;

  const backdrop = modal.querySelector('.modal-overlay__backdrop');
  const closeBtn = document.getElementById('cs-modal-close');
  const form = document.getElementById('cs-form');
  const submitBtn = document.getElementById('cs-submit');
  const errorEl = document.getElementById('cs-error');
  const successEl = document.getElementById('cs-success');

  function openModal() {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    document.getElementById('cs-name')?.focus();
  }

  function closeModal() {
    modal.style.display = 'none';
    document.body.style.overflow = '';
    errorEl.style.display = 'none';
  }

  openBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);

  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';

    const name = document.getElementById('cs-name').value.trim();
    const email = document.getElementById('cs-email').value.trim();
    const company = document.getElementById('cs-company').value.trim();
    const message = document.getElementById('cs-message').value.trim();

    if (!name || !email) {
      errorEl.textContent = 'Name and email are required.';
      errorEl.style.display = 'block';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    try {
      if (window._bsForms) {
        await window._bsForms.submitContactSalesInquiry({ name, email, company, message });
      }
      form.style.display = 'none';
      successEl.style.display = 'block';
      setTimeout(closeModal, 3000);
    } catch (err) {
      console.error('Contact sales error:', err);
      errorEl.textContent = 'Something went wrong. Please try again.';
      errorEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Message';
    }
  });
}

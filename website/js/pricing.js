/* ============================================
   BuildSheet Marketing — Pricing Toggle & FAQ
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  initPricingToggle();
  initFaqAccordion();
});

/* ── Monthly / Annual Pricing Toggle ────────── */
function initPricingToggle() {
  const toggle = document.getElementById('billing-toggle');
  const monthlyLabel = document.getElementById('billing-monthly');
  const annualLabel = document.getElementById('billing-annual');
  const saveBadge = document.getElementById('save-badge');

  if (!toggle) return;

  let isAnnual = false;

  const prices = {
    free:  { monthly: 'Free',   annual: 'Free' },
    pro:   { monthly: '$19',    annual: '$15' },
    team:  { monthly: '$49',    annual: '$39' },
  };

  const periods = {
    free:  { monthly: 'forever', annual: 'forever' },
    pro:   { monthly: '/mo',     annual: '/mo' },
    team:  { monthly: '/user/mo', annual: '/user/mo' },
  };

  function updatePrices() {
    const type = isAnnual ? 'annual' : 'monthly';

    Object.keys(prices).forEach(tier => {
      const amountEl = document.getElementById(`price-${tier}`);
      const periodEl = document.getElementById(`period-${tier}`);

      if (amountEl) {
        amountEl.style.opacity = '0';
        amountEl.style.transform = 'translateY(-10px)';

        setTimeout(() => {
          amountEl.textContent = prices[tier][type];
          amountEl.style.opacity = '1';
          amountEl.style.transform = 'translateY(0)';
        }, 150);
      }

      if (periodEl) {
        periodEl.textContent = periods[tier][type];
      }
    });

    // Update billing note
    const annualNotes = document.querySelectorAll('.pricing-card__annual-note');
    annualNotes.forEach(note => {
      note.style.display = isAnnual ? 'block' : 'none';
    });
  }

  toggle.addEventListener('click', () => {
    isAnnual = !isAnnual;
    toggle.classList.toggle('annual', isAnnual);

    if (monthlyLabel) monthlyLabel.classList.toggle('active', !isAnnual);
    if (annualLabel) annualLabel.classList.toggle('active', isAnnual);
    if (saveBadge) saveBadge.style.opacity = isAnnual ? '1' : '0.5';

    updatePrices();
  });
}

/* ── FAQ Accordion ──────────────────────────── */
function initFaqAccordion() {
  const items = document.querySelectorAll('.accordion__item');

  items.forEach(item => {
    const header = item.querySelector('.accordion__header');

    header.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');

      // Close all other items (single-open mode)
      items.forEach(otherItem => {
        if (otherItem !== item) {
          otherItem.classList.remove('open');
        }
      });

      // Toggle current
      item.classList.toggle('open', !isOpen);
    });

    // Keyboard support
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        header.click();
      }
    });
  });
}

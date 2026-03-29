/* ============================================
   BuildSheet Marketing — Testimonial Carousel
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  initCarousel();
});

function initCarousel() {
  const track = document.querySelector('.carousel__track');
  const dots = document.querySelectorAll('.carousel__dot');
  const slides = document.querySelectorAll('.carousel__slide');

  if (!track || !slides.length) return;

  let currentIndex = 0;
  let autoplayInterval;
  const totalSlides = slides.length;
  const autoplayDelay = 5000;

  function goToSlide(index) {
    if (index < 0) index = totalSlides - 1;
    if (index >= totalSlides) index = 0;

    currentIndex = index;
    track.style.transform = `translateX(-${currentIndex * 100}%)`;

    // Update dots
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === currentIndex);
    });
  }

  function nextSlide() {
    goToSlide(currentIndex + 1);
  }

  // Dot click navigation
  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      goToSlide(index);
      resetAutoplay();
    });
  });

  // Autoplay
  function startAutoplay() {
    autoplayInterval = setInterval(nextSlide, autoplayDelay);
  }

  function stopAutoplay() {
    clearInterval(autoplayInterval);
  }

  function resetAutoplay() {
    stopAutoplay();
    startAutoplay();
  }

  // Pause on hover
  const carousel = document.querySelector('.carousel');
  if (carousel) {
    carousel.addEventListener('mouseenter', stopAutoplay);
    carousel.addEventListener('mouseleave', startAutoplay);
  }

  // Touch / swipe support
  let touchStartX = 0;
  let touchEndX = 0;
  const minSwipeDistance = 50;

  track.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    stopAutoplay();
  }, { passive: true });

  track.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
    startAutoplay();
  }, { passive: true });

  function handleSwipe() {
    const distance = touchStartX - touchEndX;
    if (Math.abs(distance) < minSwipeDistance) return;

    if (distance > 0) {
      goToSlide(currentIndex + 1);
    } else {
      goToSlide(currentIndex - 1);
    }
  }

  // Keyboard navigation when focused
  if (carousel) {
    carousel.setAttribute('tabindex', '0');
    carousel.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') {
        goToSlide(currentIndex + 1);
        resetAutoplay();
      } else if (e.key === 'ArrowLeft') {
        goToSlide(currentIndex - 1);
        resetAutoplay();
      }
    });
  }

  // Pause autoplay when page is hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAutoplay();
    } else {
      startAutoplay();
    }
  });

  // Initialize
  goToSlide(0);
  startAutoplay();
}

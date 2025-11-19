import { useEffect } from 'react';

export function useScrollReveal(selector: string = '.reveal') {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll(selector));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target as HTMLElement;
          if (entry.isIntersecting) {
            el.classList.add('opacity-100');
            el.classList.remove('opacity-0');
            el.classList.remove('translate-y-4');
          }
        });
      },
      { threshold: 0.1 }
    );
    elements.forEach((el) => {
      const h = el as HTMLElement;
      h.classList.add('opacity-0');
      h.classList.add('translate-y-4');
      h.classList.add('transition-all');
      h.classList.add('duration-500');
      observer.observe(h);
    });
    return () => {
      observer.disconnect();
    };
  }, [selector]);
}
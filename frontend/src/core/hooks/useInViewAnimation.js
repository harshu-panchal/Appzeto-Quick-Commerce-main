import { useRef, useState, useEffect } from "react";

/**
 * useInViewAnimation
 *
 * Returns { ref, isVisible } where isVisible is true when the attached element
 * is intersecting the viewport. Use this to pause off-screen animations.
 */
export function useInViewAnimation() {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: "0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

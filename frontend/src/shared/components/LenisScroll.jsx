import { useEffect } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

const LenisScroll = () => {
    useEffect(() => {
        const lenis = new Lenis({
            duration: 1.2,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            direction: 'vertical',
            gestureDirection: 'vertical',
            smooth: true,
            mouseMultiplier: 1,
            smoothTouch: false,
            touchMultiplier: 2,
            // Allow native scrolling inside nested scroll containers.
            // Add `data-lenis-prevent` to any element that should keep its own scroll.
            prevent: (node) => {
                if (!node || typeof node.closest !== 'function') return false;
                return Boolean(
                    node.closest('[data-lenis-prevent], [data-lenis-prevent-wheel], [data-lenis-prevent-touch]')
                );
            },
        });

        let rafId;

        function raf(time) {
            lenis.raf(time);
            rafId = requestAnimationFrame(raf);
        }

        rafId = requestAnimationFrame(raf);

        return () => {
            cancelAnimationFrame(rafId);
            lenis.destroy();
        };
    }, []);

    return null;
};

export default LenisScroll;

import { useEffect, type RefObject } from "react";
import { gsap } from "gsap";

export const useStaggerReveal = (
    containerRef: RefObject<HTMLElement | null>,
    selector: string,
    yOffset = 24,
): void => {
    useEffect(() => {
        if (!containerRef.current) {
            return;
        }

        const ctx = gsap.context(() => {
            gsap.from(selector, {
                opacity: 0,
                y: yOffset,
                duration: 0.54,
                stagger: 0.06,
                ease: "power3.out",
            });
        }, containerRef);

        return () => ctx.revert();
    }, [containerRef, selector, yOffset]);
};

import { useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";

interface Star {
	x: number;
	y: number;
	r: number;
	base: number;
	amp: number;
	speed: number;
	phase: number;
	drift: number;
}

/**
 * Canvas twinkling starfield.
 * Respects prefers-reduced-motion: when reduced, renders fewer, dimmer,
 * perfectly still stars (no twinkle, no drift, no animation loop).
 */
export const Starfield = () => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const reduce = useReducedMotion();

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		let raf = 0;
		let stars: Star[] = [];
		let w = 0;
		let h = 0;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);

		const seed = () => {
			w = canvas.clientWidth;
			h = canvas.clientHeight;
			canvas.width = w * dpr;
			canvas.height = h * dpr;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			const density = reduce ? 11000 : 5200;
			const count = Math.floor((w * h) / density);
			stars = Array.from({ length: count }).map(() => ({
				x: Math.random() * w,
				y: Math.random() * h,
				r: Math.random() * 1.3 + 0.25,
				base: Math.random() * 0.5 + 0.2,
				amp: Math.random() * 0.5 + 0.3,
				speed: Math.random() * 0.0018 + 0.0004,
				phase: Math.random() * Math.PI * 2,
				drift: Math.random() * 0.02 + 0.004,
			}));
		};

		const drawStatic = () => {
			ctx.clearRect(0, 0, w, h);
			for (const s of stars) {
				ctx.beginPath();
				ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
				ctx.fillStyle = `rgba(255,255,255,${(s.base + 0.15).toFixed(3)})`;
				ctx.fill();
			}
		};

		const render = (t: number) => {
			ctx.clearRect(0, 0, w, h);
			for (const s of stars) {
				const tw =
					s.base + s.amp * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
				ctx.beginPath();
				ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
				ctx.fillStyle = `rgba(255,255,255,${tw.toFixed(3)})`;
				ctx.shadowBlur = s.r > 1 ? 4 : 0;
				ctx.shadowColor = "rgba(180,205,255,0.7)";
				ctx.fill();
				s.y -= s.drift;
				if (s.y < -2) s.y = h + 2;
			}
			raf = requestAnimationFrame(render);
		};

		seed();
		if (reduce) {
			drawStatic();
		} else {
			raf = requestAnimationFrame(render);
		}

		const onResize = () => {
			seed();
			if (reduce) drawStatic();
		};
		window.addEventListener("resize", onResize);
		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("resize", onResize);
		};
	}, [reduce]);

	return (
		<canvas
			ref={canvasRef}
			className="pointer-events-none absolute inset-0 h-full w-full"
			aria-hidden="true"
			tabIndex={-1}
		/>
	);
};

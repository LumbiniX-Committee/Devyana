import {
	GraduationCap,
	Home,
	type LucideIcon,
	Settings2,
	ShieldAlert,
} from "lucide-react";
import { useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";

const FONT = '"Poppins", sans-serif';

interface NavItem {
	path: string;
	label: string;
	icon: LucideIcon;
	lotus?: boolean;
}

const NAV_ITEMS: NavItem[] = [
	{ path: "/app", label: "Home", icon: Home, lotus: true },
	{ path: "/app/negative", label: "Negative", icon: ShieldAlert },
	{ path: "/app/learn", label: "Learn", icon: GraduationCap },
	{ path: "/app/settings", label: "Settings", icon: Settings2 },
];

function LotusIcon({
	size = 22,
	strokeWidth = 2,
	color,
}: {
	size?: number;
	strokeWidth?: number;
	color: string;
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 48 48"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
		>
			<path
				d="M24 5 C 26 17, 31 29, 24 33 C 17 29, 22 17, 24 5 Z"
				stroke={color}
				strokeWidth={strokeWidth}
				fill="none"
			/>
			<path
				d="M24 16 C 25.6 24, 28 30, 24 34 C 20 30, 22.4 24, 24 16 Z"
				stroke={color}
				strokeWidth={strokeWidth}
				fill="none"
			/>
			<circle cx="24" cy="24" r="1.6" fill={color} />
		</svg>
	);
}

export default function AppLayout() {
	const location = useLocation();

	const currentPath = useMemo(() => location.pathname, [location.pathname]);

	return (
		<div
			className="relative min-h-screen w-full"
			style={{ backgroundColor: "var(--page)" }}
		>
			<div
				style={{
					backgroundImage: `url("data:image/svg+xml;base64,${btoa(`
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 48 48">
  <defs>
    <path id="petalOuter" d="M24 5 C 26 17, 31 29, 24 33 C 17 29, 22 17, 24 5 Z"/>
    <path id="petalInner" d="M24 16 C 25.6 24, 28 30, 24 34 C 20 30, 22.4 24, 24 16 Z"/>
  </defs>
  <g fill="none" stroke="#C17A5A" stroke-width="0.6" opacity="0.07">
    ${Array.from({ length: 8 }, (_, i) => `<use href="#petalOuter" transform="rotate(${i * 45} 24 24)"/>`).join("")}
    ${Array.from({ length: 8 }, (_, i) => `<use href="#petalInner" transform="rotate(${i * 45} 24 24)"/>`).join("")}
    <circle cx="24" cy="24" r="1.6" fill="#C17A5A" opacity="0.37"/>
  </g>
</svg>
`).trim()}")`,
					backgroundRepeat: "repeat",
					backgroundAttachment: "fixed",
				}}
			>
				<main
					className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 pb-28 sm:px-6"
					style={{ paddingBottom: "112px" }}
				>
					<Outlet />
				</main>
			</div>

			<nav
				className="fixed bottom-0 left-1/2 z-50 w-full max-w-5xl -translate-x-1/2 px-4 pb-5"
				style={{
					paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))",
				}}
				aria-label="Main navigation"
			>
				<div
					className="flex items-center justify-between gap-1 rounded-3xl border px-2 py-2"
					style={{
						backgroundColor:
							"color-mix(in srgb, var(--surface) 92%, transparent)",
						borderColor: "var(--hairline)",
						backdropFilter: "blur(14px)",
						WebkitBackdropFilter: "blur(14px)",
						boxShadow:
							"0 10px 30px rgba(60, 40, 20, 0.12), 0 2px 8px rgba(60, 40, 20, 0.06)",
					}}
				>
					{NAV_ITEMS.map((item) => {
						const isActive =
							item.path === "/app"
								? currentPath === "/app"
								: currentPath === item.path ||
									currentPath.startsWith(`${item.path}/`);

						return (
							<button
								key={item.path}
								type="button"
								onClick={() => (window.location.href = item.path)}
								className="flex flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-1.5 transition-colors"
								aria-current={isActive ? "page" : undefined}
								aria-label={item.label}
							>
								<span
									className="relative flex h-8 w-12 items-center justify-center rounded-full transition-colors"
									style={{
										backgroundColor: isActive ? "var(--sage)" : "transparent",
									}}
								>
									{item.lotus ? (
										<LotusIcon
											size={20}
											strokeWidth={2.1}
											color={isActive ? "#FFFFFF" : "var(--nav-muted)"}
										/>
									) : (
										<item.icon
											size={20}
											strokeWidth={2.1}
											color={isActive ? "#FFFFFF" : "var(--nav-muted)"}
											aria-hidden="true"
										/>
									)}
								</span>
								<span
									className="text-[0.6rem] leading-none tracking-wide uppercase"
									style={{
										fontFamily: FONT,
										color: isActive ? "var(--ink)" : "var(--muted-ink)",
										fontWeight: isActive ? 600 : 500,
									}}
								>
									{item.label}
								</span>
							</button>
						);
					})}
				</div>
			</nav>
		</div>
	);
}

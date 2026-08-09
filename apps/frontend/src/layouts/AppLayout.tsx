import { Outlet, useLocation } from "react-router-dom";
import { Home, AlertCircle, BookOpen, Settings } from "lucide-react";
import { useMemo } from "react";

const FONT = '"Georgia", "Times New Roman", serif';

interface NavItem {
	path: string;
	label: string;
	icon: typeof Home;
	lotus?: boolean;
}

const NAV_ITEMS: NavItem[] = [
	{ path: "/app", label: "Home", icon: Home, lotus: true },
	{ path: "/app/negative", label: "Negative", icon: AlertCircle },
	{ path: "/app/learn", label: "Learn", icon: BookOpen },
	{ path: "/app/settings", label: "Settings", icon: Settings },
];

function LotusIcon({ size = 22, strokeWidth = 2, color }: { size?: number; strokeWidth?: number; color: string }) {
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
		<div className="relative min-h-screen w-full" style={{ backgroundColor: "#FBF7F0" }}>
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
					className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 pb-24 sm:px-6"
					style={{ paddingBottom: "88px" }}
				>
					<Outlet />
				</main>
			</div>

			<nav
				className="fixed bottom-0 left-1/2 z-50 -translate-x-1/2 w-full max-w-5xl"
				style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
				aria-label="Main navigation"
			>
				<div
					className="flex items-center justify-between gap-1 rounded-t-3xl border px-3 py-2"
					style={{
						backgroundColor: "rgba(251, 247, 240, 0.95)",
						borderColor: "#E0D7C6",
						borderBottomWidth: "0",
						backdropFilter: "blur(8px)",
						boxShadow: "0 -4px 24px rgba(60, 40, 20, 0.08)",
					}}
				>
					{NAV_ITEMS.map((item) => {
						const isActive = currentPath === item.path || (item.path === "/app" && currentPath === "/app");
						const iconColor = isActive ? "#8B9A6E" : "#B0A090";

						return (
							<button
								key={item.path}
								type="button"
								onClick={() => window.location.href = item.path}
								className="flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-1.5 transition-colors"
								style={{
									color: iconColor,
									backgroundColor: isActive ? "rgba(139, 154, 110, 0.1)" : "transparent",
								}}
								aria-current={isActive ? "page" : undefined}
								aria-label={item.label}
							>
								<div className="relative flex h-6 w-6 items-center justify-center">
									{item.lotus ? (
										<LotusIcon size={22} strokeWidth={2.2} color={iconColor} />
									) : (
										<item.icon size={22} strokeWidth={2.2} color={iconColor} aria-hidden="true" />
									)}
									{isActive && (
										<span
											className="absolute -top-1 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full"
											style={{ backgroundColor: "#8B9A6E", boxShadow: "0 0 6px #8B9A6E, 0 0 12px #8B9A6E" }}
											aria-hidden="true"
										/>
									)}
								</div>
								<span
									className="text-[10px] leading-none"
									style={{ fontFamily: FONT, fontWeight: isActive ? 600 : 400 }}
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
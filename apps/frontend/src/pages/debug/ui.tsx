import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/** Minimal dark debug shell — renders consistently regardless of the app's
 *  buddha/onboarding theme, so judges get identical output on every run. */
export function DebugShell({
	title,
	subtitle,
	children,
}: {
	title: string;
	subtitle?: string;
	children: ReactNode;
}) {
	return (
		<div className="min-h-screen w-full bg-neutral-950 px-5 py-8 text-neutral-100">
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
				<header className="flex items-center justify-between gap-3">
					<div>
						<p className="text-xs uppercase tracking-widest text-emerald-400/80">
							Viyana verification suite
						</p>
						<h1 className="text-2xl font-semibold">{title}</h1>
						{subtitle ? (
							<p className="mt-1 text-sm text-neutral-400">{subtitle}</p>
						) : null}
					</div>
					<nav className="flex flex-wrap items-center gap-2 text-sm">
						<Link
							className="rounded-md border border-neutral-700 px-2.5 py-1 hover:bg-neutral-800"
							to="/health"
						>
							Health
						</Link>
						<Link
							className="rounded-md border border-neutral-700 px-2.5 py-1 hover:bg-neutral-800"
							to="/debug"
						>
							Debug
						</Link>
						<Link
							className="rounded-md border border-neutral-700 px-2.5 py-1 hover:bg-neutral-800"
							to="/debug/db"
						>
							DB
						</Link>
						<Link
							className="rounded-md border border-neutral-700 px-2.5 py-1 hover:bg-neutral-800"
							to="/debug/profile"
						>
							Profile
						</Link>
						<Link
							className="rounded-md border border-neutral-700 px-2.5 py-1 hover:bg-neutral-800"
							to="/dashboard"
						>
							Dashboard
						</Link>
					</nav>
				</header>
				<main className="flex flex-col gap-4">{children}</main>
			</div>
		</div>
	);
}

export function Card({
	title,
	children,
	right,
}: {
	title: string;
	children: ReactNode;
	right?: ReactNode;
}) {
	return (
		<section className="flex w-full flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
			<div className="flex items-center justify-between gap-2">
				<h2 className="text-sm font-medium text-neutral-200">{title}</h2>
				{right}
			</div>
			{children}
		</section>
	);
}

export function ActionButton({
	label,
	loading,
	disabled,
	onClick,
}: {
	label: string;
	loading?: boolean;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			disabled={disabled || loading}
			onClick={onClick}
			className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
		>
			{loading ? "Working…" : label}
		</button>
	);
}

export function JsonBlock({
	label,
	value,
	empty,
	error,
}: {
	label: string;
	value?: unknown;
	empty?: string;
	error?: string;
}) {
	const body = error ? (
		<p className="text-sm text-rose-400">{error}</p>
	) : value === undefined ? (
		<p className="text-sm text-neutral-500">{empty ?? "No data yet."}</p>
	) : (
		<pre className="max-h-96 overflow-auto rounded-lg bg-neutral-950 p-3 text-xs leading-relaxed text-emerald-200/90">
			{typeof value === "string" ? value : JSON.stringify(value, null, 2)}
		</pre>
	);
	return (
		<div className="flex flex-col gap-1.5">
			<h3 className="text-xs uppercase tracking-wider text-neutral-500">{label}</h3>
			{body}
		</div>
	);
}
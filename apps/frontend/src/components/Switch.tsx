import type { ComponentPropsWithoutRef } from "react";

/**
 * Consistent on/off switch used across settings. Driven entirely by theme
 * CSS tokens so light and dark surfaces stay coherent.
 */
export function Switch({
	checked,
	onCheckedChange,
	disabled = false,
	"aria-label": ariaLabel,
	className,
	...rest
}: {
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	disabled?: boolean;
	"aria-label": string;
} & Omit<ComponentPropsWithoutRef<"button">, "disabled" | "onClick" | "role">) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={ariaLabel}
			disabled={disabled}
			onClick={() => onCheckedChange(!checked)}
			className={`relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring] disabled:cursor-not-allowed disabled:opacity-50 ${
				className ?? ""
			}`}
			style={{
				backgroundColor: checked ? "var(--sage)" : "var(--track-off)",
				boxShadow: checked
					? "inset 0 1px 2px rgba(0,0,0,0.18)"
					: "inset 0 1px 2px rgba(0,0,0,0.12)",
				border: "1px solid",
				borderColor: checked
					? "color-mix(in srgb, var(--sage) 70%, black)"
					: "var(--hairline)",
			}}
			{...rest}
		>
			<span
				aria-hidden="true"
				className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-[left] duration-200"
				style={{
					left: checked ? "calc(100% - 1.375rem)" : "0.25rem",
					boxShadow: "0 1px 3px rgba(50,40,25,0.35)",
				}}
			/>
		</button>
	);
}

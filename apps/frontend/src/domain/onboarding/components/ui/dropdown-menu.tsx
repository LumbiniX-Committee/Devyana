import { Check, ChevronRight, Circle } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import * as React from "react";

import { cn } from "../../../../lib/utils";

const DropdownMenuBase = DropdownMenu.Root;
const DropdownMenuTrigger = DropdownMenu.Trigger;
const DropdownMenuGroup = DropdownMenu.Group;
const DropdownMenuPortal = DropdownMenu.Portal;
const DropdownMenuSub = DropdownMenu.Sub;
const DropdownMenuRadioGroup = DropdownMenu.RadioGroup;

const DropdownMenuSubTrigger = React.forwardRef<
	React.ElementRef<typeof DropdownMenu.SubTrigger>,
	React.ComponentPropsWithoutRef<typeof DropdownMenu.SubTrigger> & {
		inset?: boolean;
	}
>(({ className, inset, children, ...props }, ref) => (
	<DropdownMenu.SubTrigger
		ref={ref}
		className={cn(
			"flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent data-[state=open]:bg-accent [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
			inset && "pl-8",
			className,
		)}
		{...props}
	>
		{children}
		<ChevronRight className="ml-auto" />
	</DropdownMenu.SubTrigger>
));
DropdownMenuSubTrigger.displayName = DropdownMenu.SubTrigger.displayName;

const DropdownMenuSubContent = React.forwardRef<
	React.ElementRef<typeof DropdownMenu.SubContent>,
	React.ComponentPropsWithoutRef<typeof DropdownMenu.SubContent>
>(({ className, ...props }, ref) => (
	<DropdownMenu.SubContent
		ref={ref}
		className={cn(
			"z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-dropdown-menu-content-transform-origin]",
			className,
		)}
		{...props}
	/>
));
DropdownMenuSubContent.displayName = DropdownMenu.SubContent.displayName;

const DropdownMenuContent = React.forwardRef<
	React.ElementRef<typeof DropdownMenu.Content>,
	React.ComponentPropsWithoutRef<typeof DropdownMenu.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
	<DropdownMenu.Portal>
		<DropdownMenu.Content
			ref={ref}
			sideOffset={sideOffset}
			className={cn(
				"z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
				"data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-dropdown-menu-content-transform-origin]",
				className,
			)}
			{...props}
		/>
	</DropdownMenu.Portal>
));
DropdownMenuContent.displayName = DropdownMenu.Content.displayName;

const DropdownMenuItem = React.forwardRef<
	React.ElementRef<typeof DropdownMenu.Item>,
	React.ComponentPropsWithoutRef<typeof DropdownMenu.Item> & { inset?: boolean }
>(({ className, inset, ...props }, ref) => (
	<DropdownMenu.Item
		ref={ref}
		className={cn(
			"relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0",
			inset && "pl-8",
			className,
		)}
		{...props}
	/>
));
DropdownMenuItem.displayName = DropdownMenu.Item.displayName;

const DropdownMenuCheckboxItem = React.forwardRef<
	React.ElementRef<typeof DropdownMenu.CheckboxItem>,
	React.ComponentPropsWithoutRef<typeof DropdownMenu.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
	<DropdownMenu.CheckboxItem
		ref={ref}
		className={cn(
			"relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
			className,
		)}
		checked={checked}
		{...props}
	>
		<span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
			<DropdownMenu.ItemIndicator>
				<Check className="h-4 w-4" />
			</DropdownMenu.ItemIndicator>
		</span>
		{children}
	</DropdownMenu.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = DropdownMenu.CheckboxItem.displayName;

const DropdownMenuRadioItem = React.forwardRef<
	React.ElementRef<typeof DropdownMenu.RadioItem>,
	React.ComponentPropsWithoutRef<typeof DropdownMenu.RadioItem>
>(({ className, children, ...props }, ref) => (
	<DropdownMenu.RadioItem
		ref={ref}
		className={cn(
			"relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
			className,
		)}
		{...props}
	>
		<span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
			<DropdownMenu.ItemIndicator>
				<Circle className="h-2 w-2 fill-current" />
			</DropdownMenu.ItemIndicator>
		</span>
		{children}
	</DropdownMenu.RadioItem>
));
DropdownMenuRadioItem.displayName = DropdownMenu.RadioItem.displayName;

const DropdownMenuLabel = React.forwardRef<
	React.ElementRef<typeof DropdownMenu.Label>,
	React.ComponentPropsWithoutRef<typeof DropdownMenu.Label> & {
		inset?: boolean;
	}
>(({ className, inset, ...props }, ref) => (
	<DropdownMenu.Label
		ref={ref}
		className={cn(
			"px-2 py-1.5 text-sm font-semibold",
			inset && "pl-8",
			className,
		)}
		{...props}
	/>
));
DropdownMenuLabel.displayName = DropdownMenu.Label.displayName;

const DropdownMenuSeparator = React.forwardRef<
	React.ElementRef<typeof DropdownMenu.Separator>,
	React.ComponentPropsWithoutRef<typeof DropdownMenu.Separator>
>(({ className, ...props }, ref) => (
	<DropdownMenu.Separator
		ref={ref}
		className={cn("-mx-1 my-1 h-px bg-muted", className)}
		{...props}
	/>
));
DropdownMenuSeparator.displayName = DropdownMenu.Separator.displayName;

const DropdownMenuShortcut = ({
	className,
	...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
	return (
		<span
			className={cn("ml-auto text-xs tracking-widest opacity-60", className)}
			{...props}
		/>
	);
};
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

export {
	DropdownMenuBase as DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuCheckboxItem,
	DropdownMenuRadioItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuGroup,
	DropdownMenuPortal,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuRadioGroup,
};

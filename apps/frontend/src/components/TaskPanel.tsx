import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "framer-motion";
import {
	Check,
	ChevronDown,
	Loader2,
	Plus,
	Repeat,
	Sparkles,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { cn } from "../lib/utils";

export interface Task {
	id: string;
	title: string;
	description: string | null;
	status: "pending" | "completed";
	createdAt: string;
	dueDate: string | null;
	recurrenceRule: string | null;
	parentTaskId: string | null;
	energyLevel: string | null;
	completionTrigger: string | null;
	completedAt: string | null;
	userId: string | null;
}

export interface TaskSuggestion {
	title: string;
	description: string;
	reason: string;
}

const DAILY_RULE = "FREQ=DAILY";

/** Auto-complete trigger: after a tracked session of this length (5 min). */
const AUTO_COMPLETE_AFTER_MS = 5 * 60 * 1000;

/** Task list with AI suggestions and one-tap daily recurrence.
 *
 * - `+` opens a picker: AI suggestions (spinner while loading) or a manual input.
 * - Each row's loop icon toggles `FREQ=DAILY` recurrence.
 * - Completing a task calls `complete_task` (recurring tasks advance to their
 *   next instance) and the UI refreshes from the `task-completed` event too.
 */
export default function TaskPanel() {
	const [tasks, setTasks] = useState<Task[]>([]);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([]);
	const [suggestionsLoading, setSuggestionsLoading] = useState(false);
	const [manualText, setManualText] = useState("");
	const [showCompleted, setShowCompleted] = useState(true);
	const [busy, setBusy] = useState(false);

	const refresh = useCallback(async () => {
		const data = await invoke<Task[]>("get_tasks");
		setTasks(data);
	}, []);

	useEffect(() => {
		void refresh();
		const unlistenPromise = listen<{ id: string }>("task-completed", () => {
			void refresh();
		});
		return () => {
			void unlistenPromise.then((un) => un());
		};
	}, [refresh]);

	const openPicker = useCallback(async () => {
		setPickerOpen((open) => {
			const next = !open;
			if (next) {
				setSuggestionsLoading(true);
				invoke<TaskSuggestion[]>("suggest_tasks")
					.then((items) => {
						setSuggestions(items ?? []);
					})
					.catch((err) => {
						console.error(err);
						setSuggestions([]);
					})
					.finally(() => setSuggestionsLoading(false));
			}
			return next;
		});
	}, []);

	const addTask = useCallback(
		async (input: {
			title: string;
			description?: string | null;
			recurrenceRule?: string | null;
		}) => {
			setBusy(true);
			try {
				await invoke("add_task", {
					task: {
						title: input.title,
						description: input.description ?? null,
						dueDate: null,
						recurrenceRule: input.recurrenceRule ?? null,
						energyLevel: null,
						completionTrigger: null,
						userId: null,
					},
				});
				setManualText("");
				await refresh();
			} finally {
				setBusy(false);
			}
		},
		[refresh],
	);

	const handleManualAdd = useCallback(async () => {
		const title = manualText.trim();
		if (!title || busy) return;
		await addTask({ title });
		setPickerOpen(false);
	}, [addTask, busy, manualText]);

	const toggleTask = useCallback(
		async (task: Task) => {
			try {
				if (task.status === "pending") {
					await invoke("complete_task", { id: task.id });
				} else {
					await invoke("reopen_task", { id: task.id });
				}
			} catch (err) {
				console.error(err);
			} finally {
				await refresh();
			}
		},
		[refresh],
	);

	const toggleRecurrence = useCallback(
		async (task: Task) => {
			try {
				await invoke("update_task", {
					task: {
						...task,
						recurrenceRule: task.recurrenceRule ? null : DAILY_RULE,
					},
				});
			} catch (err) {
				console.error(err);
			} finally {
				await refresh();
			}
		},
		[refresh],
	);

	const toggleAutoComplete = useCallback(
		async (task: Task) => {
			try {
				await invoke("update_task", {
					task: {
						...task,
						completionTrigger: task.completionTrigger
							? null
							: JSON.stringify({ minDurationMs: AUTO_COMPLETE_AFTER_MS }),
					},
				});
			} catch (err) {
				console.error(err);
			} finally {
				await refresh();
			}
		},
		[refresh],
	);

	const pending = tasks.filter((t) => t.status === "pending");
	const completed = tasks.filter((t) => t.status === "completed");

	return (
		<div className="flex w-full flex-col gap-2 rounded-2xl border border-border bg-card/70 p-4 backdrop-blur-sm">
			<div className="flex items-center justify-between">
				<h2 className="text-sm font-semibold text-foreground">Tasks</h2>
				<button
					type="button"
					onClick={() => void openPicker()}
					className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					aria-label="Add task"
				>
					<Plus className="h-4 w-4" />
				</button>
			</div>

			<AnimatePresence initial={false}>
				{pickerOpen && (
					<motion.div
						initial={{ opacity: 0, height: 0 }}
						animate={{ opacity: 1, height: "auto" }}
						exit={{ opacity: 0, height: 0 }}
						transition={{ duration: 0.18 }}
						className="overflow-hidden"
					>
						<div className="flex flex-col gap-3 pt-2">
							<div className="flex gap-2">
								<input
									value={manualText}
									onChange={(e) => setManualText(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") void handleManualAdd();
									}}
									placeholder="Type a task…"
									className="h-9 flex-1 rounded-xl border border-input bg-input/40 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
								/>
								<button
									type="button"
									onClick={() => void handleManualAdd()}
									disabled={busy || !manualText.trim()}
									className="h-9 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-40"
								>
									Add
								</button>
							</div>

							<div className="flex flex-col gap-1.5">
								<p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
									<Sparkles className="h-3.5 w-3.5" />
									Smart suggestions
								</p>
								{suggestionsLoading ? (
									<div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
										<Loader2 className="h-3.5 w-3.5 animate-spin" />
										Thinking with your behavior graph…
									</div>
								) : (
									suggestions.map((s) => (
										<div
											key={`${s.title}-${s.reason}`}
											className="flex items-start justify-between gap-2 rounded-lg border border-border/80 bg-muted/30 px-3 py-2"
										>
											<div className="min-w-0">
												<p className="text-sm text-foreground">{s.title}</p>
												{s.reason && (
													<p className="mt-0.5 text-xs text-muted-foreground">
														{s.reason}
													</p>
												)}
											</div>
											<button
												type="button"
												onClick={() =>
													void addTask({
														title: s.title,
														description: s.reason,
													})
												}
												disabled={busy}
												className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground/80 transition-colors hover:bg-primary hover:text-primary-foreground"
											>
												Add
											</button>
										</div>
									))
								)}
								{suggestions.length === 0 && !suggestionsLoading && (
									<p className="text-xs text-muted-foreground">
										No suggestions right now — add one manually above.
									</p>
								)}
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>

			<div className="flex flex-col gap-1 pt-1">
				{pending.length === 0 && completed.length === 0 ? (
					<p className="py-3 text-center text-xs text-muted-foreground">
						No tasks yet. Add one or pick a smart suggestion.
					</p>
				) : null}
				{pending.map((task) => (
					<TaskRow
						key={task.id}
						task={task}
						onToggle={() => void toggleTask(task)}
						onRecur={() => void toggleRecurrence(task)}
						onAuto={() => void toggleAutoComplete(task)}
					/>
				))}
			</div>

			{completed.length > 0 && (
				<div className="mt-1 border-t border-border/60 pt-1">
					<button
						type="button"
						onClick={() => setShowCompleted((v) => !v)}
						className="flex w-full items-center justify-between py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
					>
						<span>Completed ({completed.length})</span>
						<ChevronDown
							className={cn(
								"h-4 w-4 transition-transform",
								showCompleted ? "" : "-rotate-90",
							)}
						/>
					</button>
					<AnimatePresence initial={false}>
						{showCompleted && (
							<motion.div
								initial={{ opacity: 0, height: 0 }}
								animate={{ opacity: 1, height: "auto" }}
								exit={{ opacity: 0, height: 0 }}
								className="overflow-hidden"
							>
								<div className="flex flex-col gap-1 py-1 opacity-60">
									{completed.map((task) => (
										<TaskRow
											key={task.id}
											task={task}
											onToggle={() => void toggleTask(task)}
											onRecur={() => void toggleRecurrence(task)}
											onAuto={() => void toggleAutoComplete(task)}
										/>
									))}
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			)}
		</div>
	);
}

interface TaskRowProps {
	task: Task;
	onToggle: () => void;
	onRecur: () => void;
	onAuto: () => void;
}

function TaskRow({ task, onToggle, onRecur, onAuto }: TaskRowProps) {
	const done = task.status === "completed";
	const auto = Boolean(task.completionTrigger);
	return (
		<div className="group flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted/40">
			<button
				type="button"
				onClick={onToggle}
				className={cn(
					"grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full border transition-colors",
					done
						? "border-primary bg-primary text-primary-foreground"
						: "border-muted-foreground/50 hover:border-primary",
				)}
				aria-label={done ? "Mark as pending" : "Mark as completed"}
			>
				{done && <Check className="h-3 w-3" strokeWidth={3} />}
			</button>
			<span
				className={cn(
					"min-w-0 flex-1 truncate text-sm",
					done ? "text-muted-foreground line-through" : "text-foreground",
				)}
				title={task.description ?? undefined}
			>
				{task.title}
			</span>
			{task.dueDate && !done && (
				<span className="whitespace-nowrap text-[11px] text-muted-foreground">
					{task.dueDate === new Date().toISOString().slice(0, 10)
						? "Today"
						: task.dueDate}
				</span>
			)}
			<button
				type="button"
				onClick={onAuto}
				title={
					auto
						? "Auto-completes after 5 min of tracked focus (click to turn off)"
						: "Auto-complete after 5 min of tracked focus"
				}
				className={cn(
					"grid h-6 w-6 place-items-center rounded-md transition-colors",
					auto
						? "text-amber-400"
						: "text-muted-foreground/50 opacity-0 hover:text-foreground group-hover:opacity-100",
				)}
				aria-label={
					auto
						? "Turn off auto-completion trigger"
						: "Turn on auto-completion trigger"
				}
			>
				<Zap className="h-3.5 w-3.5" />
			</button>
			<button
				type="button"
				onClick={onRecur}
				title={
					task.recurrenceRule
						? "Daily task (click to remove)"
						: "Make this a daily task"
				}
				className={cn(
					"grid h-6 w-6 place-items-center rounded-md transition-colors",
					task.recurrenceRule
						? "text-primary"
						: "text-muted-foreground/50 opacity-0 hover:text-foreground group-hover:opacity-100",
				)}
				aria-label={
					task.recurrenceRule
						? "Remove daily recurrence"
						: "Set daily recurrence"
				}
			>
				<Repeat className="h-3.5 w-3.5" />
			</button>
		</div>
	);
}

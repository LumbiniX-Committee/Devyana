import TaskPanel from "../components/TaskPanel";

function Tasks() {
	return (
		<div className="mx-auto max-w-2xl p-6">
			<h1 className="mb-4 text-xl font-semibold text-foreground">Tasks</h1>
			<TaskPanel />
		</div>
	);
}

export default Tasks;

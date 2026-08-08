import { useState } from "react";

function Tasks() {
    const [currentTaskFieldData, setCurrentTaskFieldData] = useState<string>("")
    const [taskLists, setTaskLists] = useState<Array<string>>([])
    return (
        <>
            <input value={currentTaskFieldData} onChange={e => setCurrentTaskFieldData(e.target.value)} type="text" name="task" />
            <button onClick={e => {
                e.preventDefault()
                if (currentTaskFieldData.trim()) {
                    setTaskLists(prev => [...prev, currentTaskFieldData])
                    setCurrentTaskFieldData("")
                }
            }}
            >
                Add Task
            </button>
            <br />
            <div>
                {taskLists.map(((task, index) => (
                    <div key={`task-${index}`} className="w-full flex flex-row justify-between">
                        <h1>{task}</h1>
                        <button onClick={() => {
                            if (task) {
                                const tasks = taskLists.filter(taskElem => taskElem.trim() !== task.trim())
                                setTaskLists(() => tasks)
                            }
                        }}>
                            Mark as completed
                        </button>
                    </div>
                )))}</div>

        </>
    )
}

export default Tasks
import { useRef, useState } from "react";

function Sessions() {
    const [sessionTime, setSessionTime] = useState(0);

    const [sessionState, setSessionState] = useState<"not_started" | "started" | "paused">("not_started");

    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const operateSessionTime = () => {
        switch (sessionState) {
            case "not_started":
            case "paused":
                timerRef.current = setInterval(() => {
                    setSessionTime((prev) => prev + 1);
                }, 1000);

                setSessionState("started");
                break;

            case "started":
                if (timerRef.current) {
                    clearInterval(timerRef.current);
                }

                setSessionState("paused");
                break;

            default:
                break;
        }
    };

    return (
        <div>
            <div className="bg-blue-200 rounded-full h-48 w-48 flex justify-center items-center">
                {sessionTime}
            </div>

            <button onClick={operateSessionTime}>
                {sessionState === "started" ? "Pause" : "Start"}
            </button>
            <br />
            <button onClick={() => {
                setSessionTime(0)
                setSessionState("not_started")
                if (timerRef.current) {
                    clearInterval(timerRef.current)
                }

            }}>Reset</button>
        </div>
    );
}

export default Sessions;
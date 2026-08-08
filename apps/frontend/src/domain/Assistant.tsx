import { useState } from "react";

interface Chat {
    role: "user" | "assistant" | "system";
    message: string;
}

function Assistant() {
    const [chatHistory, setChatHistory] = useState<Array<Chat>>([])
    const [userMessage, setUserMessage] = useState<string>("")

    return (
        <footer className="w-full h-screen flex flex-col">
            <div className="h-full w-full">
                {chatHistory.map((chatMessage, index) => {
                    if (chatMessage.role === "system") return;

                    return (
                        <div
                            key={`chat-${chatMessage.role}-message-${index}`}
                            className={`w-full flex ${chatMessage.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                            <div className={`rounded-lg p-4 w-fit max-w-[70%] ${chatMessage.role === "user" ? "bg-blue-100" : "bg-red-100"}`}>
                                {chatMessage.message}
                            </div>
                        </div>
                    )
                })}
            </div>

            <div className="flex flex-row self-end items-center justify-center w-full">
                <input value={userMessage} onChange={e => setUserMessage(e.target.value)} className="w-4/5 bg-blue-100" type="text" name="prompt" />
                <button onClick={e => {
                    e.preventDefault()
                    if (userMessage.trim()) {
                        setChatHistory(prev => [...prev, { role: "user", message: userMessage }])
                        setUserMessage("")
                        // setChatHistory(prev => [...prev, { role: "assistant", message: userMessage }])
                    }
                }}>Send</button>
            </div>
        </footer>
    )
}

export default Assistant
import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/utils';
import { Camera, RotateCcw, Save, Shuffle } from 'lucide-react';

function Block() {
    const [time, setTime] = useState<number>(0)
    const [isChallengeAccepted, setIsChallengeAccepted] = useState<boolean>(false)
    const video = useRef<HTMLVideoElement>(null)
    const canvas = useRef<HTMLCanvasElement>(null)
    const [facingMode, setFacingMode] = useState<"user" | "environment">("user")
    const [isCaptured, setIsCaptured] = useState<boolean>(false)
    const [capturedFile, setCapturedFile] = useState<File | null>(null)
    const [isTaskCompleted, setIsTaskCompleted] = useState<boolean>(false)

    useEffect(() => {
        const timer = setInterval(() => {
            setTime(time => time + 1)
        }, 1000);

        return () => clearInterval(timer)
    }, [])

    useEffect(() => {
        startCamera()
    }, [facingMode])

    useEffect(() => {
        const videoElement = video.current

        return () => {
            if (videoElement?.srcObject) {
                const stream = videoElement.srcObject as MediaStream;
                stream.getTracks().forEach((track) => track.stop());
            }
        };
    }, [])


    const startCamera = async () => {
        try {
            const videoElement = video.current

            if (videoElement?.srcObject) {
                const stream = videoElement.srcObject as MediaStream;
                stream.getTracks().forEach((track) => track.stop());
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode }
            })

            if (videoElement) {
                videoElement.srcObject = stream
            }
        } catch (error) {
            alert("Camera access denied or not available.");
            console.error(error);
        }
    }

    const handleRetake = () => {
        setIsCaptured(false)
        startCamera()
    }

    const handleFlip = () => setFacingMode(mode => mode === "user" ? "environment" : "user")

    const handleCapture = () => {
        if (!canvas.current || !video.current) {
            return
        }

        const context = canvas.current.getContext("2d")

        if (!context) {
            return
        }

        canvas.current.width = video.current.videoWidth;
        canvas.current.height = video.current.videoHeight;
        context.drawImage(
            video.current,
            0,
            0,
            canvas.current.width,
            canvas.current.height
        );
        setIsCaptured(true);
    }

    const handleSubmit = () => {
        if (!canvas.current) {
            return
        }

        canvas.current.toBlob((blob) => {
            if (blob) {
                const file = new File([blob], `capture.jpg`, {
                    type: "image/jpeg"
                })

                setCapturedFile(file);
                setIsTaskCompleted(true);
            }
        }, "image/jpeg", 0.95)
    }

    return (
        <main className="h-dvh w-dvw flex flex-col items-center justify-center">
            {
                isTaskCompleted || time >= 300 ? "Successfully! Completed the task" : (
                    <>
                        <img className="h-48 w-48" src="/android-chrome-512x512.png" alt="" />
                        You had spent huge time on scrolling YouTube. Now, take some rest for
                        <h1>{time}s /300s</h1>
                        <br />
                        Or, Upload a photo of yourself touching some grass
                        <br />
                        {
                            isChallengeAccepted
                                ? (
                                    <div className="w-148 h-148 border bg-yellow-400">
                                        <video ref={video} autoPlay playsInline className={cn("w-full h-full object-cover border bg-blue-400", isCaptured ? "hidden" : "block")} />
                                        <canvas ref={canvas} className={cn("w-full h-full object-cover", isCaptured ? "block" : "hidden")} />

                                        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
                                            <div className="flex items-center gap-4">
                                                {!isCaptured ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={handleFlip}
                                                            className="bg-white rounded-full p-3 shadow-lg hover:bg-gray-100 active:scale-95 transition-all duration-200 cursor-pointer"
                                                            aria-label="Flip"
                                                        >
                                                            <Shuffle className="w-6 h-6 text-gray-800" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={handleCapture}
                                                            className="bg-white rounded-full p-4 shadow-lg hover:bg-gray-100 active:scale-95 transition-all duration-200 cursor-pointer"
                                                            aria-label="Capture photo"
                                                        >
                                                            <Camera className="w-8 h-8 text-gray-800" />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={handleRetake}
                                                            className="bg-white rounded-full p-3 shadow-lg hover:bg-gray-100 active:scale-95 transition-all duration-200 cursor-pointer"
                                                            aria-label="Retake photo"
                                                        >
                                                            <RotateCcw className="w-6 h-6 text-gray-800" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={handleSubmit}
                                                            className="bg-primary/90 rounded-full p-4 shadow-lg hover:bg-primary active:scale-95 transition-all duration-200 cursor-pointer"
                                                            aria-label="Submit"
                                                        >
                                                            <Save className="w-8 h-8 text-white" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )
                                : <button onClick={() => setIsChallengeAccepted(true)} type="button" className="p-4 cursor-pointer rounded-xl bg-green-200">
                                    Accept the challenge
                                </button>
                        }
                    </>
                )
            }


        </main>
    )
}

export default Block
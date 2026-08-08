import { AnimatePresence, MotionConfig } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
	Brain,
	Briefcase,
	Compass,
	GraduationCap,
	HeartHandshake,
	Laptop,
	Moon,
	Palette,
	PenLine,
	Sparkles,
	Stethoscope,
	Wind,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AuroraBackground } from "./components/AuroraBackground";
import { LoadingLogo } from "./components/LoadingLogo";
import { ChoiceStep } from "./components/onboarding/ChoiceStep";
import { DoneStep } from "./components/onboarding/DoneStep";
import { GreetingStep } from "./components/onboarding/GreetingStep";
import { MessageStep } from "./components/onboarding/MessageStep";
import { NameStep } from "./components/onboarding/NameStep";
import { StepNav } from "./components/onboarding/StepNav";
import { TopBar } from "./components/TopBar";
import "./onboarding.css";

// Flow: 0 loading → 1 name → 2 greeting → 3 profession → 4 goal → 5 message → 6 done
const STEP = {
	LOADING: 0,
	NAME: 1,
	GREETING: 2,
	ROLE: 3,
	GOAL: 4,
	MESSAGE: 5,
	DONE: 6,
} as const;

type StepValue = (typeof STEP)[keyof typeof STEP];

// The three interactive questions drive the progress dots + Back control.
const FORM_STEPS: StepValue[] = [STEP.NAME, STEP.ROLE, STEP.GOAL];

interface AuroraSpec {
	intensity: number;
	flood: number;
}

// Aurora glow builds up as the seeker progresses.
const AURORA: Record<StepValue, AuroraSpec> = {
	[STEP.LOADING]: { intensity: 0, flood: 0 },
	[STEP.NAME]: { intensity: 0.16, flood: 0 },
	[STEP.GREETING]: { intensity: 0.05, flood: 0 },
	[STEP.ROLE]: { intensity: 0.5, flood: 0 },
	[STEP.GOAL]: { intensity: 0.72, flood: 0 },
	[STEP.MESSAGE]: { intensity: 0.9, flood: 0 },
	[STEP.DONE]: { intensity: 1, flood: 1 },
};

interface RoleOption {
	id: string;
	label: string;
	Icon: LucideIcon;
}

const ROLE_OPTIONS: RoleOption[] = [
	{ id: "doctor", label: "Doctor / Healthcare", Icon: Stethoscope },
	{ id: "teacher", label: "Teacher / Educator", Icon: GraduationCap },
	{ id: "engineer", label: "Engineer / Tech", Icon: Laptop },
	{ id: "business", label: "Business / Entrepreneur", Icon: Briefcase },
	{ id: "artist", label: "Artist / Creative", Icon: Palette },
	{ id: "other", label: "Other", Icon: PenLine },
];

const GOAL_OPTIONS: RoleOption[] = [
	{ id: "calm", label: "Reduce stress & anxiety", Icon: Wind },
	{ id: "sleep", label: "Sleep more peacefully", Icon: Moon },
	{ id: "focus", label: "Focus & clarity", Icon: Brain },
	{ id: "compassion", label: "Cultivate compassion", Icon: HeartHandshake },
	{ id: "growth", label: "Spiritual growth", Icon: Sparkles },
	{ id: "other", label: "Something else", Icon: Compass },
];

export default function Onboarding() {
	const navigate = useNavigate();
	const [step, setStep] = useState<StepValue>(STEP.LOADING);
	const [name, setName] = useState(
		(typeof window !== "undefined" && localStorage.getItem("vinaya_name")) ||
			"friend",
	);

	// Scope the aurora design system to this experience (covers portal surfaces).
	useEffect(() => {
		document.body.setAttribute("data-onboarding-theme", "");
		return () => document.body.removeAttribute("data-onboarding-theme");
	}, []);

	// Auto-advance for the timed transitional screens.
	useEffect(() => {
		let t: ReturnType<typeof setTimeout> | undefined;
		if (step === STEP.LOADING) t = setTimeout(() => setStep(STEP.NAME), 2600);
		if (step === STEP.GREETING) t = setTimeout(() => setStep(STEP.ROLE), 2600);
		if (step === STEP.MESSAGE) t = setTimeout(() => setStep(STEP.DONE), 3400);
		return () => clearTimeout(t);
	}, [step]);

	const handleName = useCallback((value: string) => {
		localStorage.setItem("vinaya_name", value);
		setName(value);
		setStep(STEP.GREETING);
	}, []);

	const handleRole = useCallback((role: string) => {
		localStorage.setItem("vinaya_role", role);
		setStep(STEP.GOAL);
	}, []);

	const handleGoal = useCallback((goal: string) => {
		localStorage.setItem("vinaya_goal", goal);
		setStep(STEP.MESSAGE);
	}, []);

	const handleStart = useCallback(() => {
		localStorage.setItem("vinaya_onboarded", "true");
		navigate("/app");
	}, [navigate]);

	// Back navigation across the interactive questions.
	const formIndex = FORM_STEPS.indexOf(step);
	const handleBack = useCallback(() => {
		const idx = FORM_STEPS.indexOf(step);
		if (idx > 0) setStep(FORM_STEPS[idx - 1]);
	}, [step]);

	// Click-to-skip only on the two timed message screens.
	const skipTimed = () => {
		if (step === STEP.GREETING) setStep(STEP.ROLE);
		else if (step === STEP.MESSAGE) setStep(STEP.DONE);
	};

	const aurora = AURORA[step];
	const showChrome = step !== STEP.LOADING;

	return (
		<MotionConfig reducedMotion="user">
			{/* biome-ignore lint/a11y/noStaticElementInteractions: click-anywhere skip is intentional for timed screens */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: whole-screen tap target, keyboard is handled by nested controls */}
			<div
				className="onboarding-shell relative min-h-screen w-full overflow-hidden"
				onClick={skipTimed}
			>
				<AuroraBackground intensity={aurora.intensity} flood={aurora.flood} />

				{showChrome && <TopBar onLogoClick={() => setStep(STEP.NAME)} />}

				{step === STEP.LOADING && <LoadingLogo />}

				<div className="relative z-20">
					<AnimatePresence mode="wait">
						{step === STEP.NAME && (
							<NameStep key="name" initialName={name} onSubmit={handleName} />
						)}
						{step === STEP.GREETING && (
							<GreetingStep key="greeting" name={name} />
						)}
						{step === STEP.ROLE && (
							<ChoiceStep
								key="role"
								title="What do you do?"
								subtitle="Seekers here come from every walk of life."
								options={ROLE_OPTIONS}
								onSelect={handleRole}
							/>
						)}
						{step === STEP.GOAL && (
							<ChoiceStep
								key="goal"
								title="What brings you here?"
								subtitle="Set an intention for your practice."
								options={GOAL_OPTIONS}
								onSelect={handleGoal}
							/>
						)}
						{step === STEP.MESSAGE && <MessageStep key="message" />}
						{step === STEP.DONE && (
							<DoneStep key="done" onStart={handleStart} />
						)}
					</AnimatePresence>
				</div>

				<AnimatePresence>
					{formIndex >= 0 && (
						<StepNav
							key="stepnav"
							total={FORM_STEPS.length}
							index={formIndex}
							onBack={handleBack}
						/>
					)}
				</AnimatePresence>
			</div>
		</MotionConfig>
	);
}

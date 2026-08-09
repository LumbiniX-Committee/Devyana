import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, MotionConfig } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
	Briefcase,
	CircleUser,
	GraduationCap,
	Heart,
	HeartHandshake,
	Laptop,
	Palette,
	PenLine,
	Stethoscope,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AuroraBackground } from "./components/AuroraBackground";
import { LoadingLogo } from "./components/LoadingLogo";
import { AgeStep } from "./components/onboarding/AgeStep";
import { ChoiceStep } from "./components/onboarding/ChoiceStep";
import { DoneStep } from "./components/onboarding/DoneStep";
import { GreetingStep } from "./components/onboarding/GreetingStep";
import { MessageStep } from "./components/onboarding/MessageStep";
import { NameStep } from "./components/onboarding/NameStep";
import { PrivacyPolicyModal } from "./components/onboarding/PrivacyPolicyModal";
import { StepNav } from "./components/onboarding/StepNav";
import { TopBar } from "./components/TopBar";
import { toast } from "./components/ui/sonner";
import "./onboarding.css";

// Flow: 0 loading → 1 name → 2 gender → 3 greeting → 4 profession → 5 age
//       → 6 message → 7 done
const STEP = {
	LOADING: 0,
	NAME: 1,
	GENDER: 2,
	GREETING: 3,
	ROLE: 4,
	AGE: 5,
	MESSAGE: 6,
	DONE: 7,
} as const;

type StepValue = (typeof STEP)[keyof typeof STEP];

// The interactive questions drive the progress dots + Back control.
const FORM_STEPS: StepValue[] = [STEP.NAME, STEP.GENDER, STEP.ROLE, STEP.AGE];

interface AuroraSpec {
	intensity: number;
	flood: number;
}

// Aurora glow builds up as the seeker progresses.
const AURORA: Record<StepValue, AuroraSpec> = {
	[STEP.LOADING]: { intensity: 0, flood: 0 },
	[STEP.NAME]: { intensity: 0.16, flood: 0 },
	[STEP.GENDER]: { intensity: 0.3, flood: 0 },
	[STEP.GREETING]: { intensity: 0.05, flood: 0 },
	[STEP.ROLE]: { intensity: 0.5, flood: 0 },
	[STEP.AGE]: { intensity: 0.6, flood: 0 },
	[STEP.MESSAGE]: { intensity: 0.9, flood: 0 },
	[STEP.DONE]: { intensity: 1, flood: 1 },
};

interface RoleOption {
	id: string;
	label: string;
	Icon: LucideIcon;
}

const GENDER_OPTIONS: RoleOption[] = [
	{ id: "male", label: "Male", Icon: Heart },
	{ id: "female", label: "Female", Icon: CircleUser },
	{ id: "other", label: "Other", Icon: HeartHandshake },
];

const ROLE_OPTIONS: RoleOption[] = [
	{ id: "doctor", label: "Doctor / Healthcare", Icon: Stethoscope },
	{ id: "teacher", label: "Teacher / Educator", Icon: GraduationCap },
	{ id: "engineer", label: "Engineer / Tech", Icon: Laptop },
	{ id: "business", label: "Business / Entrepreneur", Icon: Briefcase },
	{ id: "artist", label: "Artist / Creative", Icon: Palette },
	{ id: "other", label: "Other", Icon: PenLine },
];

interface CompleteOnboardingPayload {
	id: string;
	gender: string;
	age: number;
	profession: string;
	goals: string[];
}

export default function Onboarding() {
	const navigate = useNavigate();
	const [step, setStep] = useState<StepValue>(STEP.LOADING);
	const [name, setName] = useState(
		(typeof window !== "undefined" && localStorage.getItem("vinaya_name")) ||
			"friend",
	);
	const [gender, setGender] = useState(
		(typeof window !== "undefined" && localStorage.getItem("vinaya_gender")) ||
			"",
	);
	const [age, setAge] = useState(0);
	const [role, setRole] = useState(
		(typeof window !== "undefined" && localStorage.getItem("vinaya_role")) ||
			"",
	);
	const [privacyAccepted, setPrivacyAccepted] = useState(false);
	const [policyOpen, setPolicyOpen] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const submittedOnce = useRef(false);

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
		setStep(STEP.GENDER);
	}, []);

	const handleGender = useCallback((value: string) => {
		const normalized = value.toLowerCase();
		localStorage.setItem("vinaya_gender", normalized);
		setGender(normalized);
		setStep(STEP.GREETING);
	}, []);

	const handleRole = useCallback((value: string) => {
		localStorage.setItem("vinaya_role", value);
		setRole(value);
		setStep(STEP.AGE);
	}, []);

	const handleAge = useCallback((value: number) => {
		localStorage.setItem("vinaya_age", String(value));
		setAge(value);
		setStep(STEP.MESSAGE);
	}, []);

	const handleStart = useCallback(async () => {
		if (submittedOnce.current) return;
		submittedOnce.current = true;

		const profession = role || localStorage.getItem("vinaya_role") || "";

		if (!gender || age < 1 || !profession) {
			submittedOnce.current = false;
			setSubmitting(false);
			toast.error(
				"A few details are still missing. Please go back and complete them.",
			);
			return;
		}

		if (!privacyAccepted) {
			submittedOnce.current = false;
			setSubmitting(false);
			toast.error("Please accept the privacy policy to continue.");
			return;
		}

		setSubmitting(true);

		const payload: CompleteOnboardingPayload = {
			id: crypto.randomUUID(),
			gender,
			age,
			profession,
			goals: ["calm"],
		};

		try {
			await invoke("complete_onboarding", { profile: payload });
			localStorage.setItem("vinaya_onboarded", "true");
			localStorage.setItem("onboarding_completed", "true");
			localStorage.setItem("user_profile_id", payload.id);
			// Verification breadcrumbs: profile persisted + onboarding done.
			console.log(
				"[onboarding] profile saved",
				payload.id,
				payload.gender,
				payload.age,
			);
			navigate("/app");
		} catch (error) {
			submittedOnce.current = false;
			setSubmitting(false);
			console.error("Onboarding failed:", error);
			toast.error("Could not save your profile. Please try again.");
		}
	}, [age, gender, navigate, privacyAccepted, role]);

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
						{step === STEP.GENDER && (
							<ChoiceStep
								key="gender"
								title="How do you identify?"
								subtitle="This helps Vinaya personalise your practice."
								options={GENDER_OPTIONS}
								onSelect={handleGender}
							/>
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
						{step === STEP.AGE && (
							<AgeStep key="age" initialAge={age} onSubmit={handleAge} />
						)}
						{step === STEP.MESSAGE && <MessageStep key="message" />}
						{step === STEP.DONE && (
							<DoneStep
								key="done"
								loading={submitting}
								accepted={privacyAccepted}
								onToggle={() => setPrivacyAccepted(!privacyAccepted)}
								onOpenPolicy={() => setPolicyOpen(true)}
								onStart={handleStart}
							/>
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

				<PrivacyPolicyModal
					open={policyOpen}
					onClose={() => setPolicyOpen(false)}
					onAccept={() => {
						setPolicyOpen(false);
						setPrivacyAccepted(true);
					}}
				/>
			</div>
		</MotionConfig>
	);
}

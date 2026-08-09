import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import Onboarding from "./domain/onboarding/Onboarding";

interface ProfileRow {
	id: string;
}

function App() {
	const [ready, setReady] = useState(false);
	const [hasProfile, setHasProfile] = useState(false);

	// Startup guard: the database is the source of truth. If a profile already
	// exists, skip onboarding and go straight to the dashboard. On any error
	// (e.g. missing/corrupt table) we fall back to onboarding as a safety net.
	useEffect(() => {
		const checkProfile = async () => {
			try {
				const exists = await invoke<boolean>("has_profile");
				if (exists) {
					const profile = await invoke<ProfileRow | null>("get_profile");
					if (profile) {
						localStorage.setItem("user_profile_id", profile.id);
						localStorage.setItem("vinaya_onboarded", "true");
						localStorage.setItem("onboarding_completed", "true");
					}
					setHasProfile(true);
				}
			} catch (error) {
				console.error("Startup profile check failed:", error);
			}
			setReady(true);
		};
		void checkProfile();
	}, []);

	if (!ready) return null;

	return hasProfile ? (
		<Navigate to="/dashboard" replace />
	) : (
		<div>
			<Onboarding />
		</div>
	);
}

export default App;

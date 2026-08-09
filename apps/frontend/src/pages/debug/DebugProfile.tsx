import { invoke } from "@tauri-apps/api/core";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

import { ActionButton, Card, DebugShell } from "./ui";

interface UserProfileRow {
	id: string;
	gender: string;
	age: number;
	profession: string;
	goals: string;
	createdAt: string;
	updatedAt: string;
}

/** The profile row driving daily goals and immediately-start tasks. */
export default function DebugProfile() {
	const [profile, setProfile] = useState<UserProfileRow | null>(null);
	const [error, setError] = useState<string | undefined>(undefined);
	const [loading, setLoading] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		setError(undefined);
		try {
			setProfile(await invoke<UserProfileRow | null>("get_profile"));
		} catch (err) {
			setError(String(err));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	return (
		<DebugShell
			title="Debug — Profile"
			subtitle="The DB row behind the daily goals and immediately-startable tasks."
		>
			<Card
				title="Profile"
				right={<ActionButton label="Refresh" loading={loading} onClick={() => void load()} />}
			>
				{error ? <p className="text-sm text-rose-400">{error}</p> : null}
				{!loading && profile === null ? (
					<p className="text-sm text-neutral-500">
						No profile yet — complete onboarding first.
					</p>
				) : profile ? (
					<dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
						<Field label="Gender" value={profile.gender} />
						<Field label="Age" value={String(profile.age)} />
						<Field label="Profession" value={profile.profession} />
<Field
							label="Goals (JSON)"
							value={
								<code className="break-all text-emerald-300">{profile.goals}</code>
							}
						/>
						<Field label="Row id" value={profile.id} />
						<Field label="Updated at" value={profile.updatedAt} />
					</dl>
				) : null}
			</Card>
		</DebugShell>
	);
}

function Field({ label, value }: { label: string; value: string | ReactNode }) {
	return (
		<div className="flex flex-col gap-1">
			<dt className="text-xs uppercase tracking-wider text-neutral-500">{label}</dt>
			<dd className="text-neutral-200">{value}</dd>
		</div>
	);
}
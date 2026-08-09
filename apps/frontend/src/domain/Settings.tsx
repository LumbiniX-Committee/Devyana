import { DesktopTrackingToggle } from "../components/DesktopTracking";

function Settings() {
	return (
		<div>
			<h1>Display</h1>
			<ul>
				<li>App Theme</li>
				<li>First day of the week</li>
				<li>Use 24 hour time</li>
			</ul>
			<h1>Startup Options</h1>
			<ul>
				<li>Launch Vinaya on startup</li>
			</ul>
			<h1>Strictness</h1>
			<ul>
				<li>Warning Time Threshold</li>
				<li>Remove Pause for a Cause feature</li>
			</ul>
			<h1>Tracking</h1>
			<DesktopTrackingToggle />
			<h1>Notifications</h1>
			<ul>
				<li>LLM Frequency</li>
			</ul>
			<h1>LLM</h1>
			<ul>
				<li>Model (auto detect)</li>
				<li>Key? (if cloud provider)</li>
			</ul>
		</div>
	);
}

export default Settings;

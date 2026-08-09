import type { PlasmoMessaging } from "@plasmohq/messaging";
import { enforcement } from "~background/enforcement";

interface CooldownStatusRequest {
	hostname: string;
}

interface CooldownStatusResponse {
	onCooldown: boolean;
	until?: number;
	ruleId?: string;
}

const handler: PlasmoMessaging.MessageHandler<
	CooldownStatusRequest,
	CooldownStatusResponse
> = async (req, res) => {
	try {
		const { hostname } = req.body ?? {};
		if (!hostname) {
			res.send({ onCooldown: false });
			return;
		}

		const rules = enforcement.getRules();
		const cooldowns = await enforcement.getCooldowns();

		let earliestUntil: number | null = null;
		let matchedRuleId: string | null = null;

		for (const rule of rules) {
			if (!rule.behavior.intervention) continue;
			const key = `${rule.id}::${hostname}`;
			const until = cooldowns[key];

			if (until && until > Date.now()) {
				if (!earliestUntil || until < earliestUntil) {
					earliestUntil = until;
					matchedRuleId = rule.id;
				}
			}
		}

		res.send({
			onCooldown: earliestUntil !== null,
			until: earliestUntil ?? undefined,
			ruleId: matchedRuleId ?? undefined,
		});
	} catch (error) {
		console.error("cooldown-status handler error:", error);
		res.send({ onCooldown: false });
	}
};

export default handler;

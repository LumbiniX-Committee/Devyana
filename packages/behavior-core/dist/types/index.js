export const RULES_KEY = "vinaya_rules";
export const SESSION_KEY = "vinaya_session";
export const TIME_KEY = (id) => `vinaya_time_${id}`;
export const META_KEY = (id) => `vinaya_meta_${id}`;
export const HOSTNAME_TIME_KEY = (ruleId, hostname) => `vinaya_htime_${ruleId}_${hostname}`;
export const FLUSH_ALARM = "vinaya_flush";
export const FLUSH_PERIOD_MIN = 1; // Minimum is 1 minute as per docs
export const SWITCH_DEBOUNCE_MS = 150;
export const SPA_NAV_DEBOUNCE_MS = 500;
//# sourceMappingURL=index.js.map
//! Platform window provider abstraction.
//!
//! The tracker never talks to the OS directly: it drives a `WindowProvider`
//! so tests can substitute a mock that replays a scripted sequence of focused
//! windows. The real implementation uses `active-win-pos-rs`, which covers
//! Windows, macOS and Linux (X11 + Hyprland). On Wayland/X11 where the active
//! window cannot be resolved, the provider returns `None` and the tracker
//! degrades gracefully into the focus-lost path.

/// Maximum length of a recorded window title (UTF-8 chars).
pub const MAX_TITLE_CHARS: usize = 256;

/// A focused, trackable window as seen by the tracker.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrackedWindow {
    pub process_name: String,
    pub title: String,
    pub process_id: u64,
}

/// Abstraction over the OS "get me the currently focused window" call.
pub trait WindowProvider: Send + Sync {
    /// Returns the currently focused, trackable window, or `None` when there
    /// is nothing to track (locked desktop, no window, unsupported platform,
    /// or the window was filtered for privacy).
    fn active_window(&self) -> Option<TrackedWindow>;
}

/// Real provider backed by `active-win-pos-rs`.
pub struct SystemWindowProvider;

impl WindowProvider for SystemWindowProvider {
    fn active_window(&self) -> Option<TrackedWindow> {
        let raw = active_win_pos_rs::get_active_window().ok()?;

        let title = truncate_title(&raw.title, MAX_TITLE_CHARS);
        if title.trim().is_empty() || is_sensitive_title(&title) {
            return None;
        }
        if raw.app_name.trim().is_empty() {
            return None;
        }

        Some(TrackedWindow {
            process_name: sanitize_process_name(&raw.app_name),
            title,
            process_id: raw.process_id,
        })
    }
}

/// Titles containing a sensitive term are never recorded (password fields,
/// vaults, secrets). Case-insensitive, substring match.
pub fn is_sensitive_title(title: &str) -> bool {
    const SENSITIVE: &[&str] = &[
        "password",
        "passwort",
        "passwd",
        "passphrase",
        "vault",
        "keychain",
        "secret",
        "credential",
        "otp",
        "2fa",
        "bitwarden",
        "1password",
        "proton pass",
    ];
    let lower = title.to_lowercase();
    SENSITIVE.iter().any(|term| lower.contains(term))
}

/// Truncates a window title to `max_chars` characters at a char boundary.
pub fn truncate_title(title: &str, max_chars: usize) -> String {
    title.chars().take(max_chars).collect()
}

/// Normalises a process name: strips a trailing `.exe`/`.app` and whitespace
/// so `Code.exe`, `code.exe` and `Code` collapse to a stable identity suffix.
pub fn sanitize_process_name(name: &str) -> String {
    let trimmed = name.trim();
    let trimmed = trimmed
        .strip_suffix(".exe")
        .or_else(|| trimmed.strip_suffix(".app"))
        .unwrap_or(trimmed);
    trimmed.to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncates_at_char_boundary() {
        let title = "hello world this is a long title";
        assert_eq!(truncate_title(title, 5), "hello");
        assert_eq!(truncate_title(title, 0), "");
        assert_eq!(truncate_title("éê", 1), "é");
    }

    #[test]
    fn caps_at_max_chars() {
        let long = "x".repeat(300);
        assert_eq!(truncate_title(&long, MAX_TITLE_CHARS).len(), 256);
    }

    #[test]
    fn filters_sensitive_titles() {
        assert!(is_sensitive_title("My Vault Password Manager"));
        assert!(is_sensitive_title("login - my passwd manager"));
        assert!(!is_sensitive_title("src/main.rs - Visual Studio Code"));
    }

    #[test]
    fn strips_executable_suffix() {
        assert_eq!(sanitize_process_name("code.exe"), "code");
        assert_eq!(sanitize_process_name("Code"), "Code");
        assert_eq!(sanitize_process_name("firefox.bin.exe"), "firefox.bin");
    }
}
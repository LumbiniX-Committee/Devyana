use serde::Serialize;

const RIVER_STORY_URL: &str =
    "https://www.youtube.com/watch?v=GicJjS3wXGY&list=PLVuzoIVk88hhJTjHs3yrmTjf7oBouYAg_";
const RULES_STORY_URL: &str = "https://youtu.be/yPA5YGiJONU?si=OAmgYL0tq3tZ7-Ze";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningPathway {
    pub id: String,
    pub title: String,
    pub description: String,
    pub generated_by_ai: bool,
    pub nodes: Vec<LearningLesson>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningLesson {
    pub id: String,
    pub title: String,
    pub description: String,
    #[serde(rename = "type")]
    pub lesson_type: String,
    pub content: LearningContent,
    pub status: String,
    pub position: LessonPosition,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LearningContent {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_lang: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quiz: Option<MindfulQuiz>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MindfulQuiz {
    pub title: String,
    pub generated_by_ai: bool,
    pub questions: Vec<MindfulQuizQuestion>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MindfulQuizQuestion {
    pub prompt: String,
    pub options: Vec<String>,
    pub custom_placeholder: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LessonPosition {
    pub x: i32,
    pub y: i32,
}

fn mindful_quiz(personalized_practices: &[String], generated_by_ai: bool) -> MindfulQuiz {
    let mut questions = vec![
        MindfulQuizQuestion {
            prompt: "What distracted your mind the most today?".to_string(),
            options: vec![
                "The endless scroll (Social Media)".to_string(),
                "The illusion of urgency (Overworking)".to_string(),
                "Dwelling on the past (Regret)".to_string(),
            ],
            custom_placeholder: "Another path...".to_string(),
        },
        MindfulQuizQuestion {
            prompt: "What are you quietly grateful for in this moment?".to_string(),
            options: vec![
                "The breath that carries me".to_string(),
                "The presence of loved ones".to_string(),
                "The stillness between thoughts".to_string(),
            ],
            custom_placeholder: "A silent gratitude...".to_string(),
        },
        MindfulQuizQuestion {
            prompt: "What intention will you carry into tomorrow?".to_string(),
            options: vec![
                "To listen more than I speak".to_string(),
                "To act with compassion".to_string(),
                "To release what no longer serves me".to_string(),
            ],
            custom_placeholder: "My own intention...".to_string(),
        },
    ];

    if generated_by_ai && personalized_practices.len() >= 3 {
        questions[0] = MindfulQuizQuestion {
            prompt: "Which small practice would help you meet this moment with steadiness?"
                .to_string(),
            options: personalized_practices.iter().take(3).cloned().collect(),
            custom_placeholder: "My own practice...".to_string(),
        };
    }

    MindfulQuiz {
        title: "Mindful Check-In".to_string(),
        generated_by_ai: generated_by_ai && personalized_practices.len() >= 3,
        questions,
    }
}

impl LearningPathway {
    pub fn demo(personalized_practices: &[String], generated_by_ai: bool) -> Self {
        let practice = |index: usize, fallback: &str| {
            personalized_practices
                .get(index)
                .map(|suggestion| format!("Personalized practice: {suggestion}"))
                .unwrap_or_else(|| fallback.to_string())
        };

        let text = |id: &str, title: &str, description: &str, body: String, x: i32, y: i32| {
            LearningLesson {
                id: id.to_string(),
                title: title.to_string(),
                description: description.to_string(),
                lesson_type: "text".to_string(),
                content: LearningContent {
                    body: Some(body),
                    audio_lang: Some("en-US".to_string()),
                    ..LearningContent::default()
                },
                status: "available".to_string(),
                position: LessonPosition { x, y },
            }
        };
        let video =
            |id: &str, title: &str, description: &str, url: &str, x: i32, y: i32| LearningLesson {
                id: id.to_string(),
                title: title.to_string(),
                description: description.to_string(),
                lesson_type: "video".to_string(),
                content: LearningContent {
                    video_url: Some(url.to_string()),
                    video_title: Some(title.to_string()),
                    ..LearningContent::default()
                },
                status: "available".to_string(),
                position: LessonPosition { x, y },
            };
        let quiz = |x: i32, y: i32| LearningLesson {
            id: "mindful-reflection".to_string(),
            title: "Mindful Reflection".to_string(),
            description: "A three-step check-in for attention, gratitude, and intention."
                .to_string(),
            lesson_type: "quiz".to_string(),
            content: LearningContent {
                quiz: Some(mindful_quiz(personalized_practices, generated_by_ai)),
                ..LearningContent::default()
            },
            status: "available".to_string(),
            position: LessonPosition { x, y },
        };

        Self {
            id: "eightfold-path".to_string(),
            title: "The Noble Eightfold Path".to_string(),
            description: "A calm, open journey through reflection, stories, and wise action.".to_string(),
            generated_by_ai,
            nodes: vec![
                text(
                    "right-view",
                    "Right View",
                    "See experience clearly through the Four Noble Truths.",
                    format!(
                        "Right View begins with seeing experience clearly. Suffering exists, it has causes, it can cease, and there is a practical path toward freedom.\n\nThis is not a belief to adopt. It is an invitation to notice moments of grasping, moments of release, and the quiet intelligence that appears when we stop turning away.\n\n{}",
                        practice(0, "Practice: for one minute, notice one pleasant, one unpleasant, and one neutral sensation. Observe each without adding a story.")
                    ),
                    12,
                    11,
                ),
                video(
                    "river-story",
                    "A River Is Still a River",
                    "Animated Buddhist story: Pabbatupatthara Jataka.",
                    RIVER_STORY_URL,
                    35,
                    22,
                ),
                text(
                    "right-speech",
                    "Right Speech",
                    "Speak with truth, care, usefulness, and timely restraint.",
                    format!(
                        "Right Speech asks us to treat words as actions. A sentence can soothe or unsettle, clarify or confuse, build trust or weaken it.\n\nThe training is practical: cultivate speech that is true, beneficial, gentle, and timely.\n\n{}",
                        practice(1, "Practice: before sending one message today, pause and ask: is it true, useful, and timely?")
                    ),
                    48,
                    36,
                ),
                video(
                    "too-many-rules",
                    "Too Many Rules",
                    "Animated Buddhist story: Ukkanthitabhikkhu Vatthu.",
                    RULES_STORY_URL,
                    66,
                    50,
                ),
                text(
                    "right-action",
                    "Right Action",
                    "Choose conduct that protects life, trust, and dignity.",
                    format!(
                        "Right Action brings the path into the body. It asks that our behavior reduce harm and strengthen steadiness.\n\nIn contemporary life, this includes honoring consent, stewardship, and the quiet responsibilities of care.\n\n{}",
                        practice(2, "Practice: choose one ordinary action today and perform it with full attention.")
                    ),
                    51,
                    64,
                ),
                text(
                    "right-effort",
                    "Right Effort",
                    "Use balanced energy to cultivate wholesome states.",
                    "Right Effort is neither strain nor passivity. It is the steady care that notices which seeds we are watering.\n\nThe Buddha described four efforts: prevent unwholesome states from arising, abandon those that have arisen, cultivate wholesome states, and sustain them once present.\n\nPractice: name one mental habit you want to stop feeding, and one quality you want to nourish with small repeated attention.".to_string(),
                    29,
                    77,
                ),
                quiz(39, 84),
                text(
                    "right-mindfulness",
                    "Right Mindfulness",
                    "Observe body, feeling, mind, and patterns with presence.",
                    "Right Mindfulness is the capacity to know what is happening while it is happening. It is not a special mood. It is clear presence.\n\nThe four foundations invite observation of the body, feelings, mind states, and the patterns that shape experience.\n\nPractice: take three breaths and silently note: body sitting, breath moving, mind knowing.".to_string(),
                    49,
                    88,
                ),
                text(
                    "right-concentration",
                    "Right Concentration",
                    "Gather attention into calm, clarity, and depth.",
                    "Right Concentration steadies attention until the mind becomes unified. It is cultivated through patience, ethical grounding, and repeated returning.\n\nConcentration is not escape. It supports seeing clearly by reducing the scattering that keeps us reactive.\n\nPractice: choose a single breath sensation and return to it kindly each time attention wanders. Returning is the practice.".to_string(),
                    83,
                    93,
                ),
            ],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::LearningPathway;

    #[test]
    fn demo_path_is_open_and_includes_both_video_stories() {
        let pathway = LearningPathway::demo(&[], false);

        assert!(pathway.nodes.iter().all(|node| node.status == "available"));
        assert!(pathway.nodes.iter().any(|node| {
            node.content
                .video_url
                .as_deref()
                .is_some_and(|url| url.contains("GicJjS3wXGY"))
        }));
        assert!(pathway.nodes.iter().any(|node| {
            node.content
                .video_url
                .as_deref()
                .is_some_and(|url| url.contains("yPA5YGiJONU"))
        }));
        let quiz = pathway
            .nodes
            .iter()
            .find(|node| node.lesson_type == "quiz")
            .and_then(|node| node.content.quiz.as_ref())
            .expect("default mindful quiz");
        assert_eq!(quiz.questions.len(), 3);
        assert!(!quiz.generated_by_ai);
    }
}

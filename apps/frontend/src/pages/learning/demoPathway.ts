import type { PathwayData } from "./types";

export const DEMO_LEARNING_PATHWAY: PathwayData = {
  id: "eightfold-path",
  title: "The Noble Eightfold Path",
  description: "A calm, open journey through reflection, stories, and wise action.",
  nodes: [
    {
      id: "right-view",
      title: "Right View",
      description: "See experience clearly through the Four Noble Truths.",
      type: "text",
      content: {
        audioLang: "en-US",
        body: `Right View begins with seeing experience clearly. The Buddha named this clarity through the Four Noble Truths: suffering exists, it has causes, it can cease, and there is a practical path toward freedom.

This is not a belief to adopt. It is an invitation to notice moments of grasping, moments of release, and the quiet intelligence that appears when we stop turning away.

Practice: for one minute, notice one pleasant, one unpleasant, and one neutral sensation. Observe each without adding a story.`
      },
      status: "available",
      position: { x: 12, y: 11 }
    },
    {
      id: "river-story",
      title: "A River Is Still a River",
      description: "Animated Buddhist story: Pabbatupatthara Jataka.",
      type: "video",
      content: {
        videoUrl: "https://www.youtube.com/watch?v=GicJjS3wXGY&list=PLVuzoIVk88hhJTjHs3yrmTjf7oBouYAg_",
        videoTitle: "A River Is Still a River | Pabbatupatthara Jataka"
      },
      status: "available",
      position: { x: 35, y: 22 }
    },
    {
      id: "right-speech",
      title: "Right Speech",
      description: "Speak with truth, care, usefulness, and timely restraint.",
      type: "text",
      content: {
        audioLang: "en-US",
        body: `Right Speech asks us to treat words as actions. A sentence can soothe or unsettle, clarify or confuse, build trust or weaken it.

The training is practical: avoid falsehood, divisive speech, harshness, and idle talk. In their place, cultivate speech that is true, beneficial, gentle, and timely.

Practice: before sending one message today, pause and ask: is it true, is it useful, and is this the right time?`
      },
      status: "available",
      position: { x: 48, y: 36 }
    },
    {
      id: "too-many-rules",
      title: "Too Many Rules",
      description: "Animated Buddhist story: Ukkanthitabhikkhu Vatthu.",
      type: "video",
      content: {
        videoUrl: "https://youtu.be/yPA5YGiJONU?si=OAmgYL0tq3tZ7-Ze",
        videoTitle: "Too Many Rules | Ukkanthitabhikkhu Vatthu | Dhammapada V.36"
      },
      status: "available",
      position: { x: 66, y: 50 }
    },
    {
      id: "right-action",
      title: "Right Action",
      description: "Choose conduct that protects life, trust, and dignity.",
      type: "text",
      content: {
        audioLang: "en-US",
        body: `Right Action brings the path into the body. It asks that our behavior reduce harm and strengthen steadiness.

In contemporary life, this includes honoring consent, stewardship, and the quiet responsibilities of care.

Practice: choose one ordinary action today and perform it with full attention, neither rushing nor neglecting its impact.`
      },
      status: "available",
      position: { x: 51, y: 64 }
    },
    {
      id: "right-effort",
      title: "Right Effort",
      description: "Use balanced energy to cultivate wholesome states.",
      type: "text",
      content: {
        audioLang: "en-US",
        body: `Right Effort is neither strain nor passivity. It is the steady care that notices which seeds we are watering.

The Buddha described four efforts: prevent unwholesome states from arising, abandon those that have arisen, cultivate wholesome states, and sustain them once present.

Practice: name one mental habit you want to stop feeding, and one quality you want to nourish with small repeated attention.`
      },
      status: "available",
      position: { x: 29, y: 77 }
    },
    {
      id: "mindful-reflection",
      title: "Mindful Reflection",
      description: "A three-step check-in for attention, gratitude, and intention.",
      type: "quiz",
      content: {
        quiz: {
          title: "Mindful Check-In",
          questions: [
            {
              prompt: "What distracted your mind the most today?",
              options: ["The endless scroll (Social Media)", "The illusion of urgency (Overworking)", "Dwelling on the past (Regret)"],
              customPlaceholder: "Another path..."
            },
            {
              prompt: "What are you quietly grateful for in this moment?",
              options: ["The breath that carries me", "The presence of loved ones", "The stillness between thoughts"],
              customPlaceholder: "A silent gratitude..."
            },
            {
              prompt: "What intention will you carry into tomorrow?",
              options: ["To listen more than I speak", "To act with compassion", "To release what no longer serves me"],
              customPlaceholder: "My own intention..."
            }
          ]
        }
      },
      status: "available",
      position: { x: 39, y: 84 }
    },
    {
      id: "right-mindfulness",
      title: "Right Mindfulness",
      description: "Observe body, feeling, mind, and patterns with presence.",
      type: "text",
      content: {
        audioLang: "en-US",
        body: `Right Mindfulness is the capacity to know what is happening while it is happening. It is not a special mood. It is clear presence.

The four foundations invite observation of the body, feelings, mind states, and the patterns that shape experience.

Practice: take three breaths and silently note: body sitting, breath moving, mind knowing.`
      },
      status: "available",
      position: { x: 49, y: 88 }
    },
    {
      id: "right-concentration",
      title: "Right Concentration",
      description: "Gather attention into calm, clarity, and depth.",
      type: "text",
      content: {
        audioLang: "en-US",
        body: `Right Concentration steadies attention until the mind becomes unified. It is cultivated through patience, ethical grounding, and repeated returning.

Concentration is not escape. It supports seeing clearly by reducing the scattering that keeps us reactive.

Practice: choose a single breath sensation and return to it kindly each time attention wanders. Returning is the practice.`
      },
      status: "available",
      position: { x: 83, y: 93 }
    }
  ]
};

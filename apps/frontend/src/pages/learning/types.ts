export type LessonStatus = "available" | "completed";

export interface MindfulQuizQuestion {
  prompt: string;
  options: string[];
  customPlaceholder: string;
}

export interface MindfulQuizData {
  title: string;
  generatedByAi?: boolean;
  questions: MindfulQuizQuestion[];
}

export interface LessonContent {
  body?: string;
  audioLang?: string;
  src?: string;
  poster?: string;
  videoUrl?: string;
  videoTitle?: string;
  quiz?: MindfulQuizData;
  subtitles?: Array<{ srclang: string; label: string; src: string; default?: boolean }>;
}

export interface LessonNode {
  id: string;
  title: string;
  description: string;
  type: "text" | "video" | "quiz";
  content: LessonContent;
  status: LessonStatus;
  position: { x: number; y: number };
}

export interface PathwayData {
  id: string;
  title: string;
  description: string;
  generatedByAi?: boolean;
  nodes: LessonNode[];
}

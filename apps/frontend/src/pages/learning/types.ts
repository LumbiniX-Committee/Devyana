export type LessonStatus = "available" | "completed";

export interface LessonContent {
  body?: string;
  audioLang?: string;
  src?: string;
  poster?: string;
  videoUrl?: string;
  videoTitle?: string;
  subtitles?: Array<{ srclang: string; label: string; src: string; default?: boolean }>;
}

export interface LessonNode {
  id: string;
  title: string;
  description: string;
  type: "text" | "video";
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

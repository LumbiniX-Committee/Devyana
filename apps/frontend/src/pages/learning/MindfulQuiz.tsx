import { useState } from "react";
import type { MindfulQuizData } from "./types";

interface MindfulQuizProps {
  quiz: MindfulQuizData;
}

export function MindfulQuiz({ quiz }: MindfulQuizProps) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState(() => quiz.questions.map(() => ""));
  const [customAnswers, setCustomAnswers] = useState(() => quiz.questions.map(() => ""));
  const [completed, setCompleted] = useState(false);
  const question = quiz.questions[index];
  const answer = answers[index];
  const customAnswer = customAnswers[index];
  const isLastQuestion = index === quiz.questions.length - 1;
  const canContinue = Boolean(answer.trim() || customAnswer.trim());

  const selectOption = (option: string) => {
    setAnswers((current) => current.map((answer, answerIndex) => answerIndex === index ? option : answer));
    setCustomAnswers((current) => current.map((answer, answerIndex) => answerIndex === index ? "" : answer));
  };

  const changeCustomAnswer = (value: string) => {
    setCustomAnswers((current) => current.map((answer, answerIndex) => answerIndex === index ? value : answer));
    setAnswers((current) => current.map((answer, answerIndex) => answerIndex === index ? value : answer));
  };

  const continueQuiz = () => {
    if (!canContinue) return;
    if (isLastQuestion) {
      setCompleted(true);
    } else {
      setIndex((current) => current + 1);
    }
  };

  if (!question) return null;

  if (completed) {
    return (
      <section className="mt-6 rounded-2xl border p-5 text-center" style={{ borderColor: "#E8DFC8", backgroundColor: "#FAF8F5" }} aria-label="Completed mindful reflection">
        <p className="text-xs uppercase tracking-[0.2em]" style={{ color: "#8B0000" }}>Reflection complete</p>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "#5C4B3A", fontFamily: '"Poppins", sans-serif' }}>Thank you for meeting this teaching with attention. Carry one response with you into the next moment.</p>
        <button type="button" className="mt-4 text-xs underline underline-offset-4" style={{ color: "#8B0000" }} onClick={() => { setIndex(0); setAnswers(quiz.questions.map(() => "")); setCustomAnswers(quiz.questions.map(() => "")); setCompleted(false); }}>
          Reflect again
        </button>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-2xl border p-5" style={{ borderColor: "#E8DFC8", backgroundColor: "#FAF8F5" }} aria-label={quiz.title}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em]" style={{ color: "#8B0000" }}>{quiz.title}</p>
          {quiz.generatedByAi && <p className="mt-1 text-[11px]" style={{ color: "#85705B" }}>First prompt tailored from your recent patterns</p>}
        </div>
        <span className="shrink-0 text-xs" style={{ color: "#85705B" }}>{index + 1} of {quiz.questions.length}</span>
      </div>
      <div className="mt-3 flex gap-2" aria-hidden="true">
        {quiz.questions.map((_, questionIndex) => <i key={`quiz-step-${questionIndex}`} className="h-1 flex-1 rounded-full" style={{ backgroundColor: questionIndex <= index ? "#D4AF37" : "#E8DFC8" }} />)}
      </div>
      <h3 className="mt-5 text-lg leading-relaxed" style={{ color: "#3E2A24", fontFamily: '"Poppins", sans-serif' }}>{question.prompt}</h3>
      <div className="mt-4 space-y-2">
        {question.options.map((option) => {
          const selected = answer === option && !customAnswer.trim();
          return (
            <button key={option} type="button" onClick={() => selectOption(option)} className="w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors" style={{ borderColor: selected ? "#8B0000" : "#E8DFC8", backgroundColor: selected ? "#8B0000" : "#FAF8F5", color: selected ? "#FAF8F5" : "#3E2A24", fontFamily: '"Poppins", sans-serif' }}>
              {option}
            </button>
          );
        })}
        <input type="text" value={customAnswer} onChange={(event) => changeCustomAnswer(event.target.value)} onFocus={() => { if (!customAnswer.trim()) setAnswers((current) => current.map((answer, answerIndex) => answerIndex === index ? "" : answer)); }} placeholder={question.customPlaceholder} className="w-full rounded-xl border px-4 py-3 text-sm outline-none" style={{ borderColor: customAnswer.trim() ? "#8B0000" : "#E8DFC8", color: "#3E2A24", backgroundColor: "#FAF8F5", fontFamily: '"Poppins", sans-serif' }} />
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <button type="button" className="text-xs underline underline-offset-4 disabled:no-underline disabled:opacity-40" style={{ color: "#85705B" }} onClick={() => setIndex((current) => current - 1)} disabled={index === 0}>Back</button>
        <button type="button" className="rounded-full px-4 py-2 text-xs font-medium disabled:opacity-40" style={{ color: "#3E2A24", backgroundColor: "#D4AF37" }} onClick={continueQuiz} disabled={!canContinue}>{isLastQuestion ? "Complete reflection" : "Next question"}</button>
      </div>
    </section>
  );
}

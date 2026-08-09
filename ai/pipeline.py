"""
pipeline.py
============
Core inference pipelines, ported directly from the notebook.

Public API used by server.py:
    - inference(...)                          -> source extraction + per-source verdict
    - Bad_topics(...)                         -> one-word "bad topic" flag per source URL
    - Focus_metrics(...)                      -> Mental Discipline Score (no LLM call)
    - analyze_browser_activities_as_monk(...) -> 4 Buddhist-monk-style suggestions

The model-loading, prompts, schemas, and scoring logic are unchanged from the
original notebook. The only functional addition is `_generation_lock`: since
the model is now a single shared instance serving concurrent HTTP requests
(instead of one notebook cell running at a time), calls into it are
serialized so two requests can never call `generate()` on it at once.
"""

import json
import threading
from typing import Any, Dict, List, Literal, Optional

import torch
import outlines

from pydantic import BaseModel, Field, ValidationError
from transformers import AutoModelForCausalLM, AutoTokenizer


# ============================================================
# 1. LOAD QWEN (wrapped with Outlines for structured generation)
# ============================================================

MODEL_NAME = "Qwen2.5-1.5B-Instruct"

device = "cuda" if torch.cuda.is_available() else "cpu"

hf_model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    dtype=torch.float16 if device == "cuda" else torch.float32,  # `dtype` replaces deprecated `torch_dtype`
    device_map="auto" if device == "cuda" else None,
)

if device == "cpu":
    hf_model = hf_model.to(device)

hf_model.eval()

hf_tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)

# Qwen2.5 doesn't always ship a pad token -- set one to avoid generation issues.
if hf_tokenizer.pad_token is None:
    hf_tokenizer.pad_token = hf_tokenizer.eos_token

# `model` is now directly callable: model(prompt, output_type, **gen_kwargs)
# NOTE: even when output_type is a Pydantic model, outlines only *constrains*
# generation to match the JSON schema -- it still returns a raw JSON string,
# not an already-validated instance. You must parse/validate it yourself.
model = outlines.from_transformers(hf_model, hf_tokenizer)

# Serializes every call into `model(...)`. transformers' `.generate()` isn't
# meant to be invoked concurrently from multiple threads against one model
# instance/device. FastAPI runs sync endpoint functions in a thread pool, so
# without this lock, two in-flight requests could end up generating at the
# same time and race on the same GPU/CPU model state.
_generation_lock = threading.Lock()


# ============================================================
# 2. OUTPUT SCHEMAS
# ============================================================

SourceType = Literal[
    "video",
    "article",
    "blog_post",
    "news",
    "documentation",
    "social_media",
    "podcast",
    "other",
]


class SourceAnalysis(BaseModel):
    url: str
    title: str = Field(..., description="A concise, descriptive title for the source")
    type: SourceType
    time_period: str = Field(..., description="The time period associated with this source")
    main_topic: str
    entities: List[str] = Field(
        default_factory=list, description="Important people, organizations, or products mentioned"
    )
    summary: str = Field(..., description="A short summary of the source")


class AnalysisResult(BaseModel):
    sources: List[SourceAnalysis]


VerdictLabel = Literal["Good", "Passive", "Bad"]


class Verdict(BaseModel):
    verdict: VerdictLabel


# ============================================================
# 3. PROMPT BUILDING
# ============================================================

SYSTEM_PROMPT = (
    "You are an information extraction and topic-analysis system. "
    "You are given a list of sources, each described only by its URL, "
    "a short user-provided description, and a relevant time period -- "
    "Base your analysis only on the URL, the description, and the time "
    "period. Do not invent specific facts, quotes, or statistics you "
    "cannot reasonably infer from this information."
)

VERDICT_SYSTEM_PROMPT = (
    "You are a quality-assessment system. You will be given a JSON object "
    "Judge the overall quality and coherence of this "
    "analysis and classify it with exactly one verdict: "
    '"Good" for productive tasks, "Passive" for unproductive tasks, or "Bad" for actually bad and harmful tasks..'
)


def build_prompt(
    urls: List[str],
    descriptions: List[str],
    time_periods: List[str],
) -> str:

    blocks = []

    for i, (url, description, time_period) in enumerate(
        zip(urls, descriptions, time_periods), start=1
    ):
        blocks.append(
            f"SOURCE {i}\n"
            f"URL: {url}\n"
            f"Description: {description}\n"
            f"Time period: {time_period}\n"
        )

    sources_block = "\n".join(blocks)

    return (
        f"{SYSTEM_PROMPT}\n\n"
        "Analyze every source below. For each one, identify its type, "
        "main topic, important entities, and a short summary.\n\n"
        f"{sources_block}"
    )


def build_verdict_prompt(analysis_json: str) -> str:
    return (
        f"{VERDICT_SYSTEM_PROMPT}\n\n"
        f"Analysis JSON:\n{analysis_json}\n\n"
        "Return your verdict."
    )


# ============================================================
# 4. HELPERS
# ============================================================


def _generate_and_parse(prompt: str, schema: type[BaseModel], max_new_tokens: int) -> BaseModel:
    """Call the model with a schema-constrained output_type, then parse/validate
    the returned JSON string into an instance of `schema`."""

    with _generation_lock:
        raw_output: str = model(
            prompt,
            schema,
            max_new_tokens=max_new_tokens,
        )

    # Defensive cleanup in case the model wraps the JSON in markdown fences
    # (shouldn't happen under schema-constrained decoding, but cheap to guard).
    cleaned = raw_output.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()

    try:
        return schema.model_validate_json(cleaned)
    except (ValidationError, json.JSONDecodeError) as e:
        raise RuntimeError(
            f"Model output did not match the expected schema ({schema.__name__}).\n"
            f"Raw output was:\n{raw_output}\n\nUnderlying error: {e}"
        ) from e


def inference(
    urls: List[str],
    descriptions: List[str],
    time_periods: List[str],
    max_new_tokens: Optional[int] = 1500,
    verdict_max_new_tokens: Optional[int] = 50,
) -> Dict[str, Any]:

    if not (len(urls) == len(descriptions) == len(time_periods)):
        raise ValueError(
            "urls, descriptions, and time_periods must have the same length."
        )

    # -- Stage 1: extraction --------------------------------------------
    prompt = build_prompt(urls, descriptions, time_periods)
    analysis_result: AnalysisResult = _generate_and_parse(
        prompt, AnalysisResult, max_new_tokens
    )
    analysis_dict = analysis_result.model_dump()

    # -- Stage 2: feed each source back in for its own verdict -----------
    for source_dict in analysis_dict["sources"]:
        verdict_prompt = build_verdict_prompt(
            json.dumps(source_dict, ensure_ascii=False)
        )
        verdict_result: Verdict = _generate_and_parse(
            verdict_prompt, Verdict, verdict_max_new_tokens
        )
        source_dict["verdict"] = verdict_result.verdict

    return analysis_dict


# ============================================================
# BAD TOPICS EXTRACTION (critic pipeline)
# ============================================================

class BadTopicEntry(BaseModel):
    url: str
    bad_topic: str = Field(
        ...,
        description="Exactly one word categorizing the bad topic, risk, or problematic behavior associated with this URL (e.g., 'Phishing', 'Malware', 'Piracy', 'Spam', 'Scam', or 'None' if harmless)."
    )


class BadTopicsResult(BaseModel):
    results: List[BadTopicEntry]


BAD_TOPICS_SYSTEM_PROMPT = (
    "You are a topic and behavioral risk evaluation system. "
    "You will be given a list of analyzed sources including their URLs, main topics, and summaries. "
    "For EVERY URL provided, identify the specific bad, risky, or undesirable action/topic "
    "associated with it. "
    "CRITICAL REQUIREMENT: Respond with EXACTLY ONE WORD per URL describing the bad topic or action. "
    "If the source/activity is benign or completely harmless, output 'None'."
)


def build_bad_topics_prompt(sources_data: List[Dict[str, Any]]) -> str:
    blocks = []
    for i, src in enumerate(sources_data, start=1):
        url = src.get("url", "N/A")
        topic = src.get("main_topic", "N/A")
        summary = src.get("summary", "N/A")
        blocks.append(
            f"SOURCE {i}:\n"
            f"URL: {url}\n"
            f"Topic: {topic}\n"
            f"Summary: {summary}\n"
        )

    sources_text = "\n".join(blocks)

    return (
        f"{BAD_TOPICS_SYSTEM_PROMPT}\n\n"
        f"Sources to evaluate:\n\n{sources_text}\n"
        "Analyze each URL above and output the 1-word bad topic classification for each."
    )


def Bad_topics(
    outputs: List[Dict[str, Any]],
    max_new_tokens: Optional[int] = 500
) -> List[Dict[str, str]]:
    """
    Takes a list of inference outputs (generated by the `inference` function or Stage 1),
    flattens all analyzed sources across those outputs, feeds them back into the model,
    and returns a list of dictionaries mapping each URL to a 1-word 'bad topic' classification.
    """
    # 1. Flatten and collect all source entries from the provided model outputs
    all_sources: List[Dict[str, Any]] = []
    for output in outputs:
        if "sources" in output and isinstance(output["sources"], list):
            all_sources.extend(output["sources"])
        elif "url" in output:  # In case a direct list of SourceAnalysis dicts was passed
            all_sources.append(output)

    if not all_sources:
        return []

    # 2. Build prompt for bad topic extraction
    prompt = build_bad_topics_prompt(all_sources)

    # 3. Generate structured output using existing `_generate_and_parse` helper
    parsed_result: BadTopicsResult = _generate_and_parse(
        prompt=prompt,
        schema=BadTopicsResult,
        max_new_tokens=max_new_tokens
    )

    # 4. Format into a clean list of {"url": ..., "bad_topic": ...} dicts
    return [item.model_dump() for item in parsed_result.results]


# ============================================================
# FOCUS METRICS (pure computation -- no LLM call)
# ============================================================

def Active_Focus(time_fragments, verdicts):
    """
    Calculates the Active Focus Rate (V1).
    Weights 'Good'/'P' time at 100% and 'Passive'/'N' time at 50%.
    """
    if not time_fragments:
        return 0.0

    total_active_time = sum(time_fragments)
    if total_active_time == 0:
        return 0.0

    t_p = 0  # Total Good time
    t_n = 0  # Total Passive time

    for duration, verdict in zip(time_fragments, verdicts):
        v_upper = verdict.upper()

        # Check against fully capitalized strings
        if v_upper in ['GOOD', 'P']:
            t_p += duration
        elif v_upper in ['PASSIVE', 'N']:
            t_n += duration
        # 'BAD' or 'D' are implicitly ignored since they add 0 to the score

    # Calculate V1 as a percentage (0 to 100)
    v1 = ((t_p + (0.5 * t_n)) / total_active_time) * 100
    return v1


def Focus_Fragmentation(time_fragments):
    """
    Calculates the Fragmentation Rate (V3).
    Measures the number of URL switches per active hour.
    """
    if not time_fragments:
        return 0.0

    # Convert total time from seconds to hours
    total_active_hours = sum(time_fragments) / 3600.0

    if total_active_hours == 0:
        return 0.0

    # Every new fragment (after the first) represents a switch to a new URL
    s_count = len(time_fragments) - 1

    # Calculate V3: Switches per hour
    v3 = s_count / total_active_hours
    return v3


def Focus_metrics(time_fragments, verdicts):
    """
    Calculates the final Mental Discipline Score (MDS).
    Combines Active Focus and penalizes for high Fragmentation.
    """
    # Validate inputs
    if not time_fragments or len(time_fragments) != len(verdicts):
        raise ValueError("time_fragments and verdicts must be non-empty and of equal length.")

    # Calculate base metrics
    v1 = Active_Focus(time_fragments, verdicts)
    v3 = Focus_Fragmentation(time_fragments)

    # Adjusted MDS Formula (Without V2)
    # Base score is exactly V1, penalized by fragmentation exceeding 15 switches/hour
    fragmentation_penalty = max(0, v3 - 15)
    mds = v1 - fragmentation_penalty

    # Ensure the final score stays within a clean 0 to 100 range
    final_score = max(0.0, min(100.0, mds))

    return round(final_score, 2)


# ============================================================
# MONK SUGGESTIONS PIPELINE
# ============================================================

class MonkGuidance(BaseModel):
    suggestion_1: str = Field(description="The first piece of compassionate Buddhist advice addressing the user's digital attachments.")
    suggestion_2: str = Field(description="The second piece of compassionate Buddhist advice addressing the user's digital attachments.")
    suggestion_3: str = Field(description="The third piece of compassionate Buddhist advice addressing the user's digital attachments.")
    suggestion_4: str = Field(description="The fourth piece of compassionate Buddhist advice addressing the user's digital attachments.")


def build_monk_prompt(activities: List[str]) -> str:
    """
    Constructs a ChatML prompt using the Qwen template format.
    Sets up the system prompt for the Buddhist monk persona.
    """
    activities_str = "\n".join(f"- {activity}" for activity in activities)

    prompt = (
        "<|im_start|>system\n"
        "You are a wise, serene, and compassionate Buddhist monk. "
        "You help people find inner peace, mindfulness, and freedom from attachment. "
        "Your speech is gentle, profound, and rooted in the Dharma (Buddhist teachings). Use buddism terms and language while making it clear, not vauge. Be direct.<|im_end|>\n"
        "<|im_start|>user\n"
        "I have been losing my way and engaging in these unwholesome activities on my web browser:\n"
        f"{activities_str}\n\n"
        "Please analyze these actions. Provide exactly four pieces of advice that I should do to overcome these habits.<|im_end|>\n"
        "<|im_start|>assistant\n"
    )
    return prompt


def analyze_browser_activities_as_monk(
    bad_activities: List[str],
    max_new_tokens: Optional[int] = 1000,
) -> str:
    """
    Takes a list of bad browser activities, prompts the LLM as a Buddhist monk,
    and uses Outlines to enforce a structured JSON output with exactly 4 suggestions.
    Returns a JSON-encoded string of the 4 suggestions.
    """
    if not bad_activities:
        raise ValueError("The list of bad activities cannot be empty.")

    # 1. Build the persona-driven prompt
    prompt = build_monk_prompt(bad_activities)

    # 2. Call the pre-loaded Outlines model using the existing helper
    guidance_result: MonkGuidance = _generate_and_parse(
        prompt,
        MonkGuidance,
        max_new_tokens
    )

    # 3. Use .model_dump() so json.dumps can parse it properly
    return json.dumps(guidance_result.model_dump(), indent=2, ensure_ascii=False)


# ============================================================
# STANDALONE SANITY CHECK (same test cases as the original notebook)
# Only runs when this file is executed directly, e.g. `python pipeline.py`
# -- never on `import pipeline` (i.e. never on server startup).
# ============================================================
if __name__ == "__main__":
    focused_times = [3600, 1800, 1800]  # 1hr, 30m, 30m
    focused_verdicts = ['Good', 'Passive', 'Bad']
    print(f"Focused Day Score: {Focus_metrics(focused_times, focused_verdicts)}")
    # Should output: 62.5

    distracted_times = [120] * 60
    distracted_verdicts = ['Bad', 'Good', 'Bad', 'Passive'] * 15
    print(f"Distracted Day Score: {Focus_metrics(distracted_times, distracted_verdicts)}")
    # Should output: 23.0

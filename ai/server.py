"""
server.py
=========
Secondary inference server.

Wraps the four pipelines in `pipeline.py` behind a small FastAPI HTTP API, so
the main server can call them over the network (instead of importing the
module directly and sharing a process/GPU with it).

Endpoints
---------
GET  /health                -> liveness check
POST /api/inference          -> pipeline.inference()                         (verdict analyser)
POST /api/bad-topics         -> pipeline.Bad_topics()                        (critic pipeline)
POST /api/focus-metrics      -> pipeline.Focus_metrics()                     (pure computation, no LLM)
POST /api/monk-suggestions   -> pipeline.analyze_browser_activities_as_monk()

Run with:
    uvicorn server:app --host 0.0.0.0 --port 8001

`pipeline.py` loads the model at import time, so the process will take a
while to become ready on startup -- that's expected, not a bug. `/health`
will only return 200 once the import (and therefore the model load) has
completed, since importing pipeline is what brings the app up in the first
place.
"""

import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

import pipeline

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("secondary-server")

app = FastAPI(
    title="Browser-Focus Analysis Server",
    description=(
        "Secondary server exposing the source-verdict, bad-topic-critic, "
        "focus-metric, and monk-guidance pipelines over HTTP."
    ),
    version="1.0.0",
)


# ============================================================
# REQUEST / RESPONSE SCHEMAS
# ============================================================

class InferenceRequest(BaseModel):
    urls: List[str]
    descriptions: List[str]
    time_periods: List[str]
    max_new_tokens: Optional[int] = 1500
    verdict_max_new_tokens: Optional[int] = 50


class InferenceResponse(BaseModel):
    sources: List[Dict[str, Any]]


class BadTopicsRequest(BaseModel):
    outputs: List[Dict[str, Any]] = Field(
        ...,
        description=(
            "A list of inference() outputs (each a dict with a 'sources' key), "
            "or a flat list of source dicts each containing a 'url' key."
        ),
    )
    max_new_tokens: Optional[int] = 500


class BadTopicEntryResponse(BaseModel):
    url: str
    bad_topic: str


class BadTopicsResponse(BaseModel):
    results: List[BadTopicEntryResponse]


class FocusMetricsRequest(BaseModel):
    time_fragments: List[float] = Field(
        ..., description="Duration in seconds for each browsing fragment."
    )
    verdicts: List[str] = Field(
        ..., description="One verdict per fragment: Good/Passive/Bad (or P/N/D)."
    )


class FocusMetricsResponse(BaseModel):
    mental_discipline_score: float


class MonkRequest(BaseModel):
    bad_activities: List[str]
    max_new_tokens: Optional[int] = 1000


class MonkResponse(BaseModel):
    suggestion_1: str
    suggestion_2: str
    suggestion_3: str
    suggestion_4: str


# ============================================================
# ENDPOINTS
# ============================================================

@app.get("/health")
def health() -> Dict[str, str]:
    """Liveness/readiness check. 200 implies pipeline.py has finished
    importing, which means the model is already loaded."""
    return {"status": "ok", "device": pipeline.device, "model": pipeline.MODEL_NAME}


@app.post("/api/inference", response_model=InferenceResponse)
def run_inference(req: InferenceRequest):
    """Verdict analyser: extracts per-source info (type, topic, entities,
    summary) and attaches a Good/Passive/Bad verdict to each source."""
    try:
        result = pipeline.inference(
            urls=req.urls,
            descriptions=req.descriptions,
            time_periods=req.time_periods,
            max_new_tokens=req.max_new_tokens,
            verdict_max_new_tokens=req.verdict_max_new_tokens,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        logger.exception("inference() failed to parse model output")
        raise HTTPException(status_code=502, detail=str(e)) from e
    return result


@app.post("/api/bad-topics", response_model=BadTopicsResponse)
def run_bad_topics(req: BadTopicsRequest):
    """Critic pipeline: flags a single-word bad-topic classification
    ('Phishing', 'Malware', 'None', ...) per URL."""
    try:
        results = pipeline.Bad_topics(
            outputs=req.outputs,
            max_new_tokens=req.max_new_tokens,
        )
    except RuntimeError as e:
        logger.exception("Bad_topics() failed to parse model output")
        raise HTTPException(status_code=502, detail=str(e)) from e
    return {"results": results}


@app.post("/api/focus-metrics", response_model=FocusMetricsResponse)
def run_focus_metrics(req: FocusMetricsRequest):
    """Pure computation, no LLM call: Mental Discipline Score from time
    fragments + verdicts."""
    try:
        score = pipeline.Focus_metrics(req.time_fragments, req.verdicts)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"mental_discipline_score": score}


@app.post("/api/monk-suggestions", response_model=MonkResponse)
def run_monk_suggestions(req: MonkRequest):
    """Buddhist-monk-style guidance: exactly 4 suggestions addressing the
    given list of bad browser activities."""
    try:
        raw_json = pipeline.analyze_browser_activities_as_monk(
            bad_activities=req.bad_activities,
            max_new_tokens=req.max_new_tokens,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        logger.exception("analyze_browser_activities_as_monk() failed to parse model output")
        raise HTTPException(status_code=502, detail=str(e)) from e

    return json.loads(raw_json)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="0.0.0.0", port=8001, reload=False)

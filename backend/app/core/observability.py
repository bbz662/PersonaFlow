from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any


logger = logging.getLogger("personaflow.observability")


def log_observability_event(
    event: str,
    *,
    level: str = "info",
    **fields: Any,
) -> None:
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "scope": "backend",
        "event": event,
        **fields,
    }
    writer = getattr(logger, level, logger.info)
    writer(json.dumps(payload, default=str, ensure_ascii=True, sort_keys=True))

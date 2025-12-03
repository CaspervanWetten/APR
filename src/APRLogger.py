import json
import logging
import os
import uuid
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler

# ---- Minimal JSON formatter -------------------------------------------------


class JsonFormatter(logging.Formatter):
    def __init__(self, fields=None):
        super().__init__()
        self.fields = fields or []

    def format(self, record):
        log_object = {
            "datetime_utc": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
        }

        if isinstance(record.msg, dict):
            log_object.update(record.msg)
        else:
            log_object["message"] = record.getMessage()

        # Filter to specified fields and remove any keys with None values.
        if self.fields:
            payload = {
                k: v
                for k, v in ((k, log_object.get(k)) for k in self.fields)
                if v is not None
            }
            extras = {
                k: v for k, v in log_object.items()
                if k not in self.fields and v is not None and v != ""
            }
            payload.update(extras)
        else:
            payload = log_object

        try:
            return json.dumps(payload, ensure_ascii=False) + "\n"
        except (TypeError, ValueError) as e:
            fallback = {
                "datetime_utc": log_object["datetime_utc"],
                "level": "ERROR",
                "logger": record.name,
                "message": f"Logging error: {e}",
            }
            return json.dumps(fallback, ensure_ascii=False) + "\n"


DEFAULT_LOG_FIELDS = [
    "datetime_utc", "gebruikersID", "sessieID", "transactieID",
    "activiteitID", "event_type", "event_source", "gebruikteModel",
    "external_model_id", "function_call", "stackTrace", "error_message",
    "dataID", "input_content_hash", "dataSize_bytes", "raw_input",
    "model_output", "performance_metric", "ground_truth_id",
    "performance_degradation_signal", "model_leakage_signal",
    "intervention_format()type", "intervening_user_id", "original_output",
    "corrected_output", "intervention_reason", "user_action",
    "interaction_duration_ms", "risk_indicator", "system_limit_exceeded",
    "out_of_scope_usage_signal", "message"
]

# ---- Logger setup -----------------------------------------------------------


def _get_log_path(prefix, directory="./tmp/logs"):
    os.makedirs(directory, exist_ok=True)
    # Use a fixed file per prefix, with rotation.
    filename = f"{prefix}.jsonl"
    return os.path.join(directory, filename)


def setup_logger(*, name, log_file, level=logging.INFO, log_fields=None):
    logger = logging.getLogger(name)
    logger.setLevel(level)
    logger.propagate = False

    if logger.handlers:
        return logger

    log_fields = log_fields or DEFAULT_LOG_FIELDS
    formatter = JsonFormatter(log_fields)

    handler = RotatingFileHandler(
        log_file,
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=5,
        encoding="utf-8"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    return logger

# ---- Logger Instances -------------------------------------------------------


technical_logger = setup_logger(
    name="technical_logger",
    log_file=_get_log_path(prefix="technical"),
    log_fields=DEFAULT_LOG_FIELDS
)

administrative_logger = setup_logger(
    name="administrative_logger",
    log_file=_get_log_path(prefix="administrative"),
    log_fields=DEFAULT_LOG_FIELDS
)

# ---- Private helpers --------------------------------------------------------


def _clean(obj):
    """
    Recursively remove keys with None or "" values from dicts/lists.
    """
    if isinstance(obj, dict):
        cleaned = {}
        for k, v in obj.items():
            v_clean = _clean(v)
            if v_clean is None or v_clean == "":
                continue
            cleaned[k] = v_clean
        return cleaned
    if isinstance(obj, list):
        cleaned_list = [_clean(v) for v in obj]
        cleaned_list = [v for v in cleaned_list if not (v is None or v == "")]
        return cleaned_list
    return obj


def _log(logger, level, event_type, event_source, data):
    base = {
        "activiteitID": str(uuid.uuid4()),
        "event_type": event_type,
        "event_source": event_source,
    }
    merged = {**base, **(data or {})}
    cleaned = _clean(merged)
    logger.log(level, cleaned)

# ---- Public API -------------------------------------------------------------


def technical_log(event_source, **data):
    """
    For engineering/diagnostic events.
    Usage:
        technical_log("my_service", gebruikersID="u1", message="Cache miss", ...)
    """
    _log(technical_logger, logging.INFO, "technical", event_source, data)


def administrative_log(event_source, **data):
    """
    For administrative/governance/audit events.
    Usage:
        administrative_log("my_service", gebruikersID="u1", user_action="role_change", ...)
    """
    _log(administrative_logger, logging.INFO,
         "administrative", event_source, data)


# ---- Example ----------------------------------------------------------------
if __name__ == "__main__":
    print(f"Writing technical logs to: {_get_log_path(prefix='technical')}")
    print(
        f"Writing administrative logs to: {_get_log_path(prefix='administrative')}")

    # Technical event (null/"" fields will be removed)
    technical_log(
        "app.py",
        gebruikersID="user_123",
        sessieID=str(uuid.uuid4()),
        transactieID=str(uuid.uuid4()),
        function_call="fetch_data",
        detail="started",
        optional_note="",            # will be removed
        debug_value=None             # will be removed
    )

    # Administrative event
    administrative_log(
        "admin_panel",
        gebruikersID="user_123",
        user_action="permission_update",
        intervening_user_id="admin_42",
        risk_indicator="low"
    )

    administrative_log(
        "Modify input",
        gebruikersID="user_1234",
        user_action="modified time value",
        intervening_user_id="admin_42",
        risk_indicator="medium",
        WAAALUIGI="waluigi"
    )

    print("Done.")

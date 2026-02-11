"""Logging configuration for the Zillow agent."""

import logging
import os
import sys
import uuid
from logging.handlers import RotatingFileHandler

# Default log format
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
LOG_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

# Log rotation settings
LOG_MAX_BYTES = 10 * 1024 * 1024  # 10 MB
LOG_BACKUP_COUNT = 5

# Noisy loggers to silence
NOISY_LOGGERS = [
    "boto",
    "boto3",
    "botocore",
    "urllib3",
    "s3transfer",
    "httpx",
    "httpcore",
    "openai",
    "langchain",
    "langsmith",
    "watchfiles",
]


def setup_logging(name: str = "zillow_agent") -> logging.Logger:
    """
    Set up and return a configured logger.

    By default, logs to console (StreamHandler). If LOG_FILE_ENABLED=true,
    also logs to a file with a UUID filename.

    Args:
        name: Logger name.

    Returns:
        Configured logger instance.
    """
    logger = logging.getLogger(name)

    # Avoid adding handlers multiple times
    if logger.handlers:
        return logger

    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    logger.setLevel(getattr(logging, log_level, logging.INFO))

    formatter = logging.Formatter(LOG_FORMAT, datefmt=LOG_DATE_FORMAT)

    # Console handler (StreamHandler) - always enabled
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # File handler - enabled if LOG_FILE_ENABLED=true
    log_file_enabled = os.getenv("LOG_FILE_ENABLED", "false").lower() == "true"
    if log_file_enabled:
        log_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "logs")
        os.makedirs(log_dir, exist_ok=True)
        log_filename = os.path.join(log_dir, f"zillow_agent_{uuid.uuid4()}.log")
        file_handler = RotatingFileHandler(
            log_filename,
            maxBytes=LOG_MAX_BYTES,
            backupCount=LOG_BACKUP_COUNT,
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
        logger.info("Logging to file: %s", log_filename)

    # Silence noisy third-party loggers
    for noisy_logger in NOISY_LOGGERS:
        logging.getLogger(noisy_logger).setLevel(logging.WARNING)

    return logger


# Global logger instance
logger = setup_logging()

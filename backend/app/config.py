from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    groq_api_key: str = ""
    groq_base_url: str = "https://api.groq.com/openai/v1"
    primary_model: str = "openai/gpt-oss-120b"
    fallback_model: str = "openai/gpt-oss-20b"
    allowed_origins: str = "http://localhost:3000"

    # gpt-oss are reasoning models: reasoning tokens count toward the completion cap,
    # so it must be well above the spoken reply length.
    max_completion_tokens: int = 500
    reasoning_effort: str = "low"
    temperature: float = 0.4
    llm_timeout_s: float = 8.0
    # If both models are rate limited, wait up to this long and retry once before giving up.
    max_rate_limit_wait_s: float = 8.0

    max_message_chars: int = 500
    max_history_messages: int = 8
    max_history_chars: int = 600
    max_reply_chars: int = 600

    dossier_path: Path = BASE_DIR / "data" / "yasmin_profile.json"

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()

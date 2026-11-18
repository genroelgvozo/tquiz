from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    admin_password: str = Field(min_length=1)
    secret_key: str = Field(min_length=8)  # signs cookies and the screen key
    public_url: str = "http://localhost:5173"
    data_dir: Path = Path("data")
    static_dir: Path | None = None

    @property
    def secure_cookies(self) -> bool:
        return self.public_url.startswith("https")

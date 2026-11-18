from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    admin_password: str
    secret_key: str
    public_url: str = "http://localhost:5173"
    data_dir: Path = Path("data")
    static_dir: Path | None = None

    @property
    def secure_cookies(self) -> bool:
        return self.public_url.startswith("https")

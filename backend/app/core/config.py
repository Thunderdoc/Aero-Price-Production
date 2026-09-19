from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./aeroprice.db"

    # Auth
    SECRET_KEY: str = "dev-insecure-key-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    ALGORITHM: str = "HS256"

    # Collection
    COLLECTION_INTERVAL_MINUTES: int = 60
    COLLECTION_ENABLED: bool = True
    ALLORIGINS_BASE: str = "https://api.allorigins.win/get?url="

    # Airline API keys (blank = CHALLENGE_DETECTED)
    INDIGO_API_KEY: str = ""
    INDIGO_NDC_ENDPOINT: str = ""
    AIRINDIA_API_KEY: str = ""
    AIRINDIA_NDC_ENDPOINT: str = ""
    AKASA_API_KEY: str = ""
    AKASA_NDC_ENDPOINT: str = ""
    SPICEJET_API_KEY: str = ""
    SPICEJET_NDC_ENDPOINT: str = ""

    # Authorized aggregator (generic)
    AGGREGATOR_PROVIDER: str = ""
    AGGREGATOR_API_KEY: str = ""
    AGGREGATOR_BASE_URL: str = ""

    # Amadeus Self-Service API (recommended aggregator)
    # Register at: https://developers.amadeus.com/
    # Free sandbox tier: https://test.api.amadeus.com
    AMADEUS_API_KEY: str = ""
    AMADEUS_API_SECRET: str = ""
    AMADEUS_BASE_URL: str = "https://test.api.amadeus.com"  # switch to https://api.amadeus.com for production
    # AMADEUS_ENV controls provenance tagging — default sandbox for safety.
    # "sandbox"    → data_origin="SANDBOX_TEST"; records stored but excluded from live analytical path.
    # "production" → data_origin="REAL" only after all 5 production conditions pass.
    # Never set to "production" unless AMADEUS_BASE_URL also points to api.amadeus.com.
    AMADEUS_ENV: str = "sandbox"

    # Government data
    DGCA_STATS_URL: str = "https://dgca.gov.in/digigov-portal/"
    MOSPI_ESANKHYIKI_URL: str = ""
    DATAGOV_AVIATION_DATASET_ID: str = ""

    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:8443"

    # Data mode
    # live = only real collected/official data returned
    # demo = generated fixtures allowed (tagged GENERATED_TEST)
    DATA_MODE: str = "live"

    # Environment
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    @property
    def allowed_origins_list(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

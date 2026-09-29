from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator
from typing import List
import logging


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./aeroprice.db"

    # Auth
    SECRET_KEY: str = "local-development-only-change-me"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    ALGORITHM: str = "HS256"

    # Firebase token verification and server-side role mapping
    FIREBASE_PROJECT_ID: str = ""
    FIREBASE_ADMIN_EMAILS: str = ""
    FIREBASE_ANALYST_EMAILS: str = ""

    # Collection
    COLLECTION_INTERVAL_MINUTES: int = 60
    COLLECTION_ENABLED: bool = True
    CRON_SECRET: str = ""

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
    # Official public pages.  These are fetched by the backend directly (never
    # through a browser CORS proxy), so the audit trail stays on the source site.
    DGCA_STATS_URL: str = "https://dgca.gov.in/digigov-portal/?page=statisticsMenu/airTransportStatistics/monthlystatistics/monthlypassengerstatistics.html"
    DGCA_CIRCULARS_URL: str = "https://dgca.gov.in/digigov-portal/?page=newsdetail/officecircular/officecircular.html"
    DGCA_FLEET_URL: str = "https://dgca.gov.in/digigov-portal/"
    MOSPI_ESANKHYIKI_URL: str = "https://esankhyiki.mospi.gov.in/"
    # Current eSankhyiki routes live under /api/cpi.  The older /api/getCPIIndex
    # path now falls through to the portal HTML shell, which is not JSON data.
    MOSPI_CPI_API_URL: str = "https://api.mospi.gov.in/api/cpi/getCPIIndex"
    MOSPI_API_EMAIL: str = ""
    MOSPI_API_PASSWORD: str = ""
    # Set this to a verified official CSV download URL when MoSPI publishes the
    # current CPI Transport file. Blank deliberately means "not configured".
    MOSPI_CPI_CSV_URL: str = ""
    DATAGOV_AVIATION_DATASET_ID: str = ""
    DATAGOV_API_KEY: str = ""
    PPAC_ATF_URL: str = "https://ppac.gov.in/prices/excise-duty-on-export-of-petrol-diesel-atf-and-special-additional-excise-duty-saed-on-domestic-crude-oil-production"

    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:8443,http://127.0.0.1:5173,http://127.0.0.1:8443,https://aero-price-production.vercel.app"

    # Duffel Air — authorized REST API aggregator
    # Register at https://app.duffel.com/join
    # Generate token: Developers > Access Tokens
    #   test token  ("duffel_test_*")  → SANDBOX_TEST provenance — safe for development
    #   live token  ("duffel_live_*")  → REAL provenance when live_mode=true in response
    # Never commit this value — set in backend/.env only.
    DUFFEL_API_TOKEN: str = ""

    # Optional keyed live-tracking provider. ADSB.lol remains the keyless
    # default; Aviation Edge is preferred when a valid server-side key exists.
    AVIATION_EDGE_API_KEY: str = ""
    AVIATIONSTACK_API_KEY: str = ""
    CARTO_API_KEY: str = ""

    # Server-side search providers. Never expose these as VITE_* browser vars.
    SERPER_API_KEY: str = ""
    SERPAPI_API_KEY: str = ""
    GOOGLEFLIGHTS_WORKER_COMMAND: str = ""
    SCRAPLING_ENABLED: bool = True
    SCRAPLING_HEADLESS: bool = True

    # Data mode
    # live = only real collected/official data returned
    # demo = generated fixtures allowed (tagged GENERATED_TEST)
    DATA_MODE: str = "live"

    # Environment
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    @property
    def allowed_origins_list(self) -> List[str]:
        # Browsers send an Origin without a trailing slash. Normalize the
        # Render/Vercel setting so either pasted form works reliably.
        return [origin.strip().rstrip("/") for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

    @property
    def sqlalchemy_database_url(self) -> str:
        """Use an async SQLAlchemy driver for Render/Postgres URLs."""
        if self.DATABASE_URL.startswith("postgres://"):
            return self.DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
        if self.DATABASE_URL.startswith("postgresql://"):
            return self.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
        return self.DATABASE_URL

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def amadeus_configured(self) -> bool:
        return bool(self.AMADEUS_API_KEY.strip() and self.AMADEUS_API_SECRET.strip())

    @property
    def duffel_configured(self) -> bool:
        return bool(self.DUFFEL_API_TOKEN.strip())

    @property
    def aviationstack_configured(self) -> bool:
        return bool(self.AVIATIONSTACK_API_KEY.strip())

    def log_credential_status(self) -> None:
        logger = logging.getLogger(__name__)
        if not self.COLLECTION_ENABLED:
            logger.info("Collection enabled: False")
            logger.warning("Collection is DISABLED")
            return
        configured = 0
        if self.amadeus_configured:
            configured += 1
            logger.info("Amadeus API credentials configured")
        else:
            logger.warning("Amadeus API credentials NOT configured")
        if self.duffel_configured:
            configured += 1
            logger.info("Duffel API token configured")
        else:
            logger.warning("Duffel API token NOT configured")
        if self.aviationstack_configured:
            configured += 1
            logger.info("AviationStack API key configured")
        logger.info(f"Total configured sources: {configured}")
        if configured == 0:
            logger.error("NO EXTERNAL API CREDENTIALS CONFIGURED")

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

    @model_validator(mode="after")
    def validate_security(self):
        if self.is_production and (len(self.SECRET_KEY) < 32 or self.SECRET_KEY == "local-development-only-change-me"):
            raise ValueError("SECRET_KEY must be a non-default value of at least 32 characters in production")
        if "*" in self.ALLOWED_ORIGINS:
            raise ValueError("Wildcard CORS origins are not allowed")
        return self


settings = Settings()

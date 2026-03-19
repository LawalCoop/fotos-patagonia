from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Database settings
    POSTGRES_USER: str = "root"
    POSTGRES_PASSWORD: str = "root"
    POSTGRES_DB: str = "fotopatagonia"
    POSTGRES_HOST: str = "db"
    ENVIRONMENT: str | None = None
    
    @property
    def DATABASE_URL(self) -> str:
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}/{self.POSTGRES_DB}"

    # JWT settings
    SECRET_KEY: str = "a_super_secret_key_that_should_be_changed"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080

    # S3 settings
    S3_ENDPOINT_URL: str | None = None
    S3_ACCESS_KEY_ID: str | None = None
    S3_SECRET_ACCESS_KEY: str | None = None
    S3_BUCKET_NAME: str | None = None
    # Use this for URLs returned to browser clients.
    # In docker compose, the backend can reach S3 via the internal service name (e.g. minio:9000)
    # while the browser must use a public endpoint (e.g. localhost:9000).
    S3_PUBLIC_URL: str | None = None
    # Allow a second env var name to support existing setups.
    PUBLIC_S3_ENDPOINT: str | None = None
    S3_REGION: str | None = None
    STORAGE_ALLOWED_ORIGINS: str | None = None

    @property
    def s3_public_endpoint(self) -> str | None:
        """Return the URL that should be used in presigned URLs returned to browsers."""
        return self.S3_PUBLIC_URL or self.PUBLIC_S3_ENDPOINT

    FIRST_SUPERUSER_EMAIL: str = "admin@example.com" # Provide a default value
    FIRST_SUPERUSER_PASSWORD: str = "changeme" # Provide a default value

    # Mercado Pago settings
    MERCADOPAGO_ACCESS_TOKEN: str | None = None
    MERCADOPAGO_SUCCESS_URL: str = "https://somosfotospatagonia.com/checkout/success"
    MERCADOPAGO_FAILURE_URL: str = "https://somosfotospatagonia.com/checkout/error"
    MERCADOPAGO_PENDING_URL: str = "https://somosfotospatagonia.com/checkout/success"
    MERCADOPAGO_NOTIFICATION_URL: str = "https://somosfotospatagonia.com/api/checkout/mercadopago/webhook"

    FRONTEND_URL: str = "http://192.168.1.20:3001"

    EMAIL_FROM: str = "Fotos Patagonia <hola@somosfotospatagonia.com>"
    RESEND_API_KEY: str = ""

    @property
    def storage_allowed_origins(self) -> list[str]:
        """
        Returns the list of origins that are allowed to talk directly to the storage layer.
        Defaults to localhost origins for dev usage when no env var is provided.
        """
        default_origins = [
            "http://localhost:3001",
            "http://127.0.0.1:3000",
            "http://192.168.1.20:3001"
        ]
        if not self.STORAGE_ALLOWED_ORIGINS:
            return default_origins

        parsed = [origin.strip() for origin in self.STORAGE_ALLOWED_ORIGINS.split(",") if origin.strip()]
        return parsed or default_origins

    class Config:
        env_file = ".env"
        env_file_encoding = 'utf-8'

settings = Settings()
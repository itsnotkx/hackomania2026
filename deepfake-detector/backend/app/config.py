from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Deepfake Detector"
    version: str = "1.0.0"
    allowed_origins: list[str] = ["*"]
    # NII Yamagishi Lab AntiDeepfake model - trained on ASVspoof 2021 DF + 74k hours of data
    model_id: str = "nii-yamagishilab/wav2vec-large-anti-deepfake"
    sample_rate: int = 16000
    chunk_duration_ms: int = 2000
    # chunk_bytes = sample_rate * (chunk_duration_ms/1000) * 2 bytes per int16
    chunk_bytes: int = 64000
    threshold_real_max: float = 0.3
    threshold_fake_min: float = 0.7
    rolling_window_size: int = 5
    max_chunk_duration_ms: int = 5000


settings = Settings()

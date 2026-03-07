from fastapi import APIRouter

from app.config import settings
from app.models.schemas import HealthResponse
from app.services import inference

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        status="ok" if inference.is_ready() else "loading",
        model_loaded=inference.is_ready(),
        version=settings.version,
    )
